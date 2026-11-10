// tests/unit/machine-loading.test.ts
// ARCH-59: state.loading follows the set of pending LOADING sources, not ITEMS_LOADED

import { createCommandMachine, itemId } from 'modern-cmdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The scheduler batches events into one requestAnimationFrame callback (happy-dom provides it). Faking only the
// frame functions makes every batch an explicit step: nothing in this file waits on a real async source.
const nextFrame = (): void => {
  vi.advanceTimersToNextFrame();
};

describe('ARCH-59 machine loading', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ARCH-59: LOADING with pending true adds its source and sets state.loading', () => {
    using machine = createCommandMachine();
    expect(machine.getState().loading).toBe(false);
    machine.send({ type: 'LOADING', source: 'a', pending: true });
    nextFrame();
    expect(machine.getState().loading).toBe(true);
    machine.send({ type: 'LOADING', source: 'a', pending: false });
    nextFrame();
    expect(machine.getState().loading).toBe(false);
  });

  it('ARCH-59: loading stays true while any source is pending', () => {
    using machine = createCommandMachine();
    machine.send({ type: 'LOADING', source: 'a', pending: true });
    machine.send({ type: 'LOADING', source: 'b', pending: true });
    machine.send({ type: 'LOADING', source: 'a', pending: false });
    nextFrame();
    expect(machine.getState().loading).toBe(true);
    machine.send({ type: 'LOADING', source: 'b', pending: false });
    nextFrame();
    expect(machine.getState().loading).toBe(false);
  });

  it('ARCH-59: the same source twice counts once', () => {
    using machine = createCommandMachine();
    machine.send({ type: 'LOADING', source: 'a', pending: true });
    machine.send({ type: 'LOADING', source: 'a', pending: true });
    nextFrame();
    // Positive control: the batch ran and the source is pending
    expect(machine.getState().loading).toBe(true);
    machine.send({ type: 'LOADING', source: 'a', pending: false });
    nextFrame();
    expect(machine.getState().loading).toBe(false);
  });

  it('ARCH-59: ITEMS_LOADED no longer writes loading', () => {
    using machine = createCommandMachine();
    machine.send({ type: 'LOADING', source: 'a', pending: true });
    machine.send({ type: 'ITEMS_LOADED', items: [{ id: itemId('x'), value: 'x' }] });
    nextFrame();
    expect(machine.getState().filteredCount).toBe(1);
    expect(machine.getState().loading).toBe(true);
  });
});
