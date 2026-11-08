// packages/modern-cmdk/src/core/search/types.ts
// SearchResult, ScorerFn and SearchEngine types

import type { CommandItem, ItemId } from '../types.js';

/** Result of scoring a single item against a query */
export interface SearchResult {
  readonly id: ItemId;
  readonly score: number;
  /**
   * Character ranges that matched (for highlighting) — half-open [start, end) tuples, end exclusive. The
   * ranges index the original `item.value`, not its lowercased copy. A match on keywords only reports
   * `matches: []`: there is nothing in the value to highlight.
   */
  readonly matches: ReadonlyArray<readonly [start: number, end: number]>;
}

/** A scoring function that evaluates a single item against a query */
export type ScorerFn = (query: string, item: CommandItem) => SearchResult | null;

/** Search engine interface — pluggable into the state machine */
export interface SearchEngine extends Disposable {
  /**
   * Index items for fast lookup. The machine calls it on registration (the initial items, ITEMS_LOADED,
   * REGISTER_ITEM) and again on UPDATE_ITEM with the updated item, so an id that is already indexed must
   * be replaced by the new item, not appended to the index.
   */
  index(items: readonly CommandItem[]): void;
  /** Search items by query, return ordered results — uses Iterator pipeline */
  search(query: string, items: readonly CommandItem[]): IteratorObject<SearchResult>;
  /** Remove items from index by id */
  remove(ids: ReadonlySet<ItemId>): void;
  /** Clear the entire index */
  clear(): void;
  /** Dispose resources */
  [Symbol.dispose](): void;
}
