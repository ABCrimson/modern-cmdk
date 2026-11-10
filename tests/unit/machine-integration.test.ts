import type { CommandItem, ItemId } from 'modern-cmdk';
import { createCommandMachine, groupId, itemId } from 'modern-cmdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeItem(id: string, value: string, opts?: Partial<CommandItem>): CommandItem {
  return { id: itemId(id), value, ...opts };
}

// The scheduler batches events into one requestAnimationFrame callback (happy-dom provides it). Faking only the
// frame functions makes every batch an explicit step: nothing in this file waits on a real async source.
function nextFrame(): void {
  vi.advanceTimersToNextFrame();
}

describe('Machine Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('T43: should support full flow: register → search → navigate → select → frecency', () => {
    const onSelect = vi.fn();
    using machine = createCommandMachine({
      items: [
        makeItem('apple', 'Apple', { onSelect }),
        makeItem('banana', 'Banana'),
        makeItem('cherry', 'Cherry'),
      ],
      frecency: { enabled: true },
    });

    // Verify initial state
    expect(machine.getState().filteredCount).toBe(3);
    expect(machine.getState().activeId).toBe(itemId('apple'));

    // Search
    machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
    nextFrame();
    expect(machine.getState().search).toBe('app');
    expect(machine.getState().filteredCount).toBeLessThan(3);

    // Navigate
    machine.send({ type: 'NAVIGATE', direction: 'first' });
    nextFrame();
    expect(machine.getState().activeId).not.toBeNull();

    // Select
    const activeId = machine.getState().activeId as ItemId;
    machine.send({ type: 'ITEM_SELECT', id: activeId });
    nextFrame();
    expect(onSelect).toHaveBeenCalled();

    // Clear search and verify frecency boost
    machine.send({ type: 'SEARCH_CHANGE', query: '' });
    nextFrame();
    expect(machine.getState().filteredCount).toBe(3);

    // Frecency re-ranks a non-empty query: 'e' lists Cherry before Apple by score alone, and the
    // selected Apple first only through its boost
    machine.send({ type: 'SEARCH_CHANGE', query: 'e' });
    nextFrame();
    expect(machine.getState().filteredIds[0]).toBe(itemId('apple'));
  });

  it('should handle dynamic item registration and deregistration', () => {
    using machine = createCommandMachine();

    expect(machine.getState().filteredCount).toBe(0);

    // Register items dynamically
    machine.send({ type: 'REGISTER_ITEM', item: makeItem('a', 'Apple') });
    nextFrame();
    expect(machine.getState().filteredCount).toBe(1);

    machine.send({ type: 'REGISTER_ITEM', item: makeItem('b', 'Banana') });
    nextFrame();
    expect(machine.getState().filteredCount).toBe(2);

    // Deregister
    machine.send({ type: 'UNREGISTER_ITEM', id: itemId('a') });
    nextFrame();
    expect(machine.getState().filteredCount).toBe(1);
  });

  it('should handle page navigation', () => {
    using machine = createCommandMachine();

    expect(machine.getState().page).toBe('root');

    machine.send({ type: 'PAGE_PUSH', page: 'settings' });
    nextFrame();
    expect(machine.getState().page).toBe('settings');
    expect(machine.getState().pageStack).toEqual(['root']);

    machine.send({ type: 'PAGE_PUSH', page: 'account' });
    nextFrame();
    expect(machine.getState().page).toBe('account');
    expect(machine.getState().pageStack).toEqual(['root', 'settings']);

    machine.send({ type: 'PAGE_POP' });
    nextFrame();
    expect(machine.getState().page).toBe('settings');

    machine.send({ type: 'PAGE_POP' });
    nextFrame();
    expect(machine.getState().page).toBe('root');
    expect(machine.getState().pageStack).toEqual([]);
  });

  it('should support groups with priority ordering', () => {
    using machine = createCommandMachine({
      items: [
        makeItem('a', 'Apple', { groupId: groupId('vegs') }),
        makeItem('b', 'Banana', { groupId: groupId('fruits') }),
        makeItem('c', 'Carrot', { groupId: groupId('vegs') }),
        makeItem('d', 'Date', { groupId: groupId('fruits') }),
      ],
      groups: [
        { id: groupId('vegs'), heading: 'Vegetables', priority: 2 },
        { id: groupId('fruits'), heading: 'Fruits', priority: 1 },
      ],
    });

    const { groupedIds } = machine.getState();
    // Lower priority first, although the first item belongs to the later group (TUB-06)
    expect([...groupedIds.keys()]).toEqual(['fruits', 'vegs']);
    expect(groupedIds.get(groupId('fruits'))).toEqual(['b', 'd']);
    expect(groupedIds.get(groupId('vegs'))).toEqual(['a', 'c']);
  });

  it('groups of equal priority keep their first-appearance order, ungrouped items included (TUB-06)', () => {
    using machine = createCommandMachine({
      items: [
        makeItem('a', 'Apple', { groupId: groupId('y') }),
        makeItem('b', 'Banana'),
        makeItem('c', 'Carrot', { groupId: groupId('x') }),
        makeItem('d', 'Date', { groupId: groupId('first') }),
      ],
      groups: [
        { id: groupId('x'), heading: 'X' },
        { id: groupId('y'), heading: 'Y', priority: 0 },
        { id: groupId('first'), heading: 'First', priority: -1 },
      ],
    });

    expect([...machine.getState().groupedIds.keys()]).toEqual(['first', 'y', '__ungrouped', 'x']);
  });

  it('should handle open/close/toggle lifecycle', () => {
    const onOpenChange = vi.fn();
    using machine = createCommandMachine({ onOpenChange });

    machine.send({ type: 'OPEN' });
    nextFrame();
    expect(machine.getState().open).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(true);

    machine.send({ type: 'CLOSE' });
    nextFrame();
    expect(machine.getState().open).toBe(false);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    machine.send({ type: 'TOGGLE' });
    nextFrame();
    expect(machine.getState().open).toBe(true);

    machine.send({ type: 'TOGGLE' });
    nextFrame();
    expect(machine.getState().open).toBe(false);
  });

  it('RA-83: a machine created open reports its open at its first event', () => {
    const onPaletteOpen = vi.fn();
    using machine = createCommandMachine({ open: true, telemetry: { onPaletteOpen } });
    machine.suspend();
    machine.resume();
    nextFrame();
    expect(onPaletteOpen).toHaveBeenCalledTimes(1);

    machine.send({ type: 'SEARCH_CHANGE', query: 'a' });
    nextFrame();
    expect(onPaletteOpen).toHaveBeenCalledTimes(1);
  });

  it('should support custom filter function', () => {
    using machine = createCommandMachine({
      items: [makeItem('a', 'Apple'), makeItem('b', 'Banana'), makeItem('c', 'Cherry')],
      filter: (item: CommandItem, query: string) => {
        // Only match exact start
        if (item.value.toLowerCase().startsWith(query.toLowerCase())) {
          return 1;
        }
        return false;
      },
    });

    machine.send({ type: 'SEARCH_CHANGE', query: 'b' });
    nextFrame();
    expect(machine.getState().filteredCount).toBe(1);
  });

  it('should support filter=false to disable filtering', () => {
    using machine = createCommandMachine({
      items: [makeItem('a', 'Apple'), makeItem('b', 'Banana')],
      filter: false,
    });

    machine.send({ type: 'SEARCH_CHANGE', query: 'xyz' });
    nextFrame();
    // All items visible because filtering is disabled
    expect(machine.getState().filteredCount).toBe(2);
  });

  it('TUB-35: ITEMS_LOADED binds the shortcut of a loaded item to its onSelect', () => {
    const onSelect = vi.fn();
    using machine = createCommandMachine();
    const bindings = machine.getKeyboardRegistry().getBindings();
    expect(bindings.size).toBe(0);

    machine.send({
      type: 'ITEMS_LOADED',
      items: [
        makeItem('copy', 'Copy', { shortcut: 'Ctrl+C', onSelect }),
        makeItem('plain', 'Plain'),
      ],
    });
    nextFrame();

    const loaded = machine.getKeyboardRegistry().getBindings();
    expect(loaded.size).toBe(1);
    const [binding] = loaded.values();
    expect(binding?.itemId).toBe(itemId('copy'));
    binding?.handler();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('should stamp lastUpdated with Date.now() when state changes', () => {
    using machine = createCommandMachine();
    const stamp = machine.getState().lastUpdated + 1000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(stamp);
    try {
      machine.send({ type: 'OPEN' });
      nextFrame();
      expect(machine.getState().lastUpdated).toBe(stamp);
    } finally {
      now.mockRestore();
    }
  });

  it('TUB-36: after dispose no subscribe listener fires, for an event pending at dispose or one sent later', () => {
    const disposed = createCommandMachine({ items: [makeItem('a', 'Apple')] });
    using live = createCommandMachine({ items: [makeItem('a', 'Apple')] });
    const onDisposed = vi.fn();
    const onLive = vi.fn();
    disposed.subscribe(onDisposed);
    live.subscribe(onLive);

    expect(disposed.getState().filteredCount).toBe(1);
    disposed.send({ type: 'OPEN' }); // pending when the machine is disposed
    disposed[Symbol.dispose]();
    disposed.send({ type: 'TOGGLE' }); // sent after dispose
    live.send({ type: 'OPEN' });
    nextFrame();

    // send() after dispose is not processed: the disposed scheduler drops it, so no subscribe or
    // subscribeState listener fires for it
    // Positive control: the same frame ran the live machine's batch and notified its listener
    expect(live.getState().open).toBe(true);
    expect(onLive).toHaveBeenCalledTimes(1);
    expect(onDisposed).not.toHaveBeenCalled();
    // The state stays readable
    expect(disposed.getState().filteredCount).toBe(1);
  });

  it('TUB-37: 20 rapid NAVIGATE next events in one frame all apply, from item-0 to item-20', () => {
    using machine = createCommandMachine({
      // ES2025 Iterator helpers — generate items via iterator pipeline
      items: Iterator.from({
        [Symbol.iterator]: function* (): Generator<number> {
          for (let i = 0; i < 100; i++) yield i;
        },
      })
        .map((i) => makeItem(`item-${i}`, `Item ${i}`))
        .toArray(),
    });

    // Send 20 rapid events
    for (let i = 0; i < 20; i++) {
      machine.send({ type: 'NAVIGATE', direction: 'next' });
    }

    expect(machine.getState().activeId).toBe(itemId('item-0'));
    nextFrame();
    expect(machine.getState().activeId).toBe(itemId('item-20'));
  });
});
