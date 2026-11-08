// tests/unit/telemetry-machine.test.ts
// CE-18, ARCH-32, CE-74: the machine calls the hooks of its `telemetry` option
// (packages/modern-cmdk/src/core/machine.ts, telemetry.ts).

import type { CommandItem } from 'modern-cmdk';
import { createCommandMachine, itemId } from 'modern-cmdk';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The scheduler batches on requestAnimationFrame. Each test fakes only the frame clock: nextBatch() runs the
// pending batch synchronously. Date and performance stay real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Runs the batch the scheduler has pending (one animation frame) */
function nextBatch(): void {
  vi.advanceTimersToNextFrame();
}

const items: readonly CommandItem[] = [
  { id: itemId('banana'), value: 'Banana' },
  { id: itemId('apple'), value: 'Apple' },
  { id: itemId('cherry'), value: 'Cherry' },
  { id: itemId('pineapple'), value: 'Pineapple' },
];

it('CE-18: an OPEN of a closed machine calls onPaletteOpen once', () => {
  const onPaletteOpen = vi.fn();
  const onPaletteClose = vi.fn();
  using machine = createCommandMachine({ telemetry: { onPaletteOpen, onPaletteClose } });

  machine.send({ type: 'OPEN' });
  machine.send({ type: 'OPEN' }); // open already
  nextBatch();
  expect(onPaletteOpen).toHaveBeenCalledTimes(1);
  expect(onPaletteClose).not.toHaveBeenCalled();

  machine.send({ type: 'CLOSE' });
  machine.send({ type: 'CLOSE' }); // closed already
  nextBatch();
  expect(onPaletteClose).toHaveBeenCalledTimes(1);
  expect(onPaletteClose).toHaveBeenCalledWith(expect.any(Number));
  expect(onPaletteOpen).toHaveBeenCalledTimes(1);
});

it('CE-18: onSearchComplete reports the filtered count after a query', () => {
  const onSearchComplete = vi.fn();
  using machine = createCommandMachine({ items, telemetry: { onSearchComplete } });
  nextBatch();

  machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
  nextBatch();
  expect(machine.getState().filteredCount).toBe(2); // Apple and Pineapple of the four items
  expect(onSearchComplete).toHaveBeenCalledTimes(1);
  const [query, resultCount, durationMs] = onSearchComplete.mock.calls[0] ?? [];
  expect(query).toBe('app');
  expect(resultCount).toBe(2);
  expect(durationMs).toBeGreaterThanOrEqual(0);
});

it('CE-18: onItemSelected reports the query and the filtered position', () => {
  const onItemSelected = vi.fn();
  using machine = createCommandMachine({ items, telemetry: { onItemSelected } });
  nextBatch();

  machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
  nextBatch();
  const { filteredIds } = machine.getState();
  const target = itemId('pineapple');
  const position = filteredIds.indexOf(target);
  expect(position).toBeGreaterThan(0);

  machine.send({ type: 'ITEM_SELECT', id: target });
  nextBatch();
  expect(onItemSelected).toHaveBeenCalledExactlyOnceWith(target, 'app', position);

  // An item outside the filtered list (a shortcut can select one) reports -1
  machine.send({ type: 'ITEM_SELECT', id: itemId('cherry') });
  nextBatch();
  expect(onItemSelected).toHaveBeenLastCalledWith(itemId('cherry'), 'app', -1);
});

it('CE-74: a wall-clock step yields no negative duration', () => {
  const onPaletteClose = vi.fn();
  using machine = createCommandMachine({ telemetry: { onPaletteClose } });

  machine.send({ type: 'OPEN' });
  nextBatch();
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now - 3_600_000); // the clock steps back an hour
  machine.send({ type: 'CLOSE' });
  nextBatch();

  expect(onPaletteClose).toHaveBeenCalledTimes(1);
  expect(onPaletteClose.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(0);
});
