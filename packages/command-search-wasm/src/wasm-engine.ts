// WASM-accelerated fuzzy search engine
// Uses: Symbol.dispose / Symbol.asyncDispose for the WASM instance (works with `await using`; disposing twice frees once), Iterator Helpers (ES2025)
// Falls back to TypeScript scorer from modern-cmdk if WASM fails to load

import type { ItemId, SearchEngine, SearchResult } from 'modern-cmdk';

import { dev } from './env.js';

// Module-scoped declaration: this package needs no @types/node, and nothing global leaks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

const DISPOSED_MESSAGE =
  'modern-cmdk: the WASM search engine was disposed; create a new engine with createWasmSearchEngine()';

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

    // wasm-bindgen `free()` must run once per instance: the machine disposes the engine it was given
    // (ledger DG-35), so a consumer's own dispose (useEffect cleanup, `await using`) also runs, before or after it.
    let disposed = false;
    const assertLive = (): void => {
      if (disposed) throw new Error(DISPOSED_MESSAGE);
    };
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      instance.free();
    };

    // The crate rebuilds its trigram index from every `index_items` call, so it cannot add to what it holds.
    // The adapter keeps the indexed values by id; after a change, the whole map goes to the crate before the next
    // search, once however many index() and remove() calls came in between (one call per registered item would
    // rebuild the crate index each time).
    const indexed = new Map<ItemId, string>();
    let stale = false;
    const syncIndex = (): void => {
      if (!stale) return;
      // Cleared after the call: a payload the crate rejects (a lone surrogate fails its JSON parse) leaves the
      // index stale, so the next search throws again instead of serving the previous index.
      instance.index_items(JSON.stringify(Array.from(indexed)));
      stale = false;
    };

    const engine: WasmSearchEngine = {
      isWasm: true,

      /**
       * Indexing is incremental: the handed items are upserted by id (an id that is already indexed is
       * replaced by the new value) and ids not in `items` stay indexed.
       */
      index(items: readonly { id: ItemId; value: string }[]): void {
        assertLive();
        for (const item of items) indexed.set(item.id, item.value);
        stale = true;
      },

      /**
       * Searches the passed `items` only: a result names an id among them, in the crate's order. The crate searches
       * its whole index and sorts by score before it truncates to the limit, so the limit is the number of indexed
       * items, not `items.length`: a smaller one would let matches outside `items` use up the slots and starve the
       * ids that were passed.
       */
      *search(query: string, items: readonly { id: ItemId }[]): Generator<SearchResult> {
        assertLive();
        syncIndex();
        const candidates = new Set<string>(items.map((item) => item.id));
        const results = instance.search(query, indexed.size) as Array<{
          id: string;
          score: number;
          matches: Array<[number, number]>;
        }>;

        yield* results
          .values()
          .filter((result) => candidates.has(result.id))
          .map(
            (result): SearchResult => ({
              id: result.id as ItemId,
              score: result.score,
              matches: result.matches,
            }),
          );
      },

      /** Deletes only the given ids; every other indexed id stays searchable. */
      remove(ids: ReadonlySet<ItemId>): void {
        assertLive();
        for (const id of ids) indexed.delete(id);
        stale = true;
      },

      /** Empties the kept map and the crate's index. */
      clear(): void {
        assertLive();
        indexed.clear();
        instance.clear();
        stale = false;
      },

      [Symbol.dispose]: dispose,

      async [Symbol.asyncDispose](): Promise<void> {
        dispose();
      },
    };

    return engine;
  } catch (error: unknown) {
    if (dev && process.env.NODE_ENV !== 'production') {
      // biome-ignore lint/suspicious/noConsole: dev-only WASM load failure diagnostic
      console.warn(
        '[modern-cmdk] WASM search engine failed to load, falling back to TypeScript scorer:',
        error instanceof Error ? error.message : String(error),
      );
    }

    const { createSearchEngine } = await import('modern-cmdk');
    const tsEngine = createSearchEngine();

    // Forwards the first dispose only, whichever of the two protocols it arrives through.
    let disposed = false;
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      tsEngine[Symbol.dispose]();
    };

    const fallback: FallbackSearchEngine = {
      isWasm: false,
      index: tsEngine.index.bind(tsEngine),
      search: tsEngine.search.bind(tsEngine),
      remove: tsEngine.remove.bind(tsEngine),
      clear: tsEngine.clear.bind(tsEngine),

      [Symbol.dispose]: dispose,

      async [Symbol.asyncDispose](): Promise<void> {
        dispose();
      },
    };

    return fallback;
  }
}
