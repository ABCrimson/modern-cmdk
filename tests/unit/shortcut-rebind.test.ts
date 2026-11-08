// tests/unit/shortcut-rebind.test.ts
// CE-108: re-binding an item's shortcut keeps its place in the key's stack. The machine's bind()
// used to unregister the item and register it again, which moved an updated item to the top of
// the stack and handed the key to it, ahead of the later binding that had won before the update.

import type { CommandItem, CommandMachine } from 'modern-cmdk';
import { createCommandMachine, itemId, KeyboardShortcutRegistry, parseShortcut } from 'modern-cmdk';
import { describe, expect, it, vi } from 'vitest';

const a = itemId('a');
const b = itemId('b');
const ctrlK: string = parseShortcut('Ctrl+K').normalized;

const item = (id: string, value: string, extra?: Partial<CommandItem>): CommandItem => ({
  id: itemId(id),
  value,
  ...extra,
});

/** Events run in order: once OPEN has been handled, everything sent before it has been too */
async function settle(machine: CommandMachine): Promise<void> {
  machine.send({ type: 'OPEN' });
  await vi.waitFor(() => {
    expect(machine.getState().open).toBe(true);
  });
}

const press = (key: string): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true }));
};

describe('shortcut re-binding keeps the stack position', () => {
  it('CE-108: UPDATE_ITEM of the earlier binding on a shared key leaves the later binding winning', async () => {
    const selectA = vi.fn();
    const selectB = vi.fn();
    using machine = createCommandMachine({
      items: [
        item('a', 'Apple', { shortcut: 'Ctrl+K', onSelect: selectA }),
        item('b', 'Banana', { shortcut: 'Ctrl+K', onSelect: selectB }),
      ],
    });
    machine.send({
      type: 'UPDATE_ITEM',
      item: item('a', 'Apple pie', { shortcut: 'Ctrl+K', onSelect: selectA }),
    });
    await settle(machine);
    press('k');
    expect(selectB).toHaveBeenCalledTimes(1);
    expect(selectA).not.toHaveBeenCalled();
  });

  it('CE-108: UPDATE_ITEM swaps the handler of the binding in place', async () => {
    const before = vi.fn();
    const after = vi.fn();
    using machine = createCommandMachine({
      items: [item('a', 'Apple', { shortcut: 'Ctrl+K', onSelect: before })],
    });
    machine.send({
      type: 'UPDATE_ITEM',
      item: item('a', 'Apple', { shortcut: 'Ctrl+K', onSelect: after }),
    });
    await settle(machine);
    press('k');
    expect(before).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('CE-108: a changed key still drops the old key and joins the new key on top', async () => {
    const selectA = vi.fn();
    const selectB = vi.fn();
    using machine = createCommandMachine({
      items: [
        item('a', 'Apple', { shortcut: 'Ctrl+K', onSelect: selectA }),
        item('b', 'Banana', { shortcut: 'Ctrl+J', onSelect: selectB }),
      ],
    });
    machine.send({
      type: 'UPDATE_ITEM',
      item: item('a', 'Apple', { shortcut: 'Ctrl+J', onSelect: selectA }),
    });
    await settle(machine);
    press('k');
    expect(selectA).not.toHaveBeenCalled();
    press('j');
    expect(selectA).toHaveBeenCalledTimes(1);
    expect(selectB).not.toHaveBeenCalled();
  });

  it('CE-108: register() for an item already bound on that key replaces the binding in place', () => {
    using registry = new KeyboardShortcutRegistry();
    const first = vi.fn();
    const second = vi.fn();
    const later = vi.fn();
    registry.register('Ctrl+K', a, first);
    registry.register('Ctrl+K', b, later);
    registry.register('Ctrl+K', a, second);
    expect(registry.getBindings().get(ctrlK)?.itemId).toBe(b);
    expect(registry.getConflicts().get(ctrlK)?.length).toBe(2);
    registry.unregisterByItem(b);
    registry.getBindings().get(ctrlK)?.handler();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('CE-108: unregisterByItem(item, keep) drops the item on every key but the kept one', () => {
    using registry = new KeyboardShortcutRegistry();
    registry.register('Ctrl+K', a, () => {});
    registry.register('Ctrl+J', a, () => {});
    registry.unregisterByItem(a, 'Ctrl+K');
    expect([...registry.getBindings().keys()]).toEqual([ctrlK]);
  });
});
