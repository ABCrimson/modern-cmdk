import { setImmediate } from 'node:timers/promises';
import type { FrecencyData, FrecencyStorage } from 'modern-cmdk';
import { createCommandMachine, itemId } from 'modern-cmdk';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The scheduler batches on requestAnimationFrame (happy-dom has it). Each test fakes only the frame
// clock: nextBatch() runs the pending batch synchronously. queueMicrotask and the other timers stay real.
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

it('CE-48: OPEN while open and CLOSE while closed emit no openChange', () => {
  const onOpenChange = vi.fn();
  using machine = createCommandMachine({ onOpenChange });
  const stateChange = vi.fn();
  using _subscription = machine.subscribeState(stateChange);

  machine.send({ type: 'CLOSE' }); // closed already
  nextBatch();
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(stateChange).not.toHaveBeenCalled();

  machine.send({ type: 'OPEN' });
  nextBatch();
  expect(onOpenChange).toHaveBeenCalledTimes(1);
  expect(onOpenChange).toHaveBeenLastCalledWith(true);
  expect(stateChange).toHaveBeenCalledTimes(1);
  expect(machine.getState().open).toBe(true);

  machine.send({ type: 'OPEN' }); // open already
  nextBatch();
  expect(onOpenChange).toHaveBeenCalledTimes(1);
  expect(stateChange).toHaveBeenCalledTimes(1);

  machine.send({ type: 'TOGGLE' }); // TOGGLE always flips
  nextBatch();
  expect(onOpenChange).toHaveBeenCalledTimes(2);
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  expect(machine.getState().open).toBe(false);
});

it('CE-110: a throw in the frecency hydration commit surfaces as an uncaught exception', async () => {
  let resolveLoad: (data: FrecencyData) => void = () => {};
  const storage: FrecencyStorage = {
    load: () => new Promise<FrecencyData>((resolve) => (resolveLoad = resolve)),
    save: async () => {},
    [Symbol.dispose]: () => {},
  };
  const boom = new Error('filter failed');
  let armed = false;
  using machine = createCommandMachine({
    items: [
      { id: itemId('a'), value: 'Apple' },
      { id: itemId('b'), value: 'Apricot' },
    ],
    // The refilter of the hydration commit is what throws (a listener's throw is rethrown by the emitter itself)
    filter: () => {
      if (armed) throw boom;
      return 1;
    },
    frecency: { enabled: true, storage },
  });
  machine.send({ type: 'SEARCH_CHANGE', query: 'ap' });
  nextBatch();
  expect(machine.getState().search).toBe('ap');

  armed = true;
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown): void => void rejections.push(reason);
  process.on('unhandledRejection', onRejection);
  // The scheduler reports a failed update by rethrowing from a microtask: capture the rethrow
  // instead of letting it fail the run
  const rethrown: Array<() => void> = [];
  using _microtask = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
    rethrown.push(callback);
  });
  try {
    resolveLoad({ records: new Map([[itemId('b'), { frequency: 3, lastUsed: Date.now() }]]) });
    await setImmediate(); // the load settles, the hydration marks the results dirty
    nextBatch(); // the scheduled commit runs, the listener throws
    await setImmediate();
    expect(rejections).toEqual([]);
    const errors = rethrown.map((callback) => {
      try {
        callback();
        return undefined;
      } catch (error) {
        return error;
      }
    });
    expect(errors).toContain(boom);
  } finally {
    process.off('unhandledRejection', onRejection);
  }
});
