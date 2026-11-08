import { createCommandMachine } from 'modern-cmdk';
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
