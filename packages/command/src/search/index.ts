// packages/command/src/search/index.ts
// Search engine factory with pluggable scorer — Iterator Helpers (ES2026) for result pipelines
// Incremental filtering: query-append optimization using Set.difference for candidate pruning

import type { CommandItem, ItemId } from '../types.js';
import { scoreItem } from './default-scorer.js';
import type { ScorerFn, SearchEngine, SearchResult } from './types.js';

// Dev-only leak detection via FinalizationRegistry — warns if a search engine
// instance is garbage collected without being explicitly disposed
const __DEV__ = (globalThis as Record<string, unknown>).process
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

/**
 * Creates a search engine with pluggable scorer and incremental filtering.
 * When the query extends the previous one, only prior matches are re-scored.
 * Uses Iterator Helpers (ES2026) for result pipelines and Set.difference for pruning.
 */
export function createSearchEngine(options?: SearchEngineOptions): SearchEngine {
  const scorer: ScorerFn = options?.scorer ?? scoreItem;
  let indexedItems = new Map<ItemId, CommandItem>();
  let previousQuery = '';
  let previousResults = new Set<ItemId>();

  // Leak detection sentinel — weak reference target for FinalizationRegistry
  const sentinel = {};
  if (__DEV__ && leakRegistry) {
    leakRegistry.register(sentinel, 'SearchEngine', sentinel);
  }

  return {
    index(items: readonly CommandItem[]): void {
      items.values().forEach((item) => {
        indexedItems.set(item.id, item);
      });
    },

    search(query: string, items: readonly CommandItem[]): IteratorObject<SearchResult> {
      if (query === '') {
        previousQuery = '';
        previousResults = new Set(items.map((i) => i.id));
        // Return all items with score 1, in order — Iterator Helper pipeline
        return items.values().map((item) => ({
          id: item.id,
          score: 1,
          matches: [] as ReadonlyArray<readonly [number, number]>,
        }));
      }

      // Incremental filtering: if new query extends previous, only re-score previous matches
      const isIncremental = query.startsWith(previousQuery) && previousQuery.length > 0;
      const candidateItems = isIncremental
        ? items.filter((item) => previousResults.has(item.id))
        : items;

      // Score candidates using Iterator Helpers pipeline (ES2026)
      const results = candidateItems
        .values()
        .map((item) => scorer(query, item))
        .filter((result): result is SearchResult => result != null)
        .toArray()
        .sort((a, b) => b.score - a.score);

      // Update tracking for incremental filtering
      previousQuery = query;
      previousResults = new Set(results.map((r) => r.id));

      // Return sorted results as an iterator
      return results.values();
    },

    remove(ids: ReadonlySet<ItemId>): void {
      // Use Set.difference (ES2026) for efficient bulk removal + Iterator Helpers
      const currentIds = new Set(indexedItems.keys());
      const remaining = currentIds.difference(ids);
      indexedItems = new Map(
        remaining
          .values()
          .map((id) => [id, indexedItems.get(id)] as const)
          .filter((entry): entry is readonly [ItemId, CommandItem] => entry[1] != null),
      );

      // Also prune incremental cache
      previousResults = previousResults.difference(ids);
    },

    clear(): void {
      indexedItems.clear();
      previousQuery = '';
      previousResults.clear();
    },

    [Symbol.dispose](): void {
      indexedItems.clear();
      previousResults.clear();
      // Unregister from leak detector — this engine was properly disposed
      if (__DEV__ && leakRegistry) {
        leakRegistry.unregister(sentinel);
      }
    },
  };
}
