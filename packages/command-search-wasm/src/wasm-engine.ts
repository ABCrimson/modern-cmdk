// WASM-accelerated fuzzy search engine
// Uses: Symbol.dispose / Symbol.asyncDispose for the WASM instance (works with `await using`), Iterator Helpers (ES2025)
// Falls back to TypeScript scorer from modern-cmdk if WASM fails to load

import type { ItemId, SearchEngine, SearchResult } from 'modern-cmdk';

import { isDev } from './env.js';

/** Extended search engine backed by a WASM trigram index */
export interface WasmSearchEngine extends SearchEngine, AsyncDisposable {
  readonly isWasm: true;
}

/** Fallback search engine using the TypeScript scorer */
export interface FallbackSearchEngine extends SearchEngine, AsyncDisposable {
  readonly isWasm: false;
}

/**
 * Create a main-thread WASM search engine using the Rust trigram index.
 * Use `await using engine = await createWasmSearchEngine()` for automatic cleanup.
 *
 * If WASM fails to load (CSP restrictions, unsupported browser, network error, etc.),
 * automatically falls back to the TypeScript search engine from `modern-cmdk`.
 */
export async function createWasmSearchEngine(): Promise<WasmSearchEngine | FallbackSearchEngine> {
  try {
    const wasm = await import('../pkg/command_search_wasm.js');
    const instance = new wasm.WasmSearchEngine();

    const engine: WasmSearchEngine = {
      isWasm: true,

      index(items: readonly { id: ItemId; value: string }[]): void {
        const serialized = JSON.stringify(
          items
            .values()
            .map((item) => [item.id, item.value])
            .toArray(),
        );
        instance.index_items(serialized);
      },

      *search(query: string, items: readonly { id: ItemId }[]): Generator<SearchResult> {
        const results = instance.search(query, items.length) as Array<{
          id: string;
          score: number;
          matches: Array<[number, number]>;
        }>;

        yield* results.values().map(
          (result): SearchResult => ({
            id: result.id as ItemId,
            score: result.score,
            matches: result.matches,
          }),
        );
      },

      remove(_ids: ReadonlySet<ItemId>): void {
        // Clears the whole index: the remaining items are not re-indexed (known gap, ledger W05)
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
  } catch (error: unknown) {
    if (isDev) {
      // biome-ignore lint/suspicious/noConsole: dev-only WASM load failure diagnostic
      console.warn(
        '[modern-cmdk] WASM search engine failed to load, falling back to TypeScript scorer:',
        error instanceof Error ? error.message : String(error),
      );
    }

    const { createSearchEngine } = await import('modern-cmdk');
    const tsEngine = createSearchEngine();

    const fallback: FallbackSearchEngine = {
      isWasm: false,
      index: tsEngine.index.bind(tsEngine),
      search: tsEngine.search.bind(tsEngine),
      remove: tsEngine.remove.bind(tsEngine),
      clear: tsEngine.clear.bind(tsEngine),

      [Symbol.dispose](): void {
        tsEngine[Symbol.dispose]();
      },

      async [Symbol.asyncDispose](): Promise<void> {
        tsEngine[Symbol.dispose]();
      },
    };

    return fallback;
  }
}
