import type {
  CommandItem,
  CommandMachine,
  CommandMachineOptions,
  ItemId,
  SearchEngine,
  SearchResult,
} from 'modern-cmdk';
import { createCommandMachine, createSearchEngine, groupId, itemId } from 'modern-cmdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The scheduler batches on requestAnimationFrame (happy-dom has it). Each test fakes only the frame
// clock: nextBatch() runs the pending batch synchronously, so a wait cannot pass before the event ran.
// queueMicrotask and the other timers stay real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Runs the batch the scheduler has pending (one animation frame) */
function nextBatch(): void {
  vi.advanceTimersToNextFrame();
}

/**
 * Runs the pending batch and proves it ran: events run in order, so once the page this call pushed
 * is current, everything sent before it has been handled too. Every call pushes a page no earlier call pushed.
 */
let pages = 0;
function settle(machine: CommandMachine): void {
  const page = `settled-${++pages}`;
  machine.send({ type: 'PAGE_PUSH', page });
  nextBatch();
  expect(machine.getState().page).toBe(page);
}

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

  it('TUB-39: the using scope disposes the machine: the registry and the keyboard registry are cleared', () => {
    let machineRef: CommandMachine | null = null;

    {
      using machine = createCommandMachine({
        items: [{ id: itemId('test'), value: 'Test Item', shortcut: 'Ctrl+K', onSelect: () => {} }],
      });
      machineRef = machine;
      expect(machine.getState().filteredCount).toBe(1);
      expect(machine.getRegistry().size).toBe(1);
      expect(machine.getKeyboardRegistry().getBindings().size).toBe(1);
    }

    // The using scope disposed the machine: the registry and the keyboard registry are empty
    expect(machineRef?.getRegistry().size).toBe(0);
    expect(machineRef?.getKeyboardRegistry().getBindings().size).toBe(0);
  });

  it('should handle SEARCH_CHANGE events', () => {
    const items = [
      { id: itemId('apple'), value: 'Apple' },
      { id: itemId('banana'), value: 'Banana' },
      { id: itemId('cherry'), value: 'Cherry' },
    ];
    using machine = createCommandMachine({ items });

    machine.send({ type: 'SEARCH_CHANGE', query: 'app' });

    // Run the rAF scheduler's batch
    nextBatch();
    expect(machine.getState().search).toBe('app');
  });

  it('should handle NAVIGATE events', () => {
    const items = generateItems(5);
    using machine = createCommandMachine({ items });

    machine.send({ type: 'NAVIGATE', direction: 'next' });
    nextBatch();
    expect(machine.getState().activeId).toBe(items[1]?.id);
  });

  it('should handle PAGE_PUSH and PAGE_POP', () => {
    using machine = createCommandMachine();

    machine.send({ type: 'PAGE_PUSH', page: 'settings' });
    nextBatch();
    expect(machine.getState().page).toBe('settings');
    expect(machine.getState().pageStack).toEqual(['root']);

    machine.send({ type: 'PAGE_POP' });
    nextBatch();
    expect(machine.getState().page).toBe('root');
    expect(machine.getState().pageStack).toEqual([]);
  });

  it('should handle OPEN, CLOSE, and TOGGLE', () => {
    using machine = createCommandMachine();

    machine.send({ type: 'OPEN' });
    nextBatch();
    expect(machine.getState().open).toBe(true);

    machine.send({ type: 'CLOSE' });
    nextBatch();
    expect(machine.getState().open).toBe(false);

    machine.send({ type: 'TOGGLE' });
    nextBatch();
    expect(machine.getState().open).toBe(true);
  });

  it('should handle REGISTER_ITEM and UNREGISTER_ITEM', () => {
    using machine = createCommandMachine();
    const item: CommandItem = { id: itemId('new'), value: 'New Item' };

    machine.send({ type: 'REGISTER_ITEM', item });
    nextBatch();
    expect(machine.getState().filteredCount).toBe(1);

    machine.send({ type: 'UNREGISTER_ITEM', id: item.id });
    nextBatch();
    expect(machine.getState().filteredCount).toBe(0);
  });

  it('should handle ITEM_SELECT with onSelect callback', () => {
    const onSelect = vi.fn();
    const id = itemId('test');
    const items = [{ id, value: 'Test', onSelect }];
    using machine = createCommandMachine({ items });

    machine.send({ type: 'ITEM_SELECT', id });
    nextBatch();
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('T15: a disabled item is not selected: the batch that runs ITEM_SELECT leaves its onSelect uncalled', () => {
    const onSelect = vi.fn();
    const enabledSelect = vi.fn();
    const optionsSelect = vi.fn();
    const id = itemId('disabled');
    const enabledId = itemId('enabled');
    const items = [
      { id, value: 'Disabled', disabled: true, onSelect },
      { id: enabledId, value: 'Enabled', onSelect: enabledSelect },
    ];
    using machine = createCommandMachine({ items, onSelect: optionsSelect });

    machine.send({ type: 'ITEM_SELECT', id });
    machine.send({ type: 'ITEM_SELECT', id: enabledId });
    // Nothing runs before the frame: the scheduler holds both events
    expect(enabledSelect).not.toHaveBeenCalled();

    nextBatch();
    // The frame ran both events: the enabled sibling was selected, the disabled item was not
    expect(enabledSelect).toHaveBeenCalledOnce();
    expect(optionsSelect).toHaveBeenCalledExactlyOnceWith(enabledId);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('should use Date.now() for lastUpdated timestamps', () => {
    using machine = createCommandMachine();
    const state = machine.getState();
    expect(typeof state.lastUpdated).toBe('number');
    expect(state.lastUpdated).toBeGreaterThan(0);
  });

  it('should navigate with loop enabled (default)', () => {
    const items = generateItems(3);
    using machine = createCommandMachine({ items });

    // Navigate past the end — should loop to first
    machine.send({ type: 'NAVIGATE', direction: 'last' });
    nextBatch();
    expect(machine.getState().activeId).toBe(items[2]?.id);

    machine.send({ type: 'NAVIGATE', direction: 'next' });
    nextBatch();
    expect(machine.getState().activeId).toBe(items[0]?.id);
  });

  it('should subscribe to state changes via cleanup function', () => {
    using machine = createCommandMachine();
    const listener = vi.fn();

    // subscribe() returns () => void — useSyncExternalStore-compatible
    const unsubscribe = machine.subscribe(listener);
    machine.send({ type: 'OPEN' });

    nextBatch();
    expect(listener).toHaveBeenCalled();

    unsubscribe();
  });

  it('should subscribe to state changes via Disposable', () => {
    using machine = createCommandMachine();
    const listener = vi.fn();

    // subscribeState() returns Disposable — for `using` pattern
    using _sub = machine.subscribeState(listener);
    machine.send({ type: 'OPEN' });

    nextBatch();
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls.at(-1)?.[0]?.open).toBe(true);
  });

  it('should handle groups', () => {
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

  it('should handle group unregistration', () => {
    const gid = groupId('test-group');
    const items = [{ id: itemId('a'), value: 'A', groupId: gid }];
    const groups = [{ id: gid, heading: 'Test' }];
    using machine = createCommandMachine({ items, groups });

    // Verify group exists in registry
    expect(machine.getRegistry().getGroup(gid)).toBeDefined();

    machine.send({ type: 'UNREGISTER_GROUP', id: gid });
    nextBatch();
    // After unregistering, the group should no longer be in the registry
    expect(machine.getRegistry().getGroup(gid)).toBeUndefined();
  });

  it('TUB-09: with loop false NAVIGATE next stays on the last item: the batch ran and the active item did not wrap', () => {
    const items = [
      { id: itemId('a'), value: 'A' },
      { id: itemId('b'), value: 'B' },
    ];
    using machine = createCommandMachine({ items, loop: false });

    // Navigate to last item
    machine.send({ type: 'NAVIGATE', direction: 'next' });
    nextBatch();
    expect(machine.getState().activeId).toBe(items[1]?.id);

    // Navigate past last — should stay at last (loop true would wrap to the first item)
    machine.send({ type: 'NAVIGATE', direction: 'next' });
    machine.send({ type: 'OPEN' });
    nextBatch();
    // The frame ran (OPEN applied), so the unchanged active item is the loop bound's work
    expect(machine.getState().open).toBe(true);
    expect(machine.getState().activeId).toBe(items[1]?.id);
  });

  it('TUB-09: PAGE_POP on the root page changes nothing: the batch ran and the page stays root', () => {
    using machine = createCommandMachine();

    // Pop when on root — should not crash and page should remain 'root'
    machine.send({ type: 'PAGE_POP' });
    machine.send({ type: 'OPEN' });
    nextBatch();
    // The frame ran (OPEN applied), so the unchanged page is the PAGE_POP guard's work
    expect(machine.getState().open).toBe(true);
    expect(machine.getState().page).toBe('root');
    expect(machine.getState().pageStack).toEqual([]);
  });
});

// C1: a scheduler batch commits once. The scheduler runs on requestAnimationFrame when the
// environment has it and on queueMicrotask otherwise; every test below steps its batches with nextBatch().
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

  /** Lets the microtask the scheduler queued for a failed update run (queueMicrotask is not faked) */
  async function rethrown(): Promise<void> {
    await Promise.resolve();
  }

  /** A machine already filtered by a non-empty query, so each refilter calls the search engine once. */
  function searching(options: CommandMachineOptions = {}): Searching {
    const { engine, searches } = counted();
    const machine = createCommandMachine({ ...options, search: engine });
    machine.send({ type: 'SEARCH_CHANGE', query: 'item' });
    nextBatch();
    expect(machine.getState().search).toBe('item');
    const listener = vi.fn();
    machine.subscribe(listener);
    return { machine, searches, listener, base: searches() };
  }

  it('CE-20, ARCH-24, RA-49: 500 REGISTER_ITEM events in one tick run one refilter and emit stateChange once', () => {
    const { machine, searches, listener, base } = searching();
    using _m = machine;
    const items = generateItems(500);
    for (const item of items) machine.send({ type: 'REGISTER_ITEM', item });
    nextBatch();
    expect(machine.getState().filteredCount).toBe(500);
    expect(searches() - base).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(machine.getState().filteredIds).toEqual(items.map((i) => i.id));
  });

  it('CE-20: 400 UNREGISTER_ITEM events in one tick run one refilter and emit stateChange once', () => {
    const items = generateItems(500);
    const { machine, searches, listener, base } = searching({ items });
    using _m = machine;
    expect(machine.getState().filteredCount).toBe(500);
    for (const item of items.slice(0, 400)) machine.send({ type: 'UNREGISTER_ITEM', id: item.id });
    nextBatch();
    expect(machine.getState().filteredCount).toBe(100);
    expect(searches() - base).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('CE-20: REGISTER_GROUP and UNREGISTER_GROUP events in one tick run one refilter per batch and emit once per batch', () => {
    const { machine, searches, listener, base } = searching({ items: generateItems(3) });
    using _m = machine;
    const groups = Array.from({ length: 50 }, (_, i) => ({
      id: groupId(`g${i}`),
      heading: `Group ${i}`,
    }));
    for (const group of groups) machine.send({ type: 'REGISTER_GROUP', group });
    nextBatch();
    expect(machine.getRegistry().getGroup(groupId('g49'))).toBeDefined();
    expect(searches() - base).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);

    for (const group of groups) machine.send({ type: 'UNREGISTER_GROUP', id: group.id });
    nextBatch();
    expect(machine.getRegistry().getGroup(groupId('g0'))).toBeUndefined();
    expect(searches() - base).toBe(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('CE-20: ITEMS_LOADED events in one tick run one refilter and emit stateChange once', () => {
    const { machine, searches, listener, base } = searching();
    using _m = machine;
    const items = generateItems(300);
    for (let i = 0; i < 3; i++) {
      machine.send({ type: 'ITEMS_LOADED', items: items.slice(i * 100, (i + 1) * 100) });
    }
    nextBatch();
    expect(machine.getState().filteredCount).toBe(300);
    expect(searches() - base).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('CE-20: registry events followed by SEARCH_CHANGE in one batch refilter once and emit once', () => {
    const { machine, searches, listener, base } = searching();
    using _m = machine;
    for (const item of generateItems(50)) machine.send({ type: 'REGISTER_ITEM', item });
    machine.send({ type: 'SEARCH_CHANGE', query: 'item 7' });
    nextBatch();
    expect(machine.getState().search).toBe('item 7');
    expect(searches() - base).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(machine.getState().filteredIds).toContain(itemId('item-7'));
  });

  it('CE-20: an event sent from inside a callback runs in the next batch and the first batch emits once', () => {
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
    nextBatch();
    // The first batch ran ITEM_SELECT: its OPEN waits for the next frame, and the batch emitted once
    expect(machine.getState().open).toBe(false);
    expect(opens).toEqual([false]);
    nextBatch();
    expect(machine.getState().open).toBe(true);
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
      nextBatch();
      await rethrown();
      expect(machine.getState().filteredCount).toBe(2);
      expect(reported).toEqual([boom]);
      expect(listener).toHaveBeenCalledTimes(1);

      // The counter is balanced: the next batch commits normally.
      machine.send({ type: 'OPEN' });
      nextBatch();
      expect(machine.getState().open).toBe(true);
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      restore();
    }
  });

  it('CE-20: ITEM_ACTIVATE after a REGISTER_ITEM in the same batch sees the registered item', () => {
    using machine = createCommandMachine({ items: [{ id: itemId('a'), value: 'A' }] });
    machine.send({ type: 'REGISTER_ITEM', item: { id: itemId('b'), value: 'B' } });
    machine.send({ type: 'ITEM_ACTIVATE', id: itemId('b') });
    nextBatch();
    expect(machine.getState().filteredCount).toBe(2);
    expect(machine.getState().activeId).toBe(itemId('b'));
  });

  it('CE-20: NAVIGATE next after an ITEMS_LOADED in the same batch navigates the loaded items', () => {
    using machine = createCommandMachine();
    machine.send({
      type: 'ITEMS_LOADED',
      items: ['a', 'b', 'c'].map((id) => ({ id: itemId(id), value: id })),
    });
    machine.send({ type: 'NAVIGATE', direction: 'next' });
    nextBatch();
    expect(machine.getState().filteredCount).toBe(3);
    expect(machine.getState().activeId).toBe(itemId('b'));
  });

  it('CE-20: NAVIGATE last after a REGISTER_ITEM in the same batch reaches the registered item', () => {
    using machine = createCommandMachine({
      items: ['a', 'b'].map((id) => ({ id: itemId(id), value: id })),
    });
    machine.send({ type: 'REGISTER_ITEM', item: { id: itemId('c'), value: 'c' } });
    machine.send({ type: 'NAVIGATE', direction: 'last' });
    nextBatch();
    expect(machine.getState().filteredCount).toBe(3);
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
      nextBatch();
      expect(machine.getState().search).toBe('item');
      const listener = vi.fn();
      machine.subscribe(listener);

      fail = true;
      machine.send({ type: 'OPEN' });
      machine.send({ type: 'REGISTER_ITEM', item: { id: itemId('late'), value: 'Item late' } });
      nextBatch();
      await rethrown();
      expect(reported).toEqual([boom]);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(machine.getState().open).toBe(true);
    } finally {
      restore();
    }
  });

  it('C1: onOpenChange and onSearchChange run before the single stateChange of their batch', () => {
    const log: string[] = [];
    using machine = createCommandMachine({
      items: generateItems(3),
      onOpenChange: (open: boolean) => log.push(`onOpenChange ${open}`),
      onSearchChange: (query: string) => log.push(`onSearchChange ${query}`),
    });
    machine.subscribe(() => log.push('stateChange'));
    machine.send({ type: 'OPEN' });
    machine.send({ type: 'SEARCH_CHANGE', query: 'item' });
    nextBatch();
    expect(machine.getState().search).toBe('item');
    expect(log).toEqual(['onOpenChange true', 'onSearchChange item', 'stateChange']);
  });
});

describe('CommandMachine custom filter scores (ARCH-14)', () => {
  it('a custom filter returning 0, a negative score or false excludes the item; a positive score keeps it', () => {
    const scores: Record<string, number | false> = {
      zero: 0,
      negative: -1,
      no: false,
      tiny: 0.01,
      big: 2,
    };
    using machine = createCommandMachine({
      items: Object.keys(scores).map((id) => ({ id: itemId(id), value: id })),
      filter: (item: CommandItem) => scores[item.id] as number | false,
    });
    machine.send({ type: 'SEARCH_CHANGE', query: 'q' });
    nextBatch();
    expect(machine.getState().search).toBe('q');
    expect([...machine.getState().filteredIds].sort()).toEqual(['big', 'tiny']);
  });
});

describe('CommandMachine UPDATE_ITEM (ARCH-20, CE-49)', () => {
  const item = (id: string, value: string, extra?: Partial<CommandItem>): CommandItem => ({
    id: itemId(id),
    value,
    ...extra,
  });
  const press = (key: string): void => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true }));
  };

  it('UPDATE_ITEM keeps the registry and filteredIds position and replaces the item', () => {
    using machine = createCommandMachine({
      items: [item('a', 'Apple'), item('b', 'Banana'), item('c', 'Cherry')],
    });
    machine.send({ type: 'UPDATE_ITEM', item: item('b', 'Banana', { disabled: true }) });
    settle(machine);
    expect(
      machine
        .getRegistry()
        .getItems()
        .map((i) => i.id),
    ).toEqual(['a', 'b', 'c']);
    expect(machine.getState().filteredIds).toEqual(['a', 'b', 'c']);
    expect(machine.getRegistry().getItem(itemId('b'))?.disabled).toBe(true);
  });

  it('UPDATE_ITEM updates the searchable value', () => {
    using machine = createCommandMachine({ items: [item('a', 'Apple'), item('b', 'Banana')] });
    machine.send({ type: 'UPDATE_ITEM', item: item('b', 'Zebra') });
    machine.send({ type: 'SEARCH_CHANGE', query: 'zeb' });
    nextBatch();
    expect(machine.getState().filteredIds).toEqual(['b']);
    machine.send({ type: 'SEARCH_CHANGE', query: 'ban' });
    nextBatch();
    expect(machine.getState().filteredIds).toEqual([]);
  });

  it('UPDATE_ITEM of an unknown id inserts the item', () => {
    using machine = createCommandMachine({ items: [item('a', 'Apple')] });
    machine.send({ type: 'UPDATE_ITEM', item: item('z', 'Zebra') });
    settle(machine);
    expect(machine.getState().filteredIds).toEqual(['a', 'z']);
  });

  it('UPDATE_ITEM re-binds the shortcut: the old key stops firing, the new one fires', () => {
    const onSelect = vi.fn();
    using machine = createCommandMachine({
      items: [item('a', 'Apple', { shortcut: 'Ctrl+K', onSelect })],
    });
    machine.send({
      type: 'UPDATE_ITEM',
      item: item('a', 'Apple', { shortcut: 'Ctrl+J', onSelect }),
    });
    settle(machine);
    press('k');
    expect(onSelect).not.toHaveBeenCalled();
    press('j');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('UPDATE_ITEM without a shortcut drops the old binding', () => {
    const onSelect = vi.fn();
    using machine = createCommandMachine({
      items: [item('a', 'Apple', { shortcut: 'Ctrl+K', onSelect })],
    });
    machine.send({ type: 'UPDATE_ITEM', item: item('a', 'Apple', { onSelect }) });
    settle(machine);
    press('k');
    expect(onSelect).not.toHaveBeenCalled();
    expect(machine.getKeyboardRegistry().getBindings().size).toBe(0);
  });

  it('CE-49: REGISTER_ITEM again for the same id with a changed shortcut leaves no old binding', () => {
    const onSelect = vi.fn();
    using machine = createCommandMachine({
      items: [item('a', 'Apple', { shortcut: 'Ctrl+K', onSelect })],
    });
    machine.send({
      type: 'REGISTER_ITEM',
      item: item('a', 'Apple', { shortcut: 'Ctrl+J', onSelect }),
    });
    settle(machine);
    press('k');
    expect(onSelect).not.toHaveBeenCalled();
    press('j');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('CE-49: REGISTER_ITEM again for the same id with the shortcut removed leaves no binding', () => {
    const onSelect = vi.fn();
    using machine = createCommandMachine({
      items: [item('a', 'Apple', { shortcut: 'Ctrl+K', onSelect })],
    });
    machine.send({ type: 'REGISTER_ITEM', item: item('a', 'Apple', { onSelect }) });
    settle(machine);
    press('k');
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('CommandMachine frecency ranking (DT-18)', () => {
  it('frecency re-ranks only non-empty queries: the empty query keeps registration order', () => {
    using machine = createCommandMachine({
      items: [
        { id: itemId('alpha'), value: 'Alpha item' },
        { id: itemId('settings'), value: 'Settings item' },
      ],
      frecency: { enabled: true },
    });
    machine.send({ type: 'ITEM_SELECT', id: itemId('settings') });
    machine.send({ type: 'SEARCH_CHANGE', query: '' });
    machine.send({ type: 'OPEN' }); // handled after the two events above
    nextBatch();
    expect(machine.getState().open).toBe(true);
    // The empty query is not re-ranked (the React adapter renders in JSX order, so arrow keys must match it)
    expect(machine.getState().filteredIds).toEqual(['alpha', 'settings']);

    machine.send({ type: 'SEARCH_CHANGE', query: 'item' });
    nextBatch();
    expect(machine.getState().search).toBe('item');
    // A non-empty query matching both puts the selected item first
    expect(machine.getState().filteredIds).toEqual(['settings', 'alpha']);
  });
});

describe('CommandMachine shortcuts (CE-09, ARCH-16, ARCH-15)', () => {
  const item = (id: string, value: string, extra?: Partial<CommandItem>): CommandItem => ({
    id: itemId(id),
    value,
    ...extra,
  });
  const press = (key: string): void => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true }));
  };

  it('ARCH-16: the shortcut of an item delivered by ITEMS_LOADED fires its onSelect', () => {
    const onSelect = vi.fn();
    using machine = createCommandMachine();
    machine.send({
      type: 'ITEMS_LOADED',
      items: [item('a', 'Apple', { shortcut: 'Ctrl+J', onSelect })],
    });
    settle(machine);
    press('j');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("CE-09: shortcutAction 'direct' (the default) calls the item onSelect and not options.onSelect", () => {
    const itemSelect = vi.fn();
    const optionsSelect = vi.fn();
    using machine = createCommandMachine({
      items: [item('a', 'Apple', { shortcut: 'Ctrl+J', onSelect: itemSelect })],
      onSelect: optionsSelect,
    });
    press('j');
    settle(machine);
    expect(itemSelect).toHaveBeenCalledTimes(1);
    expect(optionsSelect).not.toHaveBeenCalled();
  });

  it("CE-09: shortcutAction 'select' dispatches ITEM_SELECT: item onSelect and options.onSelect", () => {
    const itemSelect = vi.fn();
    const optionsSelect = vi.fn();
    using machine = createCommandMachine({
      items: [item('a', 'Apple', { shortcut: 'Ctrl+J', onSelect: itemSelect })],
      onSelect: optionsSelect,
      shortcutAction: 'select',
    });
    press('j');
    settle(machine);
    expect(itemSelect).toHaveBeenCalledTimes(1);
    expect(optionsSelect).toHaveBeenCalledExactlyOnceWith(itemId('a'));
  });

  it("CE-09: shortcutAction 'select' records frecency: the item selected by shortcut ranks first", () => {
    using machine = createCommandMachine({
      items: [
        item('alpha', 'Alpha item'),
        item('settings', 'Settings item', { shortcut: 'Ctrl+J', onSelect: () => {} }),
      ],
      frecency: { enabled: true },
      shortcutAction: 'select',
    });
    press('j');
    machine.send({ type: 'SEARCH_CHANGE', query: 'item' });
    nextBatch();
    expect(machine.getState().search).toBe('item');
    expect(machine.getState().filteredIds).toEqual(['settings', 'alpha']);
  });

  it("CE-09: shortcutAction 'direct' does not record frecency", () => {
    using machine = createCommandMachine({
      items: [
        item('alpha', 'Alpha item'),
        item('settings', 'Settings item', { shortcut: 'Ctrl+J', onSelect: () => {} }),
      ],
      frecency: { enabled: true },
    });
    press('j');
    machine.send({ type: 'SEARCH_CHANGE', query: 'item' });
    nextBatch();
    expect(machine.getState().search).toBe('item');
    expect(machine.getState().filteredIds).toEqual(['alpha', 'settings']);
  });

  it.for(['direct', 'select'] as const)(
    "CE-09: shortcutAction '%s': the shortcut of a disabled item fires nothing, also after UPDATE_ITEM disables it",
    (shortcutAction) => {
      const disabledSelect = vi.fn();
      const toggledSelect = vi.fn();
      const optionsSelect = vi.fn();
      using machine = createCommandMachine({
        items: [
          item('off', 'Off', { shortcut: 'Ctrl+J', onSelect: disabledSelect, disabled: true }),
          item('toggled', 'Toggled', { shortcut: 'Ctrl+L', onSelect: toggledSelect }),
        ],
        onSelect: optionsSelect,
        shortcutAction,
      });
      machine.send({
        type: 'UPDATE_ITEM',
        item: item('toggled', 'Toggled', {
          shortcut: 'Ctrl+L',
          onSelect: toggledSelect,
          disabled: true,
        }),
      });
      settle(machine);
      press('j');
      press('l');
      settle(machine);
      expect(disabledSelect).not.toHaveBeenCalled();
      expect(toggledSelect).not.toHaveBeenCalled();
      expect(optionsSelect).not.toHaveBeenCalled();
    },
  );

  it("CE-09: shortcutAction 'select' binds an item that has a shortcut but no onSelect and fires options.onSelect", () => {
    const optionsSelect = vi.fn();
    using machine = createCommandMachine({
      items: [item('a', 'Apple', { shortcut: 'Ctrl+J' })],
      onSelect: optionsSelect,
      shortcutAction: 'select',
    });
    expect(machine.getKeyboardRegistry().getBindings().size).toBe(1);
    press('j');
    settle(machine);
    expect(optionsSelect).toHaveBeenCalledExactlyOnceWith(itemId('a'));
  });

  it("CE-09: shortcutAction 'direct' binds only items that have an onSelect", () => {
    using machine = createCommandMachine({ items: [item('a', 'Apple', { shortcut: 'Ctrl+J' })] });
    expect(machine.getKeyboardRegistry().getBindings().size).toBe(0);
  });
});

describe('CommandMachine events, callbacks and getters (TUB-25)', () => {
  const item = (id: string, value: string, extra?: Partial<CommandItem>): CommandItem => ({
    id: itemId(id),
    value,
    ...extra,
  });
  const abc = (): CommandItem[] => [item('a', 'Apple'), item('b', 'Banana'), item('c', 'Cherry')];

  it('ITEM_ACTIVATE makes a listed item active and calls onActiveChange with its id', () => {
    const onActiveChange = vi.fn();
    using machine = createCommandMachine({ items: abc(), onActiveChange });
    machine.send({ type: 'ITEM_ACTIVATE', id: itemId('c') });
    settle(machine);
    expect(machine.getState().activeId).toBe('c');
    expect(onActiveChange).toHaveBeenCalledExactlyOnceWith(itemId('c'));
  });

  it('ITEM_ACTIVATE ignores an id that is not in filteredIds', () => {
    const onActiveChange = vi.fn();
    using machine = createCommandMachine({ items: abc(), onActiveChange });
    machine.send({ type: 'SEARCH_CHANGE', query: 'ban' });
    machine.send({ type: 'ITEM_ACTIVATE', id: itemId('a') }); // listed before the search, filtered out now
    machine.send({ type: 'ITEM_ACTIVATE', id: itemId('nope') }); // never registered
    settle(machine);
    expect(machine.getState().activeId).toBe('b');
    expect(onActiveChange).not.toHaveBeenCalled();
  });

  it("NAVIGATE 'prev' moves to the previous item and loops from the first to the last", () => {
    const onActiveChange = vi.fn();
    using machine = createCommandMachine({ items: abc(), onActiveChange });
    machine.send({ type: 'NAVIGATE', direction: 'prev' });
    settle(machine);
    expect(machine.getState().activeId).toBe('c');
    machine.send({ type: 'NAVIGATE', direction: 'prev' });
    nextBatch();
    expect(machine.getState().activeId).toBe('b');
    expect(onActiveChange.mock.calls).toEqual([[itemId('c')], [itemId('b')]]);
  });

  it("NAVIGATE 'prev' stays on the first item when loop is false, without calling onActiveChange", () => {
    const onActiveChange = vi.fn();
    using machine = createCommandMachine({ items: abc(), loop: false, onActiveChange });
    machine.send({ type: 'NAVIGATE', direction: 'prev' });
    settle(machine);
    expect(machine.getState().activeId).toBe('a');
    expect(onActiveChange).not.toHaveBeenCalled();
  });

  it('onActiveChange is not called when the navigation lands on the item that is already active', () => {
    const onActiveChange = vi.fn();
    using machine = createCommandMachine({ items: [item('a', 'Apple')], onActiveChange });
    machine.send({ type: 'NAVIGATE', direction: 'next' });
    machine.send({ type: 'NAVIGATE', direction: 'last' });
    settle(machine);
    expect(machine.getState().activeId).toBe('a');
    expect(onActiveChange).not.toHaveBeenCalled();
  });

  it('REGISTER_GROUP via send registers the group and orders groupedIds by its priority', () => {
    using machine = createCommandMachine({
      items: [
        item('a', 'Apple', { groupId: groupId('late') }),
        item('b', 'Banana', { groupId: groupId('early') }),
      ],
    });
    machine.send({ type: 'REGISTER_GROUP', group: { id: groupId('late'), priority: 5 } });
    machine.send({
      type: 'REGISTER_GROUP',
      group: { id: groupId('early'), heading: 'Early', priority: -5 },
    });
    settle(machine);
    expect(machine.getRegistry().getGroup(groupId('early'))?.heading).toBe('Early');
    expect(machine.getRegistry().groupCount).toBe(2);
    expect([...machine.getState().groupedIds.keys()]).toEqual(['early', 'late']);
  });

  it('options.onSelect is called with the id of a selected item and not for an unknown id', () => {
    const onSelect = vi.fn();
    using machine = createCommandMachine({ items: abc(), onSelect });
    machine.send({ type: 'ITEM_SELECT', id: itemId('nope') });
    machine.send({ type: 'ITEM_SELECT', id: itemId('b') });
    settle(machine);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(itemId('b'));
  });

  it('options.onSelect runs after the item onSelect', () => {
    const log: string[] = [];
    using machine = createCommandMachine({
      items: [item('a', 'Apple', { onSelect: () => log.push('item') })],
      onSelect: () => log.push('options'),
    });
    machine.send({ type: 'ITEM_SELECT', id: itemId('a') });
    settle(machine);
    expect(log).toEqual(['item', 'options']);
  });

  it('onSearchChange is called with every query SEARCH_CHANGE delivers', () => {
    const onSearchChange = vi.fn();
    using machine = createCommandMachine({ items: abc(), onSearchChange });
    machine.send({ type: 'SEARCH_CHANGE', query: 'ban' });
    machine.send({ type: 'SEARCH_CHANGE', query: '' });
    settle(machine);
    expect(onSearchChange.mock.calls).toEqual([['ban'], ['']]);
  });

  it('getFilteredIdSet and getFilteredIdIndex follow filteredIds through a search and a registration', () => {
    using machine = createCommandMachine({ items: abc() });
    expect([...machine.getFilteredIdSet()]).toEqual(['a', 'b', 'c']);
    expect([...machine.getFilteredIdIndex()]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);

    machine.send({ type: 'SEARCH_CHANGE', query: 'ban' });
    settle(machine);
    expect(machine.getFilteredIdSet().has(itemId('b'))).toBe(true);
    expect(machine.getFilteredIdSet().has(itemId('a'))).toBe(false);
    expect(machine.getFilteredIdIndex().get(itemId('b'))).toBe(0);
    expect(machine.getFilteredIdIndex().has(itemId('a'))).toBe(false);

    machine.send({ type: 'SEARCH_CHANGE', query: '' });
    machine.send({ type: 'REGISTER_ITEM', item: item('d', 'Date') });
    nextBatch();
    expect(machine.getFilteredIdSet().size).toBe(4);
    expect(machine.getFilteredIdIndex().get(itemId('d'))).toBe(3);
    expect([...machine.getFilteredIdSet()]).toEqual([...machine.getState().filteredIds]);
  });

  it('the search option replaces the default engine: its result order is the filteredIds order and it is indexed and pruned', () => {
    const indexed: ItemId[] = [];
    const removed: ItemId[] = [];
    const queries: string[] = [];
    const engine: SearchEngine = {
      index: (items: readonly CommandItem[]): void => {
        indexed.push(...items.map((i) => i.id));
      },
      // Not the default scorer: every item whose value contains the query, last registered first
      search: (query: string, items: readonly CommandItem[]) => {
        queries.push(query);
        return items
          .toReversed()
          .values()
          .filter((i) => i.value.toLowerCase().includes(query))
          .map((i) => ({ id: i.id, score: 1, matches: [] }));
      },
      remove: (ids: ReadonlySet<ItemId>): void => {
        removed.push(...ids);
      },
      clear: () => undefined,
      [Symbol.dispose]: () => undefined,
    };
    using machine = createCommandMachine({ items: abc(), search: engine });
    expect(indexed).toEqual(['a', 'b', 'c']);

    machine.send({ type: 'SEARCH_CHANGE', query: 'an' });
    machine.send({ type: 'SEARCH_CHANGE', query: 'e' }); // Apple and Cherry, reversed by the engine
    settle(machine);
    expect(queries).toEqual(['an', 'e']);
    expect(machine.getState().filteredIds).toEqual(['c', 'a']);

    machine.send({ type: 'UNREGISTER_ITEM', id: itemId('a') });
    nextBatch();
    expect(removed).toEqual(['a']);
  });
});

describe('CommandMachine disabled shortcuts are not bound (CE-09 fix round)', () => {
  const item = (id: string, extra?: Partial<CommandItem>): CommandItem => ({
    id: itemId(id),
    value: id,
    ...extra,
  });
  const press = (key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true });
    document.dispatchEvent(event);
    return event;
  };

  describe.for(['direct', 'select'] as const)("shortcutAction '%s'", (shortcutAction) => {
    it("a disabled item's key press is not defaultPrevented and the item has no binding", () => {
      using machine = createCommandMachine({
        items: [item('off', { shortcut: 'Ctrl+C', onSelect: () => {}, disabled: true })],
        shortcutAction,
      });
      expect(machine.getKeyboardRegistry().getBindings().size).toBe(0);
      expect(press('c').defaultPrevented).toBe(false);
    });

    it('an item that UPDATE_ITEM disables loses its binding: its key is no longer defaultPrevented', () => {
      const onSelect = vi.fn();
      using machine = createCommandMachine({
        items: [item('a', { shortcut: 'Ctrl+C', onSelect })],
        shortcutAction,
      });
      machine.send({
        type: 'UPDATE_ITEM',
        item: item('a', { shortcut: 'Ctrl+C', onSelect, disabled: true }),
      });
      settle(machine);
      expect(machine.getKeyboardRegistry().getBindings().size).toBe(0);
      expect(press('c').defaultPrevented).toBe(false);
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('enabled A then disabled B on one key: the key fires A and there is no conflict', () => {
      const a = vi.fn();
      const b = vi.fn();
      using machine = createCommandMachine({
        items: [
          item('a', { shortcut: 'Ctrl+K', onSelect: a }),
          item('b', { shortcut: 'Ctrl+K', onSelect: b, disabled: true }),
        ],
        shortcutAction,
      });
      expect(machine.getKeyboardRegistry().getConflicts().size).toBe(0);
      press('k');
      settle(machine);
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).not.toHaveBeenCalled();
    });

    it('re-enabling B through UPDATE_ITEM binds it again and B wins the key', () => {
      const a = vi.fn();
      const b = vi.fn();
      using machine = createCommandMachine({
        items: [
          item('a', { shortcut: 'Ctrl+K', onSelect: a }),
          item('b', { shortcut: 'Ctrl+K', onSelect: b, disabled: true }),
        ],
        shortcutAction,
      });
      machine.send({
        type: 'UPDATE_ITEM',
        item: item('b', { shortcut: 'Ctrl+K', onSelect: b }),
      });
      settle(machine);
      expect(machine.getKeyboardRegistry().getConflicts().size).toBe(1);
      press('k');
      settle(machine);
      expect(b).toHaveBeenCalledTimes(1);
      expect(a).not.toHaveBeenCalled();
    });
  });
});
