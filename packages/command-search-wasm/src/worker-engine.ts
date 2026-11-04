// Main-thread wrapper that creates a dedicated Web Worker running the WASM search engine
// Uses: Promise.withResolvers(), Symbol.dispose / Symbol.asyncDispose (works with `await using`), Iterator Helpers (ES2025), branded ItemId
// Search runs in the Web Worker when one can be created; SharedArrayBuffer only carries the scores when the page is
// cross-origin isolated (COOP + COEP), otherwise they are structured-cloned.
// Falls back to main-thread WASM when the Worker cannot be created or fails before it is ready.

import type { CommandItem, ItemId, SearchEngine, SearchResult } from 'modern-cmdk';
import { isDev } from './env.js';
import { createWasmSearchEngine } from './wasm-engine.js';
import type { WorkerMessage, WorkerResponse } from './worker.js';

// ─── Configuration ───────────────────────────────────────────────────────────

/** Configuration options for the worker-based search engine */
export interface WorkerSearchEngineOptions {
  /** Maximum number of results to return per search (default: 50) */
  readonly maxResults?: number | undefined;
}

// ─── Public interface ────────────────────────────────────────────────────────

/** Search engine returned when no Worker could be used: the main-thread engine, async-shaped. */
export interface MainThreadSearchEngine extends SearchEngine, AsyncDisposable {
  /** `false` when the main-thread engine itself fell back to the TypeScript scorer */
  readonly isWasm: boolean;
  readonly isWorker: false;
  readonly useSharedMemory: false;
  /** Searches the items last passed to `index()`, on the calling thread. */
  searchAsync(query: string, maxResults?: number): Promise<readonly SearchResult[]>;
}

/** Extended search engine that runs WASM in a Web Worker */
export interface WorkerSearchEngine extends SearchEngine, AsyncDisposable {
  readonly isWasm: true;
  readonly isWorker: true;
  /** Whether scores travel in a SharedArrayBuffer (only when cross-origin isolated) */
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
 * The WASM module runs in a dedicated Web Worker, so search happens off the main thread.
 * When the page is cross-origin isolated (COOP + COEP), the Float32Array scores are written
 * into a SharedArrayBuffer; otherwise the whole result is sent via structured clone.
 * Requests are queued: the worker sees one message at a time, in call order.
 *
 * If the Worker cannot be constructed, or fails before it signals ready, the engine falls back
 * to the main-thread WASM engine (`isWorker: false`).
 * Use `await using engine = await createWorkerSearchEngine()` for automatic cleanup.
 *
 * @returns An async-disposable engine backed by a Web Worker, or the main-thread fallback
 */
export async function createWorkerSearchEngine(
  options?: WorkerSearchEngineOptions,
): Promise<WorkerSearchEngine | MainThreadSearchEngine> {
  const maxResultsLimit = options?.maxResults ?? 50;
  const sharedMemoryAvailable = isSharedArrayBufferAvailable();

  // Pre-allocate SharedArrayBuffer for score transfer if available
  // Sized for maxResults float32 values (4 bytes each)
  const scoresBuffer: SharedArrayBuffer | null = sharedMemoryAvailable
    ? new SharedArrayBuffer(maxResultsLimit * Float32Array.BYTES_PER_ELEMENT)
    : null;

  // ── Worker lifecycle ───────────────────────────────────────────────────────

  let worker: Worker;
  try {
    // dist/worker.js is the second tsdown entry (tsdown.config.ts), emitted next to dist/index.js
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  } catch (error: unknown) {
    warnFallback(error);
    return createMainThreadFallback();
  }

  // Wait for the worker to signal readiness (WASM module loaded)
  const {
    promise: readyPromise,
    resolve: readyResolve,
    reject: readyReject,
  } = Promise.withResolvers<void>();

  // ── Request queue ──────────────────────────────────────────────────────────

  // Sequential request queue — the worker answers one message at a time, so a request is only
  // posted once the previous one has been answered. Each request has its own resolvers.
  interface PendingRequest {
    readonly message: WorkerMessage;
    readonly resolve: (value: WorkerResponse) => void;
    readonly reject: (reason: unknown) => void;
  }

  let inFlight: PendingRequest | null = null;
  const queued: PendingRequest[] = [];
  let disposed = false;

  function pump(): void {
    if (inFlight || disposed) return;
    const next = queued.shift();
    if (!next) return;
    inFlight = next;
    worker.postMessage(next.message);
  }

  /** Settle the in-flight request and start the next queued one. */
  function settleInFlight(settle: (request: PendingRequest) => void): void {
    const request = inFlight;
    if (!request) return;
    inFlight = null;
    settle(request);
    pump();
  }

  // ── Cached results for sync iterator ───────────────────────────────────────

  // The SearchEngine.search() interface returns a synchronous IteratorObject.
  // Worker communication is async, so the sync method yields from a cache
  // populated by the most recent searchAsync() call.
  let cachedResults: readonly SearchResult[] = [];

  // ── Message handling ───────────────────────────────────────────────────────

  let ready = false;
  worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;

    if (response.type === 'ready') {
      ready = true;
      readyResolve();
      return;
    }
    if (!ready) {
      if (response.type === 'error') readyReject(new Error(response.message));
      return;
    }

    settleInFlight((request) => {
      if (response.type === 'error') {
        request.reject(new Error(response.message));
      } else {
        request.resolve(response);
      }
    });
  });

  worker.addEventListener('error', (event: ErrorEvent) => {
    const error = new Error(`Worker error: ${event.message}`);
    readyReject(error); // no-op once ready has resolved
    settleInFlight((request) => request.reject(error));
  });

  // Block until WASM is loaded in the worker; a worker that dies first means no worker engine
  try {
    await readyPromise;
  } catch (error: unknown) {
    worker.terminate();
    warnFallback(error);
    return createMainThreadFallback();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Queue a message for the worker and wait for its response.
   * Uses Promise.withResolvers() for clean async request tracking.
   */
  function postAndWait(message: WorkerMessage): Promise<WorkerResponse> {
    if (disposed) {
      return Promise.reject(new Error('WorkerSearchEngine has been disposed'));
    }

    const { promise, resolve, reject } = Promise.withResolvers<WorkerResponse>();
    queued.push({ message, resolve, reject });
    pump();
    return promise;
  }

  /**
   * Fire-and-forget for the synchronous index()/remove()/clear() signatures: a failure is
   * reported in development instead of becoming an unhandled rejection. Disposal rejects
   * whatever is still queued; that is expected and stays quiet.
   */
  function postDetached(message: WorkerMessage): void {
    postAndWait(message).catch((error: unknown) => {
      if (!disposed && isDev) {
        // biome-ignore lint/suspicious/noConsole: dev-only worker request failure diagnostic
        console.warn('[modern-cmdk] search worker request failed:', error);
      }
    });
  }

  /** Reject everything still waiting, then stop the worker. */
  function shutdown(): void {
    disposed = true;
    const error = new Error('WorkerSearchEngine has been disposed');
    const waiting = [...(inFlight ? [inFlight] : []), ...queued.splice(0)];
    inFlight = null;
    for (const request of waiting) request.reject(error);
    worker.terminate();
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
      postDetached({ type: 'index', items: serialized });
    },

    *search(_query: string, _items: readonly { id: ItemId }[]): Generator<SearchResult> {
      // Ignores its arguments and yields the results of the most recent searchAsync() call.
      // Nothing calls searchAsync() for you (createCommandMachine only calls this synchronous
      // method), so await engine.searchAsync(query) before iterating.
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

      // The queue keeps these two in order and ahead of any later search.
      postDetached({ type: 'clear' });
      if (remaining.length > 0) {
        const serialized = JSON.stringify(
          remaining
            .values()
            .map((item) => [item.id, item.value])
            .toArray(),
        );
        postDetached({ type: 'index', items: serialized });
      }
    },

    clear(): void {
      lastIndexedItems = [];
      cachedResults = [];
      postDetached({ type: 'clear' });
    },

    [Symbol.dispose](): void {
      if (!disposed) {
        // The dispose message is best effort: terminate() below stops the worker regardless
        worker.postMessage({ type: 'dispose' } satisfies WorkerMessage);
        shutdown();
      }
    },

    async [Symbol.asyncDispose](): Promise<void> {
      // The worker closes itself on 'dispose' and never answers, so there is nothing to await
      engine[Symbol.dispose]();
    },
  };

  return engine;
}

// ── Main-thread fallback ─────────────────────────────────────────────────────

function warnFallback(error: unknown): void {
  if (isDev) {
    // biome-ignore lint/suspicious/noConsole: dev-only Worker failure diagnostic
    console.warn(
      '[modern-cmdk] search Worker unavailable, falling back to the main thread:',
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** Wrap the main-thread engine in the async-shaped surface of the worker engine. */
async function createMainThreadFallback(): Promise<MainThreadSearchEngine> {
  const inner = await createWasmSearchEngine();
  let indexed: readonly { id: ItemId; value: string }[] = [];

  return {
    isWasm: inner.isWasm,
    isWorker: false,
    useSharedMemory: false,
    index(items: readonly { id: ItemId; value: string }[]): void {
      indexed = items;
      inner.index(items);
    },
    search: inner.search.bind(inner),
    async searchAsync(query: string, maxResults?: number): Promise<readonly SearchResult[]> {
      const results = [...inner.search(query, indexed)];
      return maxResults === undefined ? results : results.slice(0, maxResults);
    },
    remove(ids: ReadonlySet<ItemId>): void {
      indexed = indexed.filter((item) => !ids.has(item.id));
      inner.remove(ids);
    },
    clear(): void {
      indexed = [];
      inner.clear();
    },
    [Symbol.dispose](): void {
      inner[Symbol.dispose]();
    },
    async [Symbol.asyncDispose](): Promise<void> {
      await inner[Symbol.asyncDispose]();
    },
  };
}
