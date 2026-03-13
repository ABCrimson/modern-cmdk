// packages/command/src/search/fuzzy-scorer.ts
// Advanced fuzzy matcher (pure TS) — safe async scoring via Promise.resolve().then()
// Iterator Helpers, toSorted

import type { CommandItem } from '../types.js';
import { scoreItem } from './default-scorer.js';
import type { SearchResult } from './types.js';

/**
 * Async-safe fuzzy scorer — wraps scoring in Promise for error resilience.
 * Falls back gracefully on error via synchronous-throw capture.
 */
export function scoreItemAsync(query: string, item: CommandItem): Promise<SearchResult | null> {
  return new Promise((resolve) => {
    resolve(scoreItem(query, item));
  });
}

/**
 * Batch score items synchronously inside a single Promise.
 * Eliminates per-item microtask overhead from async generators — runs the
 * entire scoring pipeline in one synchronous pass, wrapped for error safety.
 */
export function batchScoreItems(
  query: string,
  items: readonly CommandItem[],
): Promise<SearchResult[]> {
  return new Promise((resolve) => {
    resolve(
      items
        .values()
        .map((item) => scoreItem(query, item))
        .filter((r): r is SearchResult => r != null)
        .toArray()
        .toSorted((a, b) => b.score - a.score),
    );
  });
}
