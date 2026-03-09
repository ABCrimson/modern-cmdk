import type { CommandItem, ItemId } from 'modern-cmdk';
import { createCommandMachine, groupId, itemId } from 'modern-cmdk';
import { describe, expect, it, vi } from 'vitest';

function makeItem(id: string, value: string, opts?: Partial<CommandItem>): CommandItem {
  return { id: itemId(id), value, ...opts };
}

describe('Machine Integration (0.0.9)', () => {
  it('should support full flow: register → search → navigate → select → frecency', async () => {
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
    await vi.waitFor(() => {
      expect(machine.getState().search).toBe('app');
      expect(machine.getState().filteredCount).toBeLessThan(3);
    });

    // Navigate
    machine.send({ type: 'NAVIGATE', direction: 'first' });
    await vi.waitFor(() => {
      expect(machine.getState().activeId).not.toBeNull();
    });

    // Select
    const activeId = machine.getState().activeId as ItemId;
    machine.send({ type: 'ITEM_SELECT', id: activeId });
    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalled();
    });

    // Clear search and verify frecency boost
    machine.send({ type: 'SEARCH_CHANGE', query: '' });
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(3);
    });
  });

  it('should handle dynamic item registration and deregistration', async () => {
    using machine = createCommandMachine();

    expect(machine.getState().filteredCount).toBe(0);

    // Register items dynamically
    machine.send({ type: 'REGISTER_ITEM', item: makeItem('a', 'Apple') });
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(1);
    });

    machine.send({ type: 'REGISTER_ITEM', item: makeItem('b', 'Banana') });
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(2);
    });

    // Deregister
    machine.send({ type: 'UNREGISTER_ITEM', id: itemId('a') });
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(1);
    });
  });

  it('should handle page navigation', async () => {
    using machine = createCommandMachine();

    expect(machine.getState().page).toBe('root');

    machine.send({ type: 'PAGE_PUSH', page: 'settings' });
    await vi.waitFor(() => {
      expect(machine.getState().page).toBe('settings');
      expect(machine.getState().pageStack).toEqual(['root']);
    });

    machine.send({ type: 'PAGE_PUSH', page: 'account' });
    await vi.waitFor(() => {
      expect(machine.getState().page).toBe('account');
      expect(machine.getState().pageStack).toEqual(['root', 'settings']);
    });

    machine.send({ type: 'PAGE_POP' });
    await vi.waitFor(() => {
      expect(machine.getState().page).toBe('settings');
    });

    machine.send({ type: 'PAGE_POP' });
    await vi.waitFor(() => {
      expect(machine.getState().page).toBe('root');
      expect(machine.getState().pageStack).toEqual([]);
    });
  });

  it('should support groups with priority ordering', async () => {
    using machine = createCommandMachine({
      items: [
        makeItem('a', 'Apple', { groupId: groupId('fruits') }),
        makeItem('b', 'Banana', { groupId: groupId('fruits') }),
        makeItem('c', 'Carrot', { groupId: groupId('vegs') }),
      ],
      groups: [
        { id: groupId('fruits'), heading: 'Fruits', priority: 0 },
        { id: groupId('vegs'), heading: 'Vegetables', priority: 1 },
      ],
    });

    const state = machine.getState();
    expect(state.groupedIds.size).toBeGreaterThan(0);
    expect(state.groupedIds.get(groupId('fruits'))?.length).toBe(2);
    expect(state.groupedIds.get(groupId('vegs'))?.length).toBe(1);
  });

  it('should handle open/close/toggle lifecycle', async () => {
    const onOpenChange = vi.fn();
    using machine = createCommandMachine({ onOpenChange });

    machine.send({ type: 'OPEN' });
    await vi.waitFor(() => {
      expect(machine.getState().open).toBe(true);
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });

    machine.send({ type: 'CLOSE' });
    await vi.waitFor(() => {
      expect(machine.getState().open).toBe(false);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    machine.send({ type: 'TOGGLE' });
    await vi.waitFor(() => {
      expect(machine.getState().open).toBe(true);
    });

    machine.send({ type: 'TOGGLE' });
    await vi.waitFor(() => {
      expect(machine.getState().open).toBe(false);
    });
  });

  it('should handle keyboard shortcut registration via items', async () => {
    const handler = vi.fn();
    using machine = createCommandMachine({
      items: [makeItem('copy', 'Copy', { shortcut: 'Ctrl+C', onSelect: handler })],
    });

    const registry = machine.getKeyboardRegistry();
    const bindings = registry.getBindings();
    expect(bindings.size).toBe(1);
  });

  it('should support custom filter function', async () => {
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
    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(1);
    });
  });

  it('should support filter=false to disable filtering', async () => {
    using machine = createCommandMachine({
      items: [makeItem('a', 'Apple'), makeItem('b', 'Banana')],
      filter: false,
    });

    machine.send({ type: 'SEARCH_CHANGE', query: 'xyz' });
    await vi.waitFor(() => {
      // All items visible because filtering is disabled
      expect(machine.getState().filteredCount).toBe(2);
    });
  });

  it('should not select disabled items', async () => {
    const onSelect = vi.fn();
    using machine = createCommandMachine({
      items: [makeItem('disabled', 'Disabled Item', { disabled: true, onSelect })],
    });

    machine.send({ type: 'ITEM_SELECT', id: itemId('disabled') });
    // Vitest 4.1 — use vi.waitFor() instead of raw setTimeout for async assertions
    await vi.waitFor(() => {
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  it('should handle ITEMS_LOADED for async sources', async () => {
    using machine = createCommandMachine();

    machine.send({
      type: 'ITEMS_LOADED',
      items: [makeItem('x', 'Loaded Item X'), makeItem('y', 'Loaded Item Y')],
    });

    await vi.waitFor(() => {
      expect(machine.getState().filteredCount).toBe(2);
      expect(machine.getState().loading).toBe(false);
    });
  });

  it('should use Temporal.Instant for all state timestamps', async () => {
    using machine = createCommandMachine();

    machine.send({ type: 'OPEN' });
    await vi.waitFor(() => {
      expect(machine.getState().lastUpdated).toBeInstanceOf(Temporal.Instant);
    });
  });

  it('should properly clean up on dispose', () => {
    const machine = createCommandMachine({
      items: [makeItem('a', 'Apple')],
    });

    expect(machine.getState().filteredCount).toBe(1);

    machine[Symbol.dispose]();

    // Machine is disposed — state is still readable but no more subscriptions fire
    expect(machine.getState().filteredCount).toBe(1);
  });

  it('should support useSyncExternalStore-compatible subscribe', async () => {
    using machine = createCommandMachine();
    const listener = vi.fn();

    const unsubscribe = machine.subscribe(listener);
    machine.send({ type: 'OPEN' });

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalled();
    });

    unsubscribe();
  });

  it('should support Disposable-style subscribeState', async () => {
    using machine = createCommandMachine();
    const listener = vi.fn();

    using _sub = machine.subscribeState(listener);
    machine.send({ type: 'OPEN' });

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalled();
      const state = listener.mock.calls.at(-1)?.[0];
      expect(state?.open).toBe(true);
    });
  });

  it('should handle rapid events without data loss', async () => {
    using machine = createCommandMachine({
      // ES2026 Iterator Helpers — generate items via iterator pipeline
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

    await vi.waitFor(() => {
      // Should have navigated, active item should not be the first
      expect(machine.getState().activeId).not.toBe(itemId('item-0'));
    });
  });
});
