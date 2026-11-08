// packages/modern-cmdk/src/core/search/index.ts
// Search engine factory with pluggable scorer — Iterator Helpers (ES2025) for result pipelines
// Incremental filtering (default scorer only): when the lowercased query extends the previous
// lowercased query, only the previous matches are re-scored; custom scorers rescan every item on every non-empty query
// Performance: pre-cached lowercase at index time, charCode comparison

import type { CommandItem, ItemId } from '../types.js';
import { dev } from '../utils/env.js';
import { scoreItemPreLowered } from './default-scorer.js';
import type { ScorerFn, SearchEngine, SearchResult } from './types.js';

// Module-scoped declaration: core needs no @types/node, and nothing global leaks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

// Dev-only leak detection via FinalizationRegistry — warns if a search engine instance is
// garbage collected without being explicitly disposed. Browser dev builds only: on the server machines
// are never disposed, so a warning there would be noise. `dev` (utils/env.ts) is false where `process` does not
// exist, so an unbundled browser import does not throw; the inline comparison makes a consumer bundler that defines
// `process.env.NODE_ENV` as "production" fold the guard to `dev && false`, and its minifier drops the registry and the
// warning. A development bundle without a `process` global (Vite's dev server) keeps both operands true.
let leakRegistry: FinalizationRegistry<string> | undefined;
if (dev && process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  leakRegistry = new FinalizationRegistry((label) => {
    // biome-ignore lint/suspicious/noConsole: Dev-only leak detection diagnostic
    console.warn(
      `[modern-cmdk] ${label} was garbage collected without being disposed. Use \`using\` or call [Symbol.dispose]() to prevent leaks.`,
    );
  });
}

interface SearchEngineOptions {
  readonly scorer?: ScorerFn | undefined;
}

/** Pre-computed lowercase cache entry — avoids re-lowering on every search */
interface IndexedEntry {
  readonly item: CommandItem;
  readonly lowerValue: string;
  readonly lowerKeywords: readonly string[] | undefined;
}

/**
 * Creates a search engine with pluggable scorer.
 * With the default scorer, a query that extends the previous one (compared lowercased) re-scores
 * only the prior matches; a custom scorer is called for every item on every non-empty query.
 * Pre-caches lowercase at index time; indexed items are not re-lowered during search.
 * Uses Iterator Helpers (ES2025) for result pipelines.
 */
export function createSearchEngine(options?: SearchEngineOptions): SearchEngine {
  const customScorer: ScorerFn | undefined = options?.scorer;
  const useDefaultScorer = customScorer === undefined;

  // Pre-cached lowercase index — avoids toLowerCase() on every search
  const indexedEntries = new Map<ItemId, IndexedEntry>();
  let previousQuery = '';
  let previousResults = new Set<ItemId>();

  // Leak detection sentinel — weak reference target for FinalizationRegistry
  const sentinel = {};
  if (leakRegistry) {
    leakRegistry.register(sentinel, 'SearchEngine', sentinel);
  }

  return {
    index(items: readonly CommandItem[]): void {
      // Pre-compute and cache lowercase at index time — one-time cost
      for (const item of items) {
        indexedEntries.set(item.id, {
          item,
          lowerValue: item.value.toLowerCase(),
          lowerKeywords: item.keywords?.map((k) => k.toLowerCase()),
        });
      }
      // Invalidate incremental cache — new items may match the current query
      // Without this, dynamically registered items are excluded from the
      // incremental path and remain invisible until the query no longer extends the previous one
      previousQuery = '';
      previousResults = new Set();
    },

    search(query: string, items: readonly CommandItem[]): IteratorObject<SearchResult> {
      if (query === '') {
        previousQuery = '';
        previousResults = new Set(items.values().map((i) => i.id));
        // Return all items with score 1, in order — Iterator Helper pipeline
        return items.values().map((item) => ({
          id: item.id,
          score: 1,
          matches: [] as ReadonlyArray<readonly [number, number]>,
        }));
      }

      // Lowercase query ONCE for the entire search — not per-item
      const lowerQuery = query.toLowerCase();

      // Incremental filtering (default scorer only: a custom scorer need not be monotone, so it
      // rescans every item): if the lowered query extends the previous one, re-score only its matches
      const isIncremental =
        useDefaultScorer && previousQuery.length > 0 && lowerQuery.startsWith(previousQuery);
      const candidateItems: Iterable<CommandItem> = isIncremental
        ? items.values().filter((item) => previousResults.has(item.id))
        : items;

      // Score candidates — hot path with pre-lowered data
      const results: SearchResult[] = [];

      if (useDefaultScorer) {
        // Fast path: internal scorer on pre-cached lowercase; unindexed items are lowered here
        for (const item of candidateItems) {
          const entry = indexedEntries.get(item.id);
          const result = entry
            ? scoreItemPreLowered(
                lowerQuery,
                item.id,
                item.value,
                entry.lowerValue,
                entry.lowerKeywords,
              )
            : scoreItemPreLowered(
                lowerQuery,
                item.id,
                item.value,
                item.value.toLowerCase(),
                item.keywords?.map((k) => k.toLowerCase()),
              );
          if (result !== null) results.push(result);
        }
      } else {
        // Custom scorer path — use the user-provided scorer as-is
        for (const item of candidateItems) {
          const result = customScorer(query, item);
          if (result != null) results.push(result);
        }
      }

      results.sort((a, b) => b.score - a.score);

      // Update tracking for incremental filtering
      previousQuery = lowerQuery;
      previousResults = new Set(results.values().map((r) => r.id));

      // Return sorted results as an iterator
      return results.values();
    },

    remove(ids: ReadonlySet<ItemId>): void {
      // O(k): one delete per id from the index and from the incremental cache, no copy of either
      for (const id of ids) {
        indexedEntries.delete(id);
        previousResults.delete(id);
      }
    },

    clear(): void {
      indexedEntries.clear();
      previousQuery = '';
      previousResults.clear();
    },

    [Symbol.dispose](): void {
      indexedEntries.clear();
      previousResults.clear();
      // Unregister from leak detector — this engine was properly disposed
      if (leakRegistry) {
        leakRegistry.unregister(sentinel);
      }
    },
  };
}
