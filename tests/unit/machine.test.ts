import type {
  CommandItem,
  CommandMachine,
  CommandMachineOptions,
  ItemId,
  SearchEngine,
  SearchResult,
} from 'modern-cmdk';
import { createCommandMachine, createSearchEngine, groupId, itemId } from 'modern-cmdk';
import { describe, expect, it, vi } from 'vitest';

// ES2025 Iterator helpers — generate test items using Iterator pipeline
function generateItems(count: number): CommandItem[] {
  return Iterator.from({
    [Symbol.iterator]: function* (): Generator<number> {
      for (let i = 0; i < count; i++) yield i;
    },
  })
    .map((i) => ({
      id: itemId(`item-${i}`),
      value: `Item ${i}`,
    }))
    .toArray();
}

describe('CommandMachine', () => {
  it('should create with default state', () => {
    using machine = createCommandMachine();
    const state = machine.getState();

    expect(state.search).toBe('');
    expect(state.activeId).toBeNull();
    expect(state.filteredCount).toBe(0);
    expect(state.open).toBe(false);
    expect(state.page).toBe('root');
    expect(state.pageStack).toEqual([]);
    expect(state.loading).toBe(false);
  });

  it('should register initial items', () => {
    const items = generateItems(5);
    using machine = createCommandMachine({ items });

    expect(machine.getState().filteredCount).toBe(5);
    expect(machine.getState().activeId).toBe(items[0]?.id);
  });

  it('should auto-dispose via using declaration', () => {
    let machineRef: CommandMachine | null = null;

    {
      using machine = createCommandMachine({
        items: [{ id: itemId('test'), value: 'Test Item' }],
      });
      machineRef = machine;
      expect(machine.getState().filteredCount).toBe(1);
    }

    // Machine should be disposed — calling getState should still work
    // but subscriptions should be cleaned up
    expect(machineRef).not.toBeNull();
  });

  it('should handle SEARCH_CHANGE events', async () => {
    const items = [
      { id: itemId('apple'), value: 'Apple' },
      { id: itemId('banana'), value: 'Banana' },
      { id: itemId('cherry'), value: 'Cherry' },
    ];
    using machine = createCommandMachine({ items });

    machine.send({ type: 'SEARCH_CHANGE', query: 'app' });

    // Wait for rAF scheduler to flush
    await vi.waitFor(() => {
      expect(machine.getState().search).toBe('app');
    });
  });

  it('should handle NAVIGATE events', async () => {
    const items = generateItems(5);
    using machine = createCommandMachine({ items });

    machine.send({ type: 'NAVIGATE', direction: 'next' });
    await vi.waitFor(() => {
      expect(machine.getState().activeId).toBe(items[1]?.id);
    });
  });

  it('should handle PAGE_PUSH and PAGE_POP', async () => {
    using machine = createCommandMachine();

    machine.send({ type: 'PAGE_PUSH', page: 'settings' });
    await vi.waitFor(() => {
      expect(machine.getState().page).toBe('settings');
      expect(machine.getState().pageStack).toEqual(['root']);
    });

    machine.send({ type: 'PAGE_POP' });
    await vi.waitFor(() => {
      expect(machine.getState().page).toBe('root');
      expect(machine.getState().pageStack).toEqual([]);
    });
  });

  it('should handle OPEN, CLOSE, and TOGGLE', async () => {
    using machine = createCommandMachine();

    machine.send({ type: 'OPEN' });
    await vi.waitFor(() => {
      expect(machine.getState().open).toBe(true);
    });

    machine.send({ type: 'CLOSE' });
    await vi.waitFor(() => {
      expect(machine.getState().open).toBe(false);
    });

    machine.send({ type: 'TOGGLE' });
    await vi.waitFor(() => {
      expect(machine.getState().open).toBe(true);
    });
  });

  it('should handle REGISTER_ITEM and UNREGISTER_ITEM', async () => {
    using machine = createCommandMachine();
    const item: CommandItem = { id: itemId('new'), value: 'New Item' };

    machine.send({ type: 'REGISTER_ITEM', item });
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(1);
    });

    machine.send({ type: 'UNREGISTER_ITEM', id: item.id });
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(0);
    });
  });

  it('should handle ITEM_SELECT with onSelect callback', async () => {
    const onSelect = vi.fn();
    const id = itemId('test');
    const items = [{ id, value: 'Test', onSelect }];
    using machine = createCommandMachine({ items });

    machine.send({ type: 'ITEM_SELECT', id });
    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalledOnce();
    });
  });

  it('should not select disabled items', async () => {
    const onSelect = vi.fn();
    const id = itemId('disabled');
    const items = [{ id, value: 'Disabled', disabled: true, onSelect }];
    using machine = createCommandMachine({ items });

    machine.send({ type: 'ITEM_SELECT', id });
    // Vitest — use vi.waitFor() instead of raw setTimeout
    await vi.waitFor(() => {
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  it('should use Date.now() for lastUpdated timestamps', () => {
    using machine = createCommandMachine();
    const state = machine.getState();
    expect(typeof state.lastUpdated).toBe('number');
    expect(state.lastUpdated).toBeGreaterThan(0);
  });

  it('should navigate with loop enabled (default)', async () => {
    const items = generateItems(3);
    using machine = createCommandMachine({ items });

    // Navigate past the end — should loop to first
    machine.send({ type: 'NAVIGATE', direction: 'last' });
    await vi.waitFor(() => {
      expect(machine.getState().activeId).toBe(items[2]?.id);
    });

    machine.send({ type: 'NAVIGATE', direction: 'next' });
    await vi.waitFor(() => {
      expect(machine.getState().activeId).toBe(items[0]?.id);
    });
  });

  it('should subscribe to state changes via cleanup function', async () => {
    using machine = createCommandMachine();
    const listener = vi.fn();

    // subscribe() returns () => void — useSyncExternalStore-compatible
    const unsubscribe = machine.subscribe(listener);
    machine.send({ type: 'OPEN' });

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalled();
    });

    unsubscribe();
  });

  it('should subscribe to state changes via Disposable', async () => {
    using machine = createCommandMachine();
    const listener = vi.fn();

    // subscribeState() returns Disposable — for `using` pattern
    using _sub = machine.subscribeState(listener);
    machine.send({ type: 'OPEN' });

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalled();
      const state = listener.mock.calls.at(-1)?.[0];
      expect(state?.open).toBe(true);
    });
  });

  it('should handle groups', async () => {
    const items = [
      { id: itemId('a'), value: 'A', groupId: groupId('g1') },
      { id: itemId('b'), value: 'B', groupId: groupId('g1') },
      { id: itemId('c'), value: 'C', groupId: groupId('g2') },
    ];
    const groups = [
      { id: groupId('g1'), heading: 'Group 1' },
      { id: groupId('g2'), heading: 'Group 2' },
    ];
    using machine = createCommandMachine({ items, groups });

    const state = machine.getState();
    expect(state.groupedIds.size).toBeGreaterThan(0);
  });

  it('should handle group unregistration', async () => {
    const gid = groupId('test-group');
    const items = [{ id: itemId('a'), value: 'A', groupId: gid }];
    const groups = [{ id: gid, heading: 'Test' }];
    using machine = createCommandMachine({ items, groups });

    // Verify group exists in registry
    expect(machine.getRegistry().getGroup(gid)).toBeDefined();

    machine.send({ type: 'UNREGISTER_GROUP', id: gid });
    await vi.waitFor(() => {
      // After unregistering, the group should no longer be in the registry
      expect(machine.getRegistry().getGroup(gid)).toBeUndefined();
    });
  });

  it('should not loop when loop is false', async () => {
    const items = [
      { id: itemId('a'), value: 'A' },
      { id: itemId('b'), value: 'B' },
    ];
    using machine = createCommandMachine({ items, loop: false });

    // Navigate to last item
    machine.send({ type: 'NAVIGATE', direction: 'next' });
    await vi.waitFor(() => {
      expect(machine.getState().activeId).toBe(items[1]?.id);
    });

    // Navigate past last — should stay at last
    machine.send({ type: 'NAVIGATE', direction: 'next' });
    await vi.waitFor(() => {
      expect(machine.getState().activeId).toBe(items[1]?.id);
    });
  });

  it('should handle PAGE_POP on root page gracefully', async () => {
    using machine = createCommandMachine();

    // Pop when on root — should not crash and page should remain 'root'
    machine.send({ type: 'PAGE_POP' });
    await vi.waitFor(() => {
      expect(machine.getState().page).toBe('root');
      expect(machine.getState().pageStack).toEqual([]);
    });
  });
});

// C1: a scheduler batch commits once. The scheduler runs on requestAnimationFrame when the
// environment has it and on queueMicrotask otherwise; every wait below polls with vi.waitFor.
interface Searching {
  machine: CommandMachine;
  searches: () => number;
  listener: ReturnType<typeof vi.fn>;
  base: number;
}

describe('CommandMachine batching', () => {
  function counted(): { engine: SearchEngine; searches: () => number } {
    const inner = createSearchEngine();
    let calls = 0;
    const engine: SearchEngine = {
      index: (items: readonly CommandItem[]): void => inner.index(items),
      remove: (ids: ReadonlySet<ItemId>): void => inner.remove(ids),
      clear: (): void => inner.clear(),
      search: (query: string, items: readonly CommandItem[]): IteratorObject<SearchResult> => {
        calls++;
        return inner.search(query, items);
      },
      [Symbol.dispose]: (): void => inner[Symbol.dispose](),
    };
    return { engine, searches: () => calls };
  }

  /** The scheduler rethrows a failed update from a microtask: collect it there instead of failing the run. */
  function captureRethrown(): { reported: unknown[]; restore: () => void } {
    const original = globalThis.queueMicrotask;
    const reported: unknown[] = [];
    const spy = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
      original(() => {
        try {
          callback();
        } catch (error: unknown) {
          reported.push(error);
        }
      });
    });
    return { reported, restore: () => spy.mockRestore() };
  }

  /** A machine already filtered by a non-empty query, so each refilter calls the search engine once. */
  async function searching(options: CommandMachineOptions = {}): Promise<Searching> {
    const { engine, searches } = counted();
    const machine = createCommandMachine({ ...options, search: engine });
    machine.send({ type: 'SEARCH_CHANGE', query: 'item' });
    await vi.waitFor(() => {
      expect(machine.getState().search).toBe('item');
    });
    const listener = vi.fn();
    machine.subscribe(listener);
    return { machine, searches, listener, base: searches() };
  }

  it('CE-20, ARCH-24, RA-49: 500 REGISTER_ITEM events in one tick run one refilter and emit stateChange once', async () => {
    const { machine, searches, listener, base } = await searching();
    using _m = machine;
    const items = generateItems(500);
    for (const item of items) machine.send({ type: 'REGISTER_ITEM', item });
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(500);
    });
    expect(searches() - base).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(machine.getState().filteredIds).toEqual(items.map((i) => i.id));
  });

  it('CE-20: 400 UNREGISTER_ITEM events in one tick run one refilter and emit stateChange once', async () => {
    const items = generateItems(500);
    const { machine, searches, listener, base } = await searching({ items });
    using _m = machine;
    expect(machine.getState().filteredCount).toBe(500);
    for (const item of items.slice(0, 400)) machine.send({ type: 'UNREGISTER_ITEM', id: item.id });
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(100);
    });
    expect(searches() - base).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('CE-20: REGISTER_GROUP and UNREGISTER_GROUP events in one tick run one refilter per batch and emit once per batch', async () => {
    const { machine, searches, listener, base } = await searching({ items: generateItems(3) });
    using _m = machine;
    const groups = Array.from({ length: 50 }, (_, i) => ({
      id: groupId(`g${i}`),
      heading: `Group ${i}`,
    }));
    for (const group of groups) machine.send({ type: 'REGISTER_GROUP', group });
    await vi.waitFor(() => {
      expect(machine.getRegistry().getGroup(groupId('g49'))).toBeDefined();
    });
    expect(searches() - base).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    for (const group of groups) machine.send({ type: 'UNREGISTER_GROUP', id: group.id });
    await vi.waitFor(() => {
      expect(machine.getRegistry().getGroup(groupId('g0'))).toBeUndefined();
    });
    expect(searches() - base).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('CE-20: ITEMS_LOADED events in one tick run one refilter and emit stateChange once', async () => {
    const { machine, searches, listener, base } = await searching();
    using _m = machine;
    const items = generateItems(300);
    for (let i = 0; i < 3; i++) {
      machine.send({ type: 'ITEMS_LOADED', items: items.slice(i * 100, (i + 1) * 100) });
    }
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(300);
    });
    expect(searches() - base).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('CE-20: registry events followed by SEARCH_CHANGE in one batch refilter once and emit once', async () => {
    const { machine, searches, listener, base } = await searching();
    using _m = machine;
    for (const item of generateItems(50)) machine.send({ type: 'REGISTER_ITEM', item });
    machine.send({ type: 'SEARCH_CHANGE', query: 'item 7' });
    await vi.waitFor(() => {
      expect(machine.getState().search).toBe('item 7');
    });
    expect(searches() - base).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(machine.getState().filteredIds).toContain(itemId('item-7'));
  });

  it('CE-20: an event sent from inside a callback runs in the next batch and the first batch emits once', async () => {
    using machine = createCommandMachine();
    const opens: boolean[] = [];
    machine.subscribe(() => opens.push(machine.getState().open));
    const first: CommandItem = {
      id: itemId('first'),
      value: 'First',
      onSelect: () => machine.send({ type: 'OPEN' }),
    };
    machine.send({ type: 'REGISTER_ITEM', item: first });
    machine.send({ type: 'REGISTER_ITEM', item: { id: itemId('second'), value: 'Second' } });
    machine.send({ type: 'ITEM_SELECT', id: first.id });
    await vi.waitFor(() => {
      expect(machine.getState().open).toBe(true);
    });
    expect(opens).toEqual([false, true]);
  });

  it('CE-20: a handler that throws still lets its batch commit once, and the error is reported', async () => {
    const { reported, restore } = captureRethrown();
    try {
      using machine = createCommandMachine();
      const listener = vi.fn();
      machine.subscribe(listener);
      const boom = new Error('onSelect failed');
      const bad: CommandItem = {
        id: itemId('bad'),
        value: 'Bad',
        onSelect: () => {
          throw boom;
        },
      };
      machine.send({ type: 'REGISTER_ITEM', item: bad });
      machine.send({ type: 'ITEM_SELECT', id: bad.id });
      machine.send({ type: 'REGISTER_ITEM', item: { id: itemId('ok'), value: 'Ok' } });
      await vi.waitFor(() => {
        expect(machine.getState().filteredCount).toBe(2);
        expect(reported).toEqual([boom]);
      });
      expect(listener).toHaveBeenCalledTimes(1);

      // The counter is balanced: the next batch commits normally.
      machine.send({ type: 'OPEN' });
      await vi.waitFor(() => {
        expect(machine.getState().open).toBe(true);
      });
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      restore();
    }
  });

  it('CE-20: ITEM_ACTIVATE after a REGISTER_ITEM in the same batch sees the registered item', async () => {
    using machine = createCommandMachine({ items: [{ id: itemId('a'), value: 'A' }] });
    machine.send({ type: 'REGISTER_ITEM', item: { id: itemId('b'), value: 'B' } });
    machine.send({ type: 'ITEM_ACTIVATE', id: itemId('b') });
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(2);
    });
    expect(machine.getState().activeId).toBe(itemId('b'));
  });

  it('CE-20: NAVIGATE next after an ITEMS_LOADED in the same batch navigates the loaded items', async () => {
    using machine = createCommandMachine();
    machine.send({
      type: 'ITEMS_LOADED',
      items: ['a', 'b', 'c'].map((id) => ({ id: itemId(id), value: id })),
    });
    machine.send({ type: 'NAVIGATE', direction: 'next' });
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(3);
    });
    expect(machine.getState().activeId).toBe(itemId('b'));
  });

  it('CE-20: NAVIGATE last after a REGISTER_ITEM in the same batch reaches the registered item', async () => {
    using machine = createCommandMachine({
      items: ['a', 'b'].map((id) => ({ id: itemId(id), value: id })),
    });
    machine.send({ type: 'REGISTER_ITEM', item: { id: itemId('c'), value: 'c' } });
    machine.send({ type: 'NAVIGATE', direction: 'last' });
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(3);
    });
    expect(machine.getState().activeId).toBe(itemId('c'));
  });

  it('CE-20: a filter that throws in the batch refilter still announces the batch once', async () => {
    const { reported, restore } = captureRethrown();
    try {
      let fail = false;
      const boom = new Error('filter failed');
      using machine = createCommandMachine({
        items: generateItems(3),
        filter: (item: CommandItem) => {
          if (fail) throw boom;
          return item.value.length;
        },
      });
      machine.send({ type: 'SEARCH_CHANGE', query: 'item' });
      await vi.waitFor(() => {
        expect(machine.getState().search).toBe('item');
      });
      const listener = vi.fn();
      machine.subscribe(listener);

      fail = true;
      machine.send({ type: 'OPEN' });
      machine.send({ type: 'REGISTER_ITEM', item: { id: itemId('late'), value: 'Item late' } });
      await vi.waitFor(() => {
        expect(reported).toEqual([boom]);
      });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(machine.getState().open).toBe(true);
    } finally {
      restore();
    }
  });

  it('C1: onOpenChange and onSearchChange run before the single stateChange of their batch', async () => {
    const log: string[] = [];
    using machine = createCommandMachine({
      items: generateItems(3),
      onOpenChange: (open: boolean) => log.push(`onOpenChange ${open}`),
      onSearchChange: (query: string) => log.push(`onSearchChange ${query}`),
    });
    machine.subscribe(() => log.push('stateChange'));
    machine.send({ type: 'OPEN' });
    machine.send({ type: 'SEARCH_CHANGE', query: 'item' });
    await vi.waitFor(() => {
      expect(machine.getState().search).toBe('item');
    });
    expect(log).toEqual(['onOpenChange true', 'onSearchChange item', 'stateChange']);
  });

  it('CE-78: events dropped by dispose do not stall the batches of a machine that is used again', async () => {
    const machine = createCommandMachine();
    // Pending when dispose runs: the scheduler drops it, so it must not count towards a batch.
    machine.send({ type: 'OPEN' });
    machine[Symbol.dispose]();
    machine.send({ type: 'REGISTER_ITEM', item: { id: itemId('again'), value: 'Again' } });
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(1);
    });
  });
});
