import type { CommandItem } from 'modern-cmdk';
import { CommandRegistry, groupId, itemId } from 'modern-cmdk';
import { describe, expect, it } from 'vitest';

function makeItem(id: string, value?: string, gid?: string): CommandItem {
  return {
    id: itemId(id),
    value: value ?? id,
    groupId: gid ? groupId(gid) : undefined,
  };
}

describe('CommandRegistry', () => {
  it('should register and retrieve items', () => {
    using registry = new CommandRegistry();
    const item = makeItem('a', 'Apple');

    registry.registerItem(item);
    expect(registry.getItem(item.id)).toBe(item);
    expect(registry.size).toBe(1);
  });

  it('should unregister items', () => {
    using registry = new CommandRegistry();
    const item = makeItem('a', 'Apple');

    registry.registerItem(item);
    registry.unregisterItem(item.id);
    expect(registry.getItem(item.id)).toBeUndefined();
    expect(registry.size).toBe(0);
  });

  it('should return items in insertion order', () => {
    using registry = new CommandRegistry();
    registry.registerItem(makeItem('c', 'Cherry'));
    registry.registerItem(makeItem('a', 'Apple'));
    registry.registerItem(makeItem('b', 'Banana'));

    const items = registry.getItems();
    // ES2026 Iterator Helpers — use .map().toArray() on the items iterator
    const values = items
      .values()
      .map((i) => i.value)
      .toArray();
    expect(values).toEqual(['Cherry', 'Apple', 'Banana']);
  });

  it('should register items with Disposable pattern', () => {
    using registry = new CommandRegistry();

    {
      using _sub = registry.registerItem(makeItem('temp', 'Temporary'));
      expect(registry.size).toBe(1);
    }
    // After using block, item should be deregistered
    expect(registry.size).toBe(0);
  });

  it('should bulk register items', () => {
    using registry = new CommandRegistry();
    const items = [makeItem('a'), makeItem('b'), makeItem('c')];

    using _sub = registry.registerItems(items);
    expect(registry.size).toBe(3);
  });

  it('should bulk unregister using Set.difference', () => {
    using registry = new CommandRegistry();
    registry.registerItems([makeItem('a'), makeItem('b'), makeItem('c')]);

    const toRemove = new Set([itemId('a'), itemId('c')]);
    registry.unregisterItems(toRemove);

    expect(registry.size).toBe(1);
    expect(registry.getItem(itemId('b'))).toBeDefined();
  });

  it('should register and retrieve groups', () => {
    using registry = new CommandRegistry();
    const group = { id: groupId('g1'), heading: 'Group 1' };

    registry.registerGroup(group);
    expect(registry.getGroup(group.id)).toBe(group);
    expect(registry.groupCount).toBe(1);
  });

  it('should get grouped items using Object.groupBy', () => {
    using registry = new CommandRegistry();
    registry.registerGroup({ id: groupId('fruits'), heading: 'Fruits', priority: 0 });
    registry.registerGroup({ id: groupId('vegs'), heading: 'Vegetables', priority: 1 });
    registry.registerItem(makeItem('a', 'Apple', 'fruits'));
    registry.registerItem(makeItem('b', 'Banana', 'fruits'));
    registry.registerItem(makeItem('c', 'Carrot', 'vegs'));

    const grouped = registry.getGroupedItems();
    expect(grouped.get(groupId('fruits'))?.length).toBe(2);
    expect(grouped.get(groupId('vegs'))?.length).toBe(1);
  });

  it('should return item IDs as Set', () => {
    using registry = new CommandRegistry();
    registry.registerItems([makeItem('a'), makeItem('b')]);

    const ids = registry.getItemIds();
    expect(ids.size).toBe(2);
    expect(ids.has(itemId('a'))).toBe(true);
  });

  it('should intersect with candidate set (ES2026 Set.intersection)', () => {
    using registry = new CommandRegistry();
    registry.registerItems([makeItem('a'), makeItem('b'), makeItem('c')]);

    const candidates = new Set([itemId('b'), itemId('c'), itemId('d')]);
    const intersection = registry.intersectWith(candidates);

    expect(intersection.size).toBe(2);
    expect(intersection.has(itemId('b'))).toBe(true);
    expect(intersection.has(itemId('c'))).toBe(true);
  });

  it('should compute difference from another set (ES2026 Set.difference)', () => {
    using registry = new CommandRegistry();
    registry.registerItems([makeItem('a'), makeItem('b'), makeItem('c')]);

    const other = new Set([itemId('b')]);
    const diff = registry.differenceFrom(other);

    expect(diff.size).toBe(2);
    expect(diff.has(itemId('a'))).toBe(true);
    expect(diff.has(itemId('c'))).toBe(true);
  });

  it('should compute union with another set (ES2026 Set.union)', () => {
    using registry = new CommandRegistry();
    registry.registerItems([makeItem('a'), makeItem('b')]);

    const other = new Set([itemId('c'), itemId('d')]);
    const union = registry.unionWith(other);

    expect(union.size).toBe(4);
  });

  it('should clear all items and groups', () => {
    using registry = new CommandRegistry();
    registry.registerItems([makeItem('a'), makeItem('b')]);
    registry.registerGroup({ id: groupId('g'), heading: 'G' });

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.groupCount).toBe(0);
  });
});
