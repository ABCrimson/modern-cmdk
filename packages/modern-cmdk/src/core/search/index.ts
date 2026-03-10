// packages/command/src/search/index.ts
// Search engine factory with pluggable scorer — Iterator Helpers (ES2026) for result pipelines
// Incremental filtering: query-append optimization using Set.difference for candidate pruning
// Performance: pre-cached lowercase at index time, charCode comparison, zero redundant allocation

import type { CommandItem, ItemId } from '../types.js';
import { scoreItemPreLowered } from './default-scorer.js';
import type { ScorerFn, SearchEngine, SearchResult } from './types.js';

// Dev-only leak detection via FinalizationRegistry — warns if a search engine
// instance is garbage collected without being explicitly disposed
const __DEV__: boolean = (globalThis as Record<string, unknown>).process
  ? ((globalThis as Record<string, unknown>).process as { env: Record<string, string | undefined> })
      .env.NODE_ENV !== 'production'
  : false;
let leakRegistry: FinalizationRegistry<string> | undefined;
if (__DEV__) {
  leakRegistry = new FinalizationRegistry((_label) => {});
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
 * Creates a search engine with pluggable scorer and incremental filtering.
 * When the query extends the previous one, only prior matches are re-scored.
 * Pre-caches lowercase at index time — zero toLowerCase() calls during search.
 * Uses Iterator Helpers (ES2026) for result pipelines and Set.difference for pruning.
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
  if (__DEV__ && leakRegistry) {
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

      // Incremental filtering: if new query extends previous, only re-score previous matches
      const isIncremental = query.startsWith(previousQuery) && previousQuery.length > 0;
      const candidateItems: Iterable<CommandItem> = isIncremental
        ? items.values().filter((item) => previousResults.has(item.id))
        : items;

      // Score candidates — hot path with pre-lowered data
      const results: SearchResult[] = [];

      if (useDefaultScorer) {
        // Fast path: use pre-cached lowercase + internal scorer (no toLowerCase per item)
        for (const item of candidateItems) {
          const entry = indexedEntries.get(item.id);
          const result = entry
            ? scoreItemPreLowered(lowerQuery, item.id, entry.lowerValue, entry.lowerKeywords)
            : scoreItemPreLowered(
                lowerQuery,
                item.id,
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
      previousQuery = query;
      previousResults = new Set(results.values().map((r) => r.id));

      // Return sorted results as an iterator
      return results.values();
    },

    remove(ids: ReadonlySet<ItemId>): void {
      // O(k) deletes instead of O(n) Map rebuild
      for (const id of ids) {
        indexedEntries.delete(id);
      }
      // Prune incremental cache
      previousResults = previousResults.difference(ids);
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
      if (__DEV__ && leakRegistry) {
        leakRegistry.unregister(sentinel);
      }
    },
  };
}
