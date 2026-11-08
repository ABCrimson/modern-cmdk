import type { CommandItem } from 'modern-cmdk';
import { createSearchEngine, itemId } from 'modern-cmdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeItems(count: number): CommandItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: itemId(`item-${i}`),
    value: `Alpha ${i}`,
  }));
}

describe('SearchEngine.remove', () => {
  it('P40: remove() prunes the incremental cache in place, in work proportional to the ids', () => {
    using engine = createSearchEngine();
    const items = makeItems(500);
    engine.index(items);
    expect([...engine.search('alpha', items)]).toHaveLength(500);

    const ids = new Set([items[3]?.id, items[7]?.id].filter((id) => id !== undefined));
    const add = vi.spyOn(Set.prototype, 'add');
    const del = vi.spyOn(Set.prototype, 'delete');
    engine.remove(ids);

    // No copy of the 500-entry cache (a copy adds every id to a new Set; the spy also sees
    // vitest's own bookkeeping, which adds functions), one delete per id
    expect(add.mock.calls.filter(([value]) => typeof value === 'string')).toEqual([]);
    expect(del).toHaveBeenCalledTimes(ids.size);
  });

  it('P40: an extending query after remove() still excludes the removed items (TUB-68)', () => {
    using engine = createSearchEngine();
    const items = makeItems(20);
    engine.index(items);
    expect([...engine.search('alpha', items)]).toHaveLength(20);

    const removed = new Set([items[1]?.id, items[2]?.id].filter((id) => id !== undefined));
    engine.remove(removed);

    // The caller's list still holds the removed items: only the pruned cache can exclude them
    const extended = [...engine.search('alpha 1', items)].map((result) => result.id);
    expect(extended.length).toBeGreaterThan(0);
    for (const id of removed) expect(extended).not.toContain(id);
    expect(extended).toContain(items[10]?.id);
  });
});
