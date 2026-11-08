// packages/modern-cmdk/src/core/registry.ts
// Command/item registration — set operations (union/intersection/difference) for ID management
// Performance: O(1) registration/lookup via Map + Set, O(1) unregistration; order is the Map insertion order

import type { CommandGroup, CommandItem, GroupId, ItemId } from './types.js';
import { UNGROUPED_GROUP_ID } from './types.js';
import { mapGroupBy } from './utils/group-by.js';
import {
  setDifference,
  setIntersection,
  setIsDisjointFrom,
  setIsSubsetOf,
  setIsSupersetOf,
  setSymmetricDifference,
  setUnion,
} from './utils/set-ops.js';

/**
 * Manages registration and lookup of command items and groups.
 * Uses set operation helpers (union/intersection/difference) for efficient ID operations.
 * All registration methods return Disposable for automatic cleanup via `using`.
 */
export class CommandRegistry implements Disposable {
  #items = new Map<ItemId, CommandItem>();
  #groups = new Map<GroupId, CommandGroup>();
  #itemOrderSet = new Set<ItemId>(); // the id Set behind getItemIds() and the set operations
  #cachedItems: readonly CommandItem[] | null = null; // Invalidated on mutation
  #cachedGroups: readonly CommandGroup[] | null = null; // Invalidated on group mutation

  #invalidateCache(): void {
    this.#cachedItems = null;
  }

  #invalidateGroupCache(): void {
    this.#cachedGroups = null;
  }

  /** Register an item — returns Disposable for `using` auto-deregister */
  registerItem(item: CommandItem): Disposable {
    return this.registerItems([item]);
  }

  /** Register multiple items at once — single Disposable for batch cleanup. for...of for hot path. */
  registerItems(items: readonly CommandItem[]): Disposable {
    for (const item of items) {
      this.#items.set(item.id, item);
      this.#itemOrderSet.add(item.id);
    }
    this.#invalidateCache();

    return {
      // A stale handle must not delete a newer item registered under the same id
      [Symbol.dispose]: (): void => {
        for (const item of items) {
          if (this.#items.get(item.id) === item) this.unregisterItem(item.id);
        }
      },
    };
  }

  /** Unregister a single item — O(1) Map/Set delete */
  unregisterItem(id: ItemId): void {
    if (!this.#items.delete(id)) return;
    this.#itemOrderSet.delete(id);
    this.#invalidateCache();
  }

  /** Bulk unregister — for...of for hot path */
  unregisterItems(ids: ReadonlySet<ItemId>): void {
    for (const id of ids) {
      this.#items.delete(id);
      this.#itemOrderSet.delete(id);
    }
    this.#invalidateCache();
  }

  /** Register a group; throws a RangeError for {@link UNGROUPED_GROUP_ID}, the reserved bucket of ungrouped items */
  registerGroup(group: CommandGroup): Disposable {
    if (group.id === UNGROUPED_GROUP_ID) {
      throw new RangeError(`Group id "${UNGROUPED_GROUP_ID}" is reserved for ungrouped items`);
    }
    this.#groups.set(group.id, group);
    this.#invalidateGroupCache();
    return {
      [Symbol.dispose]: (): void => {
        if (this.#groups.get(group.id) === group) this.unregisterGroup(group.id);
      },
    };
  }

  /** Unregister a group */
  unregisterGroup(id: GroupId): void {
    this.#groups.delete(id);
    this.#invalidateGroupCache();
  }

  /** Get an item by ID — O(1) */
  getItem(id: ItemId): CommandItem | undefined {
    return this.#items.get(id);
  }

  /** Get a group by ID — O(1) */
  getGroup(id: GroupId): CommandGroup | undefined {
    return this.#groups.get(id);
  }

  /** Get all registered items in insertion order — cached between mutations */
  getItems(): readonly CommandItem[] {
    if (this.#cachedItems !== null) return this.#cachedItems;
    this.#cachedItems = this.#items.values().toArray();
    return this.#cachedItems;
  }

  /** Get all registered groups sorted by priority — cached between group mutations */
  getGroups(): readonly CommandGroup[] {
    if (this.#cachedGroups !== null) return this.#cachedGroups;
    this.#cachedGroups = this.#groups
      .values()
      .toArray()
      .toSorted((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    return this.#cachedGroups;
  }

  /** Get items grouped by groupId — direct Map, no Object.entries conversion */
  getGroupedItems(): ReadonlyMap<GroupId, readonly CommandItem[]> {
    const items = this.getItems();
    const grouped = mapGroupBy(items, (item) => item.groupId ?? UNGROUPED_GROUP_ID);

    // Build result in group priority order, then append ungrouped
    const result = new Map<GroupId, readonly CommandItem[]>();

    for (const group of this.getGroups()) {
      const groupItems = grouped.get(group.id);
      if (groupItems != null) {
        result.set(group.id, groupItems);
      }
    }

    // Add ungrouped items
    const ungrouped = grouped.get(UNGROUPED_GROUP_ID);
    if (ungrouped) {
      result.set(UNGROUPED_GROUP_ID, ungrouped);
    }

    return result;
  }

  /** Get item IDs as a Set — returns internal set (O(1), no allocation) */
  getItemIds(): ReadonlySet<ItemId> {
    return this.#itemOrderSet;
  }

  /** Find intersection of registered items with a candidate set */
  intersectWith(candidateIds: ReadonlySet<ItemId>): ReadonlySet<ItemId> {
    return setIntersection(this.#itemOrderSet, candidateIds);
  }

  /** Find items registered but not in a given set */
  differenceFrom(otherIds: ReadonlySet<ItemId>): ReadonlySet<ItemId> {
    return setDifference(this.#itemOrderSet, otherIds);
  }

  /** Union of registered IDs with another set */
  unionWith(otherIds: ReadonlySet<ItemId>): ReadonlySet<ItemId> {
    return setUnion(this.#itemOrderSet, otherIds);
  }

  /** Check if registered items are a subset of the given set */
  isSubsetOf(otherIds: ReadonlySet<ItemId>): boolean {
    return setIsSubsetOf(this.#itemOrderSet, otherIds);
  }

  /** Check if registered items are a superset of the given set */
  isSupersetOf(otherIds: ReadonlySet<ItemId>): boolean {
    return setIsSupersetOf(this.#itemOrderSet, otherIds);
  }

  /** Check if registered items share no IDs with the given set */
  isDisjointFrom(otherIds: ReadonlySet<ItemId>): boolean {
    return setIsDisjointFrom(this.#itemOrderSet, otherIds);
  }

  /** Symmetric difference between registered IDs and another set */
  symmetricDifferenceWith(otherIds: ReadonlySet<ItemId>): ReadonlySet<ItemId> {
    return setSymmetricDifference(this.#itemOrderSet, otherIds);
  }

  /** Total number of registered items */
  get size(): number {
    return this.#items.size;
  }

  /** Total number of registered groups */
  get groupCount(): number {
    return this.#groups.size;
  }

  /** Clear all items and groups */
  clear(): void {
    this.#items.clear();
    this.#groups.clear();
    this.#itemOrderSet.clear();
    this.#invalidateCache();
    this.#invalidateGroupCache();
  }

  [Symbol.dispose](): void {
    this.clear();
  }
}
