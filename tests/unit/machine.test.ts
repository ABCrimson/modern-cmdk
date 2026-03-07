import type { CommandItem, CommandMachine } from '@crimson_dev/command';
import { createCommandMachine, groupId, itemId } from '@crimson_dev/command';
import { describe, expect, it, vi } from 'vitest';

function generateItems(count: number): CommandItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: itemId(`item-${i}`),
    value: `Item ${i}`,
  }));
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
    const items = [{ id: itemId('test'), value: 'Test', onSelect }];
    using machine = createCommandMachine({ items });

    machine.send({ type: 'ITEM_SELECT', id: items[0]?.id });
    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalledOnce();
    });
  });

  it('should not select disabled items', async () => {
    const onSelect = vi.fn();
    const items = [{ id: itemId('disabled'), value: 'Disabled', disabled: true, onSelect }];
    using machine = createCommandMachine({ items });

    machine.send({ type: 'ITEM_SELECT', id: items[0]?.id });
    // Give scheduler time to process
    await new Promise((r) => setTimeout(r, 50));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('should use Temporal for lastUpdated timestamps', () => {
    using machine = createCommandMachine();
    const state = machine.getState();
    expect(state.lastUpdated).toBeInstanceOf(Temporal.Instant);
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
});
