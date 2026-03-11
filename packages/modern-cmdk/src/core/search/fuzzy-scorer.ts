// packages/command/src/search/fuzzy-scorer.ts
// Advanced fuzzy matcher (pure TS) — Promise.try for safe async scoring
// ES2026: Promise.try, Iterator Helpers, toSorted

import type { CommandItem } from '../types.js';
import { scoreItem } from './default-scorer.js';
import type { SearchResult } from './types.js';

/**
 * Async-safe fuzzy scorer — wraps scoring in Promise.try (ES2026) for error resilience.
 * Falls back gracefully on error via Promise.try's synchronous-throw capture.
 */
export function scoreItemAsync(query: string, item: CommandItem): Promise<SearchResult | null> {
  return Promise.try(() => scoreItem(query, item));
}

/**
 * Batch score items synchronously inside a single Promise.try (ES2026).
 * Eliminates per-item microtask overhead from async generators — runs the
 * entire scoring pipeline in one synchronous pass, wrapped for error safety.
 */
export function batchScoreItems(
  query: string,
  items: readonly CommandItem[],
): Promise<SearchResult[]> {
  return Promise.try(() =>
    items
      .values()
      .map((item) => scoreItem(query, item))
      .filter((r): r is SearchResult => r != null)
      .toArray()
      .toSorted((a, b) => b.score - a.score),
  );
}
