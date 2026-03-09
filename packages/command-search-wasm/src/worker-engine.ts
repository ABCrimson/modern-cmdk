// Main-thread wrapper that creates a dedicated Web Worker running the WASM search engine
// Uses: Promise.withResolvers(), await using / AsyncDisposable, Iterator Helpers, branded ItemId
// Falls back to main-thread WASM when SharedArrayBuffer is unavailable (no COOP/COEP)

import type { CommandItem, ItemId, SearchEngine, SearchResult } from '@crimson_dev/command';
import type { WorkerMessage, WorkerResponse } from './worker.js';

// ─── Configuration ───────────────────────────────────────────────────────────

/** Configuration options for the worker-based search engine */
export interface WorkerSearchEngineOptions {
  /** Maximum number of results to return per search (default: 50) */
  readonly maxResults?: number | undefined;
}

// ─── Public interface ────────────────────────────────────────────────────────

/** Extended search engine that runs WASM in a Web Worker */
export interface WorkerSearchEngine extends SearchEngine, AsyncDisposable {
  readonly isWasm: true;
  readonly isWorker: true;
  /** Whether SharedArrayBuffer is used for zero-copy score transfer */
  readonly useSharedMemory: boolean;
  /**
   * Async search — preferred API for worker-based engines.
   * Returns a promise of results instead of a synchronous iterator.
   * The synchronous `search()` method yields from the most recent
   * async search result cache for compatibility with the SearchEngine interface.
   */
  searchAsync(query: string, maxResults?: number): Promise<readonly SearchResult[]>;
}

// ─── SharedArrayBuffer detection ─────────────────────────────────────────────

/**
 * Detect whether SharedArrayBuffer is available.
 * Requires crossOriginIsolated (COOP + COEP headers) in browsers.
 */
function isSharedArrayBufferAvailable(): boolean {
  try {
    return (
      typeof SharedArrayBuffer !== 'undefined' &&
      typeof crossOriginIsolated !== 'undefined' &&
      crossOriginIsolated
    );
  } catch {
    return false;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a worker-based WASM search engine.
 *
 * The WASM module runs in a dedicated Web Worker for off-main-thread search.
 * When SharedArrayBuffer is available, Float32Array scores are transferred
 * via zero-copy shared memory. Otherwise, results are sent via structured clone.
 *
 * Falls back to main-thread WASM if Worker construction fails entirely.
 * Use `await using engine = await createWorkerSearchEngine()` for automatic cleanup.
 *
 * @returns An async-disposable WorkerSearchEngine backed by a Web Worker
 */
export async function createWorkerSearchEngine(
  options?: WorkerSearchEngineOptions,
): Promise<WorkerSearchEngine> {
  const maxResultsLimit = options?.maxResults ?? 50;
  const sharedMemoryAvailable = isSharedArrayBufferAvailable();

  // Pre-allocate SharedArrayBuffer for score transfer if available
  // Sized for maxResults float32 values (4 bytes each)
  const scoresBuffer: SharedArrayBuffer | null = sharedMemoryAvailable
    ? new SharedArrayBuffer(maxResultsLimit * Float32Array.BYTES_PER_ELEMENT)
    : null;

  // ── Worker lifecycle ───────────────────────────────────────────────────────

  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

  // Wait for the worker to signal readiness (WASM module loaded)
  const {
    promise: readyPromise,
    resolve: readyResolve,
    reject: readyReject,
  } = Promise.withResolvers<void>();

  // ── Request queue ──────────────────────────────────────────────────────────

  // Sequential request queue — the worker processes one message at a time.
  // Each in-flight request gets its own Promise.withResolvers().
  interface PendingRequest {
    readonly resolve: (value: WorkerResponse) => void;
    readonly reject: (reason: unknown) => void;
  }

  let pending: PendingRequest | null = null;
  let disposed = false;

  // ── Cached results for sync iterator ───────────────────────────────────────

  // The SearchEngine.search() interface returns a synchronous IteratorObject.
  // Worker communication is async, so the sync method yields from a cache
  // populated by the most recent searchAsync() call.
  let cachedResults: readonly SearchResult[] = [];

  // ── Message handling ───────────────────────────────────────────────────────

  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;

    if (response.type === 'ready') {
      readyResolve();
      return;
    }

    if (pending) {
      if (response.type === 'error') {
        pending.reject(new Error(response.message));
      } else {
        pending.resolve(response);
      }
      pending = null;
    }
  });

  worker.addEventListener('error', (event: ErrorEvent) => {
    const error = new Error(`Worker error: ${event.message}`);
    if (pending) {
      pending.reject(error);
      pending = null;
    } else {
      readyReject(error);
    }
  });

  // Block until WASM is loaded in the worker
  await readyPromise;

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Send a message to the worker and wait for its response.
   * Uses Promise.withResolvers() for clean async request tracking.
   */
  function postAndWait(message: WorkerMessage): Promise<WorkerResponse> {
    if (disposed) {
      return Promise.reject(new Error('WorkerSearchEngine has been disposed'));
    }

    const { promise, resolve, reject } = Promise.withResolvers<WorkerResponse>();
    pending = { resolve, reject };
    worker.postMessage(message);
    return promise;
  }

  // Track the last set of indexed items for re-indexing after remove
  let lastIndexedItems: readonly CommandItem[] = [];

  // ── Engine implementation ──────────────────────────────────────────────────

  const engine: WorkerSearchEngine = {
    isWasm: true,
    isWorker: true,
    useSharedMemory: sharedMemoryAvailable,

    index(items: readonly { id: ItemId; value: string }[]): void {
      lastIndexedItems = items;
      const serialized = JSON.stringify(
        items
          .values()
          .map((item) => [item.id, item.value])
          .toArray(),
      );
      // Fire-and-forget — matches the synchronous SearchEngine.index() signature
      void postAndWait({ type: 'index', items: serialized });
    },

    *search(_query: string, _items: readonly { id: ItemId }[]): IteratorObject<SearchResult> {
      // Yields from the cache populated by the most recent searchAsync() call.
      // Callers should use searchAsync() and then iterate, or the state machine's
      // async adapter will call searchAsync() before reading from this iterator.
      yield* cachedResults;
    },

    async searchAsync(query: string, maxResults?: number): Promise<readonly SearchResult[]> {
      const limit = maxResults ?? maxResultsLimit;

      if (scoresBuffer) {
        // ── SharedArrayBuffer path: zero-copy score transfer ──────────────
        const response = await postAndWait({
          type: 'search',
          query,
          maxResults: limit,
          scoresBuffer,
        });

        if (response.type === 'results-sab') {
          const scoresView = new Float32Array(scoresBuffer);
          const results: readonly SearchResult[] = response.ids
            .values()
            .map(
              (id, index): SearchResult => ({
                id: id as ItemId,
                score: scoresView[index] as number,
                matches: response.matches[index] as Array<[number, number]>,
              }),
            )
            .toArray();

          cachedResults = results;
          return results;
        }

        // Unexpected response type — return empty
        cachedResults = [];
        return cachedResults;
      }

      // ── Structured clone fallback ────────────────────────────────────────
      const response = await postAndWait({
        type: 'search',
        query,
        maxResults: limit,
      });

      if (response.type === 'results') {
        const results: readonly SearchResult[] = response.results
          .values()
          .map(
            (result): SearchResult => ({
              id: result.id as ItemId,
              score: result.score,
              matches: result.matches,
            }),
          )
          .toArray();

        cachedResults = results;
        return results;
      }

      cachedResults = [];
      return cachedResults;
    },

    remove(ids: ReadonlySet<ItemId>): void {
      // WASM index is immutable — clear and re-index without removed items
      const remaining = lastIndexedItems
        .values()
        .filter((item) => !ids.has(item.id))
        .toArray();

      lastIndexedItems = remaining;

      void postAndWait({ type: 'clear' }).then(() => {
        if (remaining.length > 0) {
          const serialized = JSON.stringify(
            remaining
              .values()
              .map((item) => [item.id, item.value])
              .toArray(),
          );
          return postAndWait({ type: 'index', items: serialized });
        }
        return undefined;
      });
    },

    clear(): void {
      lastIndexedItems = [];
      cachedResults = [];
      void postAndWait({ type: 'clear' });
    },

    [Symbol.dispose](): void {
      if (!disposed) {
        disposed = true;
        worker.postMessage({ type: 'dispose' } satisfies WorkerMessage);
        worker.terminate();
      }
    },

    async [Symbol.asyncDispose](): Promise<void> {
      if (!disposed) {
        disposed = true;
        try {
          await postAndWait({ type: 'dispose' });
        } catch {
          // Worker may already be closed — safe to ignore
        }
        worker.terminate();
      }
    },
  };

  return engine;
}
