// tests/unit/machine-loading.test.ts
// ARCH-59: state.loading follows the set of pending LOADING sources, not ITEMS_LOADED

import { createCommandMachine, itemId } from 'modern-cmdk';
import { describe, expect, it } from 'vitest';

const tick = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

describe('ARCH-59 machine loading', () => {
  it('ARCH-59: LOADING with pending true adds its source and sets state.loading', async () => {
    using machine = createCommandMachine();
    expect(machine.getState().loading).toBe(false);
    machine.send({ type: 'LOADING', source: 'a', pending: true });
    await tick();
    expect(machine.getState().loading).toBe(true);
    machine.send({ type: 'LOADING', source: 'a', pending: false });
    await tick();
    expect(machine.getState().loading).toBe(false);
  });

  it('ARCH-59: loading stays true while any source is pending', async () => {
    using machine = createCommandMachine();
    machine.send({ type: 'LOADING', source: 'a', pending: true });
    machine.send({ type: 'LOADING', source: 'b', pending: true });
    machine.send({ type: 'LOADING', source: 'a', pending: false });
    await tick();
    expect(machine.getState().loading).toBe(true);
    machine.send({ type: 'LOADING', source: 'b', pending: false });
    await tick();
    expect(machine.getState().loading).toBe(false);
  });

  it('ARCH-59: the same source twice counts once', async () => {
    using machine = createCommandMachine();
    machine.send({ type: 'LOADING', source: 'a', pending: true });
    machine.send({ type: 'LOADING', source: 'a', pending: true });
    machine.send({ type: 'LOADING', source: 'a', pending: false });
    await tick();
    expect(machine.getState().loading).toBe(false);
  });

  it('ARCH-59: ITEMS_LOADED no longer writes loading', async () => {
    using machine = createCommandMachine();
    machine.send({ type: 'LOADING', source: 'a', pending: true });
    machine.send({ type: 'ITEMS_LOADED', items: [{ id: itemId('x'), value: 'x' }] });
    await tick();
    expect(machine.getState().filteredCount).toBe(1);
    expect(machine.getState().loading).toBe(true);
  });
});
