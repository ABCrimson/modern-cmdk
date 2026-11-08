import type { CommandItem } from 'modern-cmdk';
import { CommandRegistry, groupId, itemId } from 'modern-cmdk';
import { describe, expect, it, vi } from 'vitest';
import { UNGROUPED_GROUP_ID } from '../../packages/modern-cmdk/src/core/types.js';

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
    // ES2025 Iterator helpers — use .map().toArray() on the items iterator
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

  it('should bulk unregister items', () => {
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

  it('should group items by group id', () => {
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

  it('should intersect with a candidate set', () => {
    using registry = new CommandRegistry();
    registry.registerItems([makeItem('a'), makeItem('b'), makeItem('c')]);

    const candidates = new Set([itemId('b'), itemId('c'), itemId('d')]);
    const intersection = registry.intersectWith(candidates);

    expect(intersection.size).toBe(2);
    expect(intersection.has(itemId('b'))).toBe(true);
    expect(intersection.has(itemId('c'))).toBe(true);
  });

  it('should compute the difference from another set', () => {
    using registry = new CommandRegistry();
    registry.registerItems([makeItem('a'), makeItem('b'), makeItem('c')]);

    const other = new Set([itemId('b')]);
    const diff = registry.differenceFrom(other);

    expect(diff.size).toBe(2);
    expect(diff.has(itemId('a'))).toBe(true);
    expect(diff.has(itemId('c'))).toBe(true);
  });

  // D33: differenceFrom stays tested while it is public; CE-121 (1.12.0) decides whether it stays.
  it("CE-79: differenceFrom returns the registered ids absent from the given set and none of the given set's own ids", () => {
    using registry = new CommandRegistry();
    registry.registerItems([makeItem('a'), makeItem('b'), makeItem('c')]);

    // 'b' is registered and shared, 'z' is not registered: a symmetric difference would add 'z'
    const diff = registry.differenceFrom(new Set([itemId('b'), itemId('z')]));

    expect([...diff].sort()).toEqual(['a', 'c']);
  });

  it('should compute the union with another set', () => {
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

describe('CommandRegistry order (CE-56, P40)', () => {
  const ids = (registry: CommandRegistry): string[] => registry.getItems().map((i) => i.id);

  it('unregister then register appends the item at the end', () => {
    using registry = new CommandRegistry();
    registry.registerItems([makeItem('a'), makeItem('b'), makeItem('c')]);
    registry.unregisterItem(itemId('a'));
    registry.registerItem(makeItem('a'));
    expect(ids(registry)).toEqual(['b', 'c', 'a']);
  });

  it('re-registering an existing id keeps its position and replaces the item', () => {
    using registry = new CommandRegistry();
    registry.registerItems([makeItem('a'), makeItem('b'), makeItem('c')]);
    const next = makeItem('b', 'Bravo');
    registry.registerItem(next);
    expect(ids(registry)).toEqual(['a', 'b', 'c']);
    expect(registry.getItem(itemId('b'))).toBe(next);
    expect(registry.size).toBe(3);
  });

  it('unregisterItems keeps the order of the remaining items and of later registrations', () => {
    using registry = new CommandRegistry();
    registry.registerItems([makeItem('a'), makeItem('b'), makeItem('c'), makeItem('d')]);
    registry.unregisterItems(new Set([itemId('b'), itemId('c')]));
    expect(ids(registry)).toEqual(['a', 'd']);
    registry.registerItem(makeItem('b'));
    expect(ids(registry)).toEqual(['a', 'd', 'b']);
    expect([...registry.getItemIds()]).toEqual(['a', 'd', 'b']);
  });

  it('unregisterItem copies no order array per item', () => {
    using registry = new CommandRegistry();
    registry.registerItems([makeItem('a'), makeItem('b'), makeItem('c')]);
    const toSpliced = vi.spyOn(Array.prototype, 'toSpliced');
    try {
      registry.unregisterItem(itemId('b'));
      expect(toSpliced).not.toHaveBeenCalled();
    } finally {
      toSpliced.mockRestore();
    }
    expect(ids(registry)).toEqual(['a', 'c']);
  });
});

describe('CommandRegistry disposers (CE-54)', () => {
  it('a stale registerItem handle does not remove a newer item with the same id', () => {
    using registry = new CommandRegistry();
    const stale = registry.registerItem(makeItem('a', 'old'));
    const next = makeItem('a', 'new');
    registry.registerItem(next);
    stale[Symbol.dispose]();
    expect(registry.getItem(itemId('a'))).toBe(next);
    expect(registry.size).toBe(1);
  });

  it('a live registerItem handle still removes its item', () => {
    using registry = new CommandRegistry();
    const handle = registry.registerItem(makeItem('a'));
    handle[Symbol.dispose]();
    expect(registry.size).toBe(0);
  });

  it('a stale registerItems handle removes only the ids still mapped to its batch', () => {
    using registry = new CommandRegistry();
    const stale = registry.registerItems([makeItem('a'), makeItem('b'), makeItem('c')]);
    const newer = makeItem('b', 'new');
    registry.registerItem(newer);
    stale[Symbol.dispose]();
    expect(registry.getItems()).toEqual([newer]);
    expect([...registry.getItemIds()]).toEqual(['b']);
  });

  it('a registerItems handle owns the items it was given: an array the caller mutates later changes nothing', () => {
    using registry = new CommandRegistry();
    const list = [makeItem('a')];
    const handle = registry.registerItems(list);
    const b = makeItem('b');
    list.push(b);
    registry.registerItem(b); // another handle owns b
    handle[Symbol.dispose]();
    expect(registry.getItem(itemId('a'))).toBeUndefined();
    expect(registry.getItem(itemId('b'))).toBe(b);
  });

  it('a stale registerGroup handle does not remove a newer group with the same id', () => {
    using registry = new CommandRegistry();
    const stale = registry.registerGroup({ id: groupId('g'), heading: 'Old' });
    const next = { id: groupId('g'), heading: 'New' };
    registry.registerGroup(next);
    stale[Symbol.dispose]();
    expect(registry.getGroup(groupId('g'))).toBe(next);
    const live = registry.registerGroup({ id: groupId('h'), heading: 'H' });
    live[Symbol.dispose]();
    expect(registry.getGroup(groupId('h'))).toBeUndefined();
  });
});

describe('CommandRegistry reserved group id (CE-50)', () => {
  it('CE-50: UNGROUPED_GROUP_ID keeps the value "__ungrouped" (the groupedIds key stays observable)', () => {
    expect(UNGROUPED_GROUP_ID).toBe('__ungrouped');
  });

  it('CE-50: the ungrouped bucket of getGroupedItems() is keyed by UNGROUPED_GROUP_ID', () => {
    using registry = new CommandRegistry();
    registry.registerItem(makeItem('a'));
    expect([...registry.getGroupedItems().keys()]).toEqual([UNGROUPED_GROUP_ID]);
  });
});

describe('CommandRegistry set predicates, groups and caches (TUB-26)', () => {
  const ids = (...names: string[]): Set<ReturnType<typeof itemId>> => new Set(names.map(itemId));
  const abc = (): CommandRegistry => {
    const registry = new CommandRegistry();
    registry.registerItems([makeItem('a'), makeItem('b'), makeItem('c')]);
    return registry;
  };

  it('isSubsetOf is true when every registered id is in the given set', () => {
    using registry = abc();
    expect(registry.isSubsetOf(ids('a', 'b', 'c', 'd'))).toBe(true);
    expect(registry.isSubsetOf(ids('a', 'b', 'c'))).toBe(true);
    expect(registry.isSubsetOf(ids('a', 'b'))).toBe(false);
  });

  it('isSupersetOf is true when every id of the given set is registered', () => {
    using registry = abc();
    expect(registry.isSupersetOf(ids('a', 'c'))).toBe(true);
    expect(registry.isSupersetOf(ids())).toBe(true);
    expect(registry.isSupersetOf(ids('a', 'z'))).toBe(false);
  });

  it('isDisjointFrom is true only when no id is shared', () => {
    using registry = abc();
    expect(registry.isDisjointFrom(ids('x', 'y'))).toBe(true);
    expect(registry.isDisjointFrom(ids('c', 'y'))).toBe(false);
  });

  it('symmetricDifferenceWith returns the ids that are in exactly one of the two sets', () => {
    using registry = abc();
    expect([...registry.symmetricDifferenceWith(ids('b', 'c', 'd'))].sort()).toEqual(['a', 'd']);
  });

  it('CE-79: differenceFrom and symmetricDifferenceWith differ on the same inputs', () => {
    using registry = abc();
    const given = ids('b', 'x');
    expect([...registry.differenceFrom(given)].sort()).toEqual(['a', 'c']);
    expect([...registry.symmetricDifferenceWith(given)].sort()).toEqual(['a', 'c', 'x']);
  });

  it('unregisterGroup removes the group, its count and its entry in getGroups()', () => {
    using registry = new CommandRegistry();
    registry.registerGroup({ id: groupId('g1'), heading: 'One' });
    registry.registerGroup({ id: groupId('g2'), heading: 'Two' });
    expect(registry.getGroups()).toHaveLength(2);
    registry.unregisterGroup(groupId('g1'));
    expect(registry.getGroup(groupId('g1'))).toBeUndefined();
    expect(registry.groupCount).toBe(1);
    expect(registry.getGroups().map((g) => g.id)).toEqual(['g2']);
  });

  it('getGroups sorts by priority (lower first, default 0), stable for equal priorities', () => {
    using registry = new CommandRegistry();
    registry.registerGroup({ id: groupId('late'), priority: 5 });
    registry.registerGroup({ id: groupId('first-zero') });
    registry.registerGroup({ id: groupId('early'), priority: -1 });
    registry.registerGroup({ id: groupId('second-zero'), priority: 0 });
    expect(registry.getGroups().map((g) => g.id)).toEqual([
      'early',
      'first-zero',
      'second-zero',
      'late',
    ]);
  });

  it('getGroupedItems lists groups by priority, then the ungrouped bucket last', () => {
    using registry = new CommandRegistry();
    registry.registerGroup({ id: groupId('b'), priority: 2 });
    registry.registerGroup({ id: groupId('a'), priority: 1 });
    registry.registerGroup({ id: groupId('empty'), priority: 0 });
    registry.registerItems([
      makeItem('loose'),
      makeItem('in-b', 'B', 'b'),
      makeItem('in-a', 'A', 'a'),
    ]);
    const grouped = registry.getGroupedItems();
    // A group without items is left out; ungrouped items come after every registered group
    expect([...grouped.keys()]).toEqual(['a', 'b', UNGROUPED_GROUP_ID]);
    expect(grouped.get(UNGROUPED_GROUP_ID)?.map((i) => i.id)).toEqual(['loose']);
  });

  it('getItems returns the same array until a mutation, then a new one', () => {
    using registry = abc();
    const first = registry.getItems();
    expect(registry.getItems()).toBe(first);

    registry.registerItem(makeItem('d'));
    const second = registry.getItems();
    expect(second).not.toBe(first);
    expect(second.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(registry.getItems()).toBe(second);

    registry.unregisterItem(itemId('d'));
    expect(registry.getItems()).not.toBe(second);
    const third = registry.getItems();
    registry.unregisterItems(ids('a'));
    expect(registry.getItems()).not.toBe(third);
  });

  it('getItems is not invalidated by a group mutation, getGroups is not invalidated by an item mutation', () => {
    using registry = abc();
    registry.registerGroup({ id: groupId('g') });
    const items = registry.getItems();
    const groups = registry.getGroups();
    registry.registerGroup({ id: groupId('h') });
    expect(registry.getItems()).toBe(items);
    expect(registry.getGroups()).not.toBe(groups);
    const groups2 = registry.getGroups();
    registry.registerItem(makeItem('d'));
    expect(registry.getGroups()).toBe(groups2);
  });

  it('registering an existing id again replaces the item and refreshes the getItems cache', () => {
    using registry = abc();
    const before = registry.getItems();
    const replacement = makeItem('b', 'Replaced');
    registry.registerItem(replacement);
    expect(registry.getItems()).not.toBe(before);
    expect(registry.getItems()[1]).toBe(replacement);
    expect(registry.size).toBe(3);
    expect(registry.getItemIds().size).toBe(3);
  });
});
