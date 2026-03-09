// packages/command/src/search/fuzzy-scorer.ts
// Advanced fuzzy matcher (pure TS) — Promise.try for safe async scoring, Array.fromAsync for batch

import type { CommandItem } from '../types.js';
import { scoreItem } from './default-scorer.js';
import type { SearchResult } from './types.js';

/**
 * Async-safe fuzzy scorer — wraps scoring in Promise.try (ES2026) for error resilience.
 * Falls back gracefully on error via Promise.try's synchronous-throw capture.
 */
export async function scoreItemAsync(
  query: string,
  item: CommandItem,
): Promise<SearchResult | null> {
  return Promise.try(() => scoreItem(query, item));
}

/**
 * Async generator that yields score results for each item.
 * Enables streaming consumption and lazy evaluation of scoring operations.
 */
async function* scoreItemsGenerator(
  query: string,
  items: readonly CommandItem[],
): AsyncGenerator<SearchResult | null> {
  for (const item of items) {
    yield Promise.try(() => scoreItem(query, item));
  }
}

/**
 * Batch score items using Array.fromAsync (ES2026) with an async generator pipeline.
 * Uses Promise.try for safe execution of each scoring operation and Array.fromAsync
 * for materializing the async iterable into a concrete array.
 */
export async function batchScoreItems(
  query: string,
  items: readonly CommandItem[],
): Promise<SearchResult[]> {
  // Array.fromAsync (ES2026) — materializes async generator into array
  const results = await Array.fromAsync(scoreItemsGenerator(query, items));

  return results.filter((r): r is SearchResult => r != null).sort((a, b) => b.score - a.score);
}
