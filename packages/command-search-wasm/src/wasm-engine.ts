// WASM-accelerated fuzzy search engine
// Uses: await using for WASM module lifecycle, Iterator Helpers (ES2026)

import type { SearchEngine, SearchResult } from '@crimson_dev/command';
import type { ItemId } from '@crimson_dev/command';

/** Extended search engine backed by a WASM trigram index */
interface WasmSearchEngine extends SearchEngine, AsyncDisposable {
  readonly isWasm: true;
}

/**
 * Create a main-thread WASM search engine using the Rust trigram index.
 * Use `await using engine = await createWasmSearchEngine()` for automatic cleanup.
 */
export async function createWasmSearchEngine(): Promise<WasmSearchEngine> {
  const wasm = await import('../pkg/command_search_wasm.js');
  const instance = new wasm.WasmSearchEngine();

  const engine: WasmSearchEngine = {
    isWasm: true,

    index(items): void {
      const serialized = JSON.stringify(
        items
          .values()
          .map((item) => [item.id, item.value])
          .toArray(),
      );
      instance.index_items(serialized);
    },

    *search(query, items): IteratorObject<SearchResult> {
      const results = instance.search(query, items.length) as Array<{
        id: string;
        score: number;
        matches: Array<[number, number]>;
      }>;

      yield* results
        .values()
        .map((result): SearchResult => ({
          id: result.id as ItemId,
          score: result.score,
          matches: result.matches,
        }));
    },

    remove(_ids): void {
      // Rebuild index without removed items — WASM index is immutable
      instance.clear();
    },

    clear(): void {
      instance.clear();
    },

    [Symbol.dispose](): void {
      instance.free();
    },

    async [Symbol.asyncDispose](): Promise<void> {
      instance.free();
    },
  };

  return engine;
}
