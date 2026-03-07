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

  /** Register an item — returns Disposable for `using` auto-deregister */
  registerItem(item: CommandItem): Disposable {
    this.#items.set(item.id, item);
    if (!this.#itemOrderSet.has(item.id)) {
      this.#itemOrder.push(item.id);
      this.#itemOrderSet.add(item.id);
    }

    return {
      [Symbol.dispose]: (): void => {
        this.unregisterItem(item.id);
      },
    };
  }

  /** Register multiple items at once — single Disposable for batch cleanup */
  registerItems(items: readonly CommandItem[]): Disposable {
    items.values().forEach((item) => {
      this.#items.set(item.id, item);
      if (!this.#itemOrderSet.has(item.id)) {
        this.#itemOrder.push(item.id);
        this.#itemOrderSet.add(item.id);
      }
    });

    const ids = new Set(items.values().map((i) => i.id));
    return {
      [Symbol.dispose]: (): void => {
        ids.values().forEach((id) => this.unregisterItem(id));
      },
    };
  }

  /** Unregister a single item — O(1) Map delete + Set delete, O(n) order rebuild */
  unregisterItem(id: ItemId): void {
    if (!this.#items.has(id)) return;
    this.#items.delete(id);
    this.#itemOrderSet.delete(id);
    // Rebuild order array without the removed ID
    this.#itemOrder = this.#itemOrder.filter((orderId) => orderId !== id);
  }

  /** Bulk unregister using Set.difference (ES2026) */
  unregisterItems(ids: ReadonlySet<ItemId>): void {
    ids.values().forEach((id) => {
      this.#items.delete(id);
    });
    // Rebuild order using Set.difference for remaining IDs
    this.#itemOrderSet = this.#itemOrderSet.difference(ids);
    this.#itemOrder = this.#itemOrder.filter((id) => !ids.has(id));
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

  /** Get all registered items in insertion order */
  getItems(): readonly CommandItem[] {
    return this.#itemOrder
      .values()
      .map((id) => this.#items.get(id))
      .filter((item): item is CommandItem => item != null)
      .toArray();
  }

  /** Get all registered groups sorted by priority */
  getGroups(): readonly CommandGroup[] {
    return this.#groups
      .values()
      .toArray()
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  }

  /** Get items grouped by groupId using Object.groupBy (ES2026) + Iterator Helpers */
  getGroupedItems(): ReadonlyMap<GroupId, readonly CommandItem[]> {
    const items = this.getItems();
    const grouped = Object.groupBy(items, (item) => item.groupId ?? ('__ungrouped' as GroupId));
    const result = new Map<GroupId, readonly CommandItem[]>();

    // Populate groups using Iterator Helpers pipeline
    this.getGroups()
      .values()
      .filter((group) => grouped[group.id as string] != null)
      .forEach((group) => {
        result.set(group.id, grouped[group.id as string]!);
      });

    // Add ungrouped items
    const ungrouped = grouped['__ungrouped' as string];
    if (ungrouped) {
      result.set('__ungrouped' as GroupId, ungrouped);
    }

    return result;
  }

  /** Get item IDs as a Set — useful for Set operations */
  getItemIds(): ReadonlySet<ItemId> {
    return new Set(this.#items.keys());
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
  }

  [Symbol.dispose](): void {
    this.clear();
  }
}
