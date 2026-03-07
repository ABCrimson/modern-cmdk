// packages/command/src/search/types.ts
// SearchResult, ScorerFn types — branded types with `satisfies`

import type { CommandItem, ItemId } from '../types.js';

/** Result of scoring a single item against a query */
export interface SearchResult {
  readonly id: ItemId;
  readonly score: number;
  /** Character ranges that matched (for highlighting) — [start, end] tuples */
  readonly matches: ReadonlyArray<readonly [start: number, end: number]>;
}

/** A scoring function that evaluates a single item against a query */
export type ScorerFn = (query: string, item: CommandItem) => SearchResult | null;

/** Search engine interface — pluggable into the state machine */
export interface SearchEngine extends Disposable {
  /** Index items for fast lookup (call on registration) */
  index(items: readonly CommandItem[]): void;
  /** Search items by query, return ordered results — uses Iterator pipeline */
  search(query: string, items: readonly CommandItem[]): IteratorObject<SearchResult>;
  /** Remove items from index — uses Set.difference for efficient bulk removal */
  remove(ids: ReadonlySet<ItemId>): void;
  /** Clear the entire index */
  clear(): void;
  /** Dispose resources */
  [Symbol.dispose](): void;
}
