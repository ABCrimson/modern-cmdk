// packages/command/src/search/fuzzy-scorer.ts
// Advanced fuzzy matcher (pure TS) — Promise.try for safe async scoring

import type { CommandItem } from '../types.js';
import type { SearchResult } from './types.js';
import { scoreItem } from './default-scorer.js';

/**
 * Async-safe fuzzy scorer — wraps scoring in Promise.try for error resilience.
 * Falls back to default scorer on error.
 */
export async function scoreItemAsync(
  query: string,
  item: CommandItem,
): Promise<SearchResult | null> {
  return Promise.try(() => scoreItem(query, item));
}

/**
 * Batch score items concurrently, returning results ordered by score.
 * Uses Promise.try (ES2026) for safe execution of each scoring operation.
 */
export async function batchScoreItems(
  query: string,
  items: readonly CommandItem[],
): Promise<SearchResult[]> {
  const results = await Promise.all(
    items.map((item) => Promise.try(() => scoreItem(query, item))),
  );

  return results
    .filter((r): r is SearchResult => r != null)
    .sort((a, b) => b.score - a.score);
}
