// packages/command/src/registry.ts
// Command/item registration — Set methods (union/intersection/difference) for ID management
// Performance: O(1) registration/lookup via Map + Set, O(1) order tracking via array + Set guard

import type { CommandGroup, CommandItem, GroupId, ItemId } from './types.js';

/**
 * Manages registration and lookup of command items and groups.
 * Uses ES2026 Set methods (union/intersection/difference) for efficient ID operations.
 * All registration methods return Disposable for automatic cleanup via `using`.
 */
export class CommandRegistry implements Disposable {
  #items = new Map<ItemId, CommandItem>();
  #groups = new Map<GroupId, CommandGroup>();
  #itemOrder: ItemId[] = [];
  #itemOrderSet = new Set<ItemId>(); // O(1) duplicate check during registration
  #cachedItems: readonly CommandItem[] | null = null; // Invalidated on mutation

  #invalidateCache(): void {
    this.#cachedItems = null;
  }

  /** Register an item — returns Disposable for `using` auto-deregister */
  registerItem(item: CommandItem): Disposable {
    this.#items.set(item.id, item);
    if (!this.#itemOrderSet.has(item.id)) {
      this.#itemOrder.push(item.id);
      this.#itemOrderSet.add(item.id);
    }
    this.#invalidateCache();

    return {
      [Symbol.dispose]: (): void => {
        this.unregisterItem(item.id);
      },
    };
  }

  /** Register multiple items at once — single Disposable for batch cleanup. for...of for hot path. */
  registerItems(items: readonly CommandItem[]): Disposable {
    for (const item of items) {
      this.#items.set(item.id, item);
      if (!this.#itemOrderSet.has(item.id)) {
        this.#itemOrder.push(item.id);
        this.#itemOrderSet.add(item.id);
      }
    }
    this.#invalidateCache();

    const ids = new Set(items.values().map((i) => i.id));
    return {
      [Symbol.dispose]: (): void => {
        for (const id of ids) this.unregisterItem(id);
      },
    };
  }

  /** Unregister a single item — O(1) Map delete + Set delete, O(n) order rebuild */
  unregisterItem(id: ItemId): void {
    if (!this.#items.has(id)) return;
    this.#items.delete(id);
    this.#itemOrderSet.delete(id);
    this.#itemOrder = this.#itemOrder.filter((orderId) => orderId !== id);
    this.#invalidateCache();
  }

  /** Bulk unregister using Set.difference (ES2026) — for...of for hot path */
  unregisterItems(ids: ReadonlySet<ItemId>): void {
    for (const id of ids) {
      this.#items.delete(id);
    }
    this.#itemOrderSet = this.#itemOrderSet.difference(ids);
    this.#itemOrder = this.#itemOrder.filter((id) => !ids.has(id));
    this.#invalidateCache();
  }

  /** Register a group */
  registerGroup(group: CommandGroup): Disposable {
    this.#groups.set(group.id, group);
    return {
      [Symbol.dispose]: (): void => {
        this.#groups.delete(group.id);
      },
    };
  }

  /** Unregister a group */
  unregisterGroup(id: GroupId): void {
    this.#groups.delete(id);
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
    this.#cachedItems = this.#itemOrder
      .values()
      .map((id) => this.#items.get(id))
      .filter((item): item is CommandItem => item != null)
      .toArray();
    return this.#cachedItems;
  }

  /** Get all registered groups sorted by priority */
  getGroups(): readonly CommandGroup[] {
    return this.#groups
      .values()
      .toArray()
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  }

  /** Get items grouped by groupId using Map.groupBy (ES2026) — direct Map, no Object.entries conversion */
  getGroupedItems(): ReadonlyMap<GroupId, readonly CommandItem[]> {
    const items = this.getItems();
    // Map.groupBy (ES2026) — returns Map<GroupId, CommandItem[]> directly
    const grouped = Map.groupBy(items, (item) => item.groupId ?? ('__ungrouped' as GroupId));

    // Build result in group priority order, then append ungrouped
    const result = new Map<GroupId, readonly CommandItem[]>();

    for (const group of this.getGroups()) {
      const groupItems = grouped.get(group.id);
      if (groupItems != null) {
        result.set(group.id, groupItems);
      }
    }

    // Add ungrouped items
    const ungrouped = grouped.get('__ungrouped' as GroupId);
    if (ungrouped) {
      result.set('__ungrouped' as GroupId, ungrouped);
    }

    return result;
  }

  /** Get item IDs as a Set — returns internal set (O(1), no allocation) */
  getItemIds(): ReadonlySet<ItemId> {
    return this.#itemOrderSet;
  }

  /** Find intersection of registered items with a candidate set (ES2026 Set.intersection) */
  intersectWith(candidateIds: ReadonlySet<ItemId>): ReadonlySet<ItemId> {
    return this.#itemOrderSet.intersection(candidateIds);
  }

  /** Find items registered but not in a given set (ES2026 Set.difference) */
  differenceFrom(otherIds: ReadonlySet<ItemId>): ReadonlySet<ItemId> {
    return this.#itemOrderSet.difference(otherIds);
  }

  /** Union of registered IDs with another set (ES2026 Set.union) */
  unionWith(otherIds: ReadonlySet<ItemId>): ReadonlySet<ItemId> {
    return this.#itemOrderSet.union(otherIds);
  }

  /** Check if registered items are a subset of the given set (ES2026 Set.isSubsetOf) */
  isSubsetOf(otherIds: ReadonlySet<ItemId>): boolean {
    return this.#itemOrderSet.isSubsetOf(otherIds);
  }

  /** Check if registered items are a superset of the given set (ES2026 Set.isSupersetOf) */
  isSupersetOf(otherIds: ReadonlySet<ItemId>): boolean {
    return this.#itemOrderSet.isSupersetOf(otherIds);
  }

  /** Check if registered items share no IDs with the given set (ES2026 Set.isDisjointFrom) */
  isDisjointFrom(otherIds: ReadonlySet<ItemId>): boolean {
    return this.#itemOrderSet.isDisjointFrom(otherIds);
  }

  /** Symmetric difference between registered IDs and another set (ES2026 Set.symmetricDifference) */
  symmetricDifferenceWith(otherIds: ReadonlySet<ItemId>): ReadonlySet<ItemId> {
    return this.#itemOrderSet.symmetricDifference(otherIds);
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
    this.#itemOrder = [];
    this.#itemOrderSet.clear();
    this.#invalidateCache();
  }

  [Symbol.dispose](): void {
    this.clear();
  }
}
