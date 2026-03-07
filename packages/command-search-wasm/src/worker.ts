// Worker script — runs in a dedicated Web Worker thread
// WASM-accelerated fuzzy search off the main thread
// Uses: await using for WASM module lifecycle

/** Messages sent from the main thread to the worker */
export type WorkerMessage =
  | { readonly type: 'index'; readonly items: string }
  | {
      readonly type: 'search';
      readonly query: string;
      readonly maxResults: number;
      readonly scoresBuffer?: SharedArrayBuffer;
    }
  | { readonly type: 'remove'; readonly ids: readonly string[] }
  | { readonly type: 'clear' }
  | { readonly type: 'dispose' };

/** Messages sent from the worker back to the main thread */
export type WorkerResponse =
  | { readonly type: 'indexed' }
  | {
      readonly type: 'results';
      readonly results: ReadonlyArray<{
        readonly id: string;
        readonly score: number;
        readonly matches: ReadonlyArray<readonly [number, number]>;
      }>;
    }
  | {
      readonly type: 'results-sab';
      readonly count: number;
      readonly ids: readonly string[];
      readonly matches: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
    }
  | { readonly type: 'cleared' }
  | { readonly type: 'ready' }
  | { readonly type: 'error'; readonly message: string };

/**
 * Initialize the WASM engine and listen for messages.
 * The entire lifecycle is managed with `await using` so that
 * the WASM instance is freed when the worker is disposed.
 */
async function initWorker(): Promise<void> {
  const wasm = await import('../pkg/command_search_wasm.js');
  const instance = new wasm.WasmSearchEngine();

  // Track disposal state
  let disposed = false;

  const cleanup = (): void => {
    if (!disposed) {
      disposed = true;
      instance.free();
    }
  };

  // Signal readiness to the main thread
  self.postMessage({ type: 'ready' } satisfies WorkerResponse);

  self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
    if (disposed) return;

    const message = event.data;

    try {
      switch (message.type) {
        case 'index': {
          instance.index_items(message.items);
          self.postMessage({ type: 'indexed' } satisfies WorkerResponse);
          break;
        }

        case 'search': {
          const rawResults = instance.search(message.query, message.maxResults) as Array<{
            id: string;
            score: number;
            matches: Array<[number, number]>;
          }>;

          // SharedArrayBuffer path — write scores into the shared Float32Array
          if (message.scoresBuffer) {
            const scoresView = new Float32Array(message.scoresBuffer);
            const ids: string[] = [];
            const matches: Array<ReadonlyArray<readonly [number, number]>> = [];

            rawResults.values().forEach((result, index) => {
              scoresView[index] = result.score;
              ids.push(result.id);
              matches.push(result.matches);
            });

            self.postMessage({
              type: 'results-sab',
              count: rawResults.length,
              ids,
              matches,
            } satisfies WorkerResponse);
          } else {
            // Structured clone fallback — serialize everything in the response
            const results = rawResults
              .values()
              .map((result) => ({
                id: result.id,
                score: result.score,
                matches: result.matches,
              }))
              .toArray();

            self.postMessage({
              type: 'results',
              results,
            } satisfies WorkerResponse);
          }
          break;
        }

        case 'remove': {
          // WASM index is immutable — clear and re-index happens on main thread side
          // The worker only receives the remove signal for bookkeeping
          instance.clear();
          self.postMessage({ type: 'cleared' } satisfies WorkerResponse);
          break;
        }

        case 'clear': {
          instance.clear();
          self.postMessage({ type: 'cleared' } satisfies WorkerResponse);
          break;
        }

        case 'dispose': {
          cleanup();
          self.close();
          break;
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      self.postMessage({
        type: 'error',
        message: errorMessage,
      } satisfies WorkerResponse);
    }
  });
}

// Boot the worker
void initWorker();
