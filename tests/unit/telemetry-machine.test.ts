// tests/unit/telemetry-machine.test.ts
// CE-18, ARCH-32, CE-74: the machine calls the hooks of its `telemetry` option
// (packages/modern-cmdk/src/core/machine.ts, telemetry.ts).

import type { CommandItem } from 'modern-cmdk';
import { createCommandMachine, itemId } from 'modern-cmdk';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The scheduler batches on requestAnimationFrame. Each test fakes only the frame clock:
// nextBatch() runs the pending batch synchronously. Date and performance stay real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

it('CE-18: onSearchComplete reports the count the batch ends with when items register after the query', () => {
  const onSearchComplete = vi.fn();
  using machine = createCommandMachine({ items, telemetry: { onSearchComplete } });
  nextBatch();

  machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
  machine.send({
    type: 'REGISTER_ITEM',
    item: { id: itemId('applesauce'), value: 'Applesauce' },
  });
  nextBatch();

  expect(machine.getState().filteredCount).toBe(3);
  expect(onSearchComplete).toHaveBeenCalledTimes(1);
  expect(onSearchComplete.mock.calls[0]?.slice(0, 2)).toEqual(['app', 3]);
});

it('CE-18: a SEARCH_CHANGE that repeats the current query reports nothing', () => {
  const onSearchComplete = vi.fn();
  using machine = createCommandMachine({ items, telemetry: { onSearchComplete } });
  nextBatch();

  machine.send({ type: 'SEARCH_CHANGE', query: '' }); // the committed query already
  nextBatch();
  expect(onSearchComplete).not.toHaveBeenCalled();

  machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
  nextBatch();
  expect(onSearchComplete).toHaveBeenCalledTimes(1);

  machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
  nextBatch();
  expect(onSearchComplete).toHaveBeenCalledTimes(1);

  // A batch that leaves the committed query where it was reports nothing
  machine.send({ type: 'SEARCH_CHANGE', query: 'a' });
  machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
  nextBatch();
  expect(onSearchComplete).toHaveBeenCalledTimes(1);
});

it('CE-18: a throwing onSearchComplete does not skip onSearchChange', () => {
  const errors: unknown[] = [];
  // The scheduler rethrows a failing slot through queueMicrotask: collect it, do not fail the run
  vi.stubGlobal('queueMicrotask', (run: () => void) => {
    try {
      run();
    } catch (error) {
      errors.push(error);
    }
  });
  const onSearchChange = vi.fn();
  const failure = new Error('analytics down');
  using machine = createCommandMachine({
    items,
    onSearchChange,
    telemetry: {
      onSearchComplete: () => {
        throw failure;
      },
    },
  });
  nextBatch();

  machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
  nextBatch();

  expect(onSearchChange).toHaveBeenCalledExactlyOnceWith('app');
  expect(errors).toEqual([failure]);
});

it('CE-18: a select of a disabled item reports nothing', () => {
  const onItemSelected = vi.fn();
  using machine = createCommandMachine({
    items: [...items, { id: itemId('grape'), value: 'Grape', disabled: true }],
    telemetry: { onItemSelected },
  });
  nextBatch();

  machine.send({ type: 'ITEM_SELECT', id: itemId('grape') });
  nextBatch();
  expect(onItemSelected).not.toHaveBeenCalled();

  machine.send({ type: 'ITEM_SELECT', id: itemId('apple') });
  nextBatch();
  expect(onItemSelected).toHaveBeenCalledTimes(1);
});

it('D113: a machine created open reports onPaletteOpen at its first commit', () => {
  const onPaletteOpen = vi.fn();
  const onPaletteClose = vi.fn();
  using machine = createCommandMachine({
    open: true,
    telemetry: { onPaletteOpen, onPaletteClose },
  });
  expect(onPaletteOpen).not.toHaveBeenCalled(); // construction has no commit

  machine.send({ type: 'SEARCH_CHANGE', query: 'a' });
  nextBatch();
  expect(onPaletteOpen).toHaveBeenCalledTimes(1);

  machine.send({ type: 'CLOSE' });
  nextBatch();
  expect(onPaletteClose).toHaveBeenCalledTimes(1);
  expect(onPaletteClose).toHaveBeenCalledWith(expect.any(Number));
  expect(onPaletteOpen).toHaveBeenCalledTimes(1);
});

it('D113: a batch that opens and closes again reports no session', () => {
  const onPaletteOpen = vi.fn();
  const onPaletteClose = vi.fn();
  using machine = createCommandMachine({ telemetry: { onPaletteOpen, onPaletteClose } });

  machine.send({ type: 'OPEN' });
  machine.send({ type: 'CLOSE' });
  nextBatch();
  expect(machine.getState().open).toBe(false);
  expect(onPaletteOpen).not.toHaveBeenCalled();
  expect(onPaletteClose).not.toHaveBeenCalled();
});

it('D113: a second batch while open reports no second onPaletteOpen', () => {
  const onPaletteOpen = vi.fn();
  using machine = createCommandMachine({ items, telemetry: { onPaletteOpen } });

  machine.send({ type: 'OPEN' });
  nextBatch();
  expect(onPaletteOpen).toHaveBeenCalledTimes(1);

  machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
  nextBatch();
  expect(machine.getState().open).toBe(true);
  expect(onPaletteOpen).toHaveBeenCalledTimes(1);
});

it("D107: a subscriber that disposes the machine stops that batch's telemetry", () => {
  const onPaletteOpen = vi.fn();
  const onSearchComplete = vi.fn();
  const onSearchChange = vi.fn();
  using machine = createCommandMachine({
    items,
    onSearchChange,
    telemetry: { onPaletteOpen, onSearchComplete },
  });
  machine.subscribe(() => machine[Symbol.dispose]());

  machine.send({ type: 'OPEN' });
  machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
  nextBatch();
  // The state report ran before the dispose; the telemetry of the batch did not
  expect(onSearchChange).toHaveBeenCalledWith('app');
  expect(onPaletteOpen).not.toHaveBeenCalled();
  expect(onSearchComplete).not.toHaveBeenCalled();
});

it("D112: a refilter that throws at the commit still reports that batch's telemetry", () => {
  const errors: unknown[] = [];
  // The scheduler rethrows a failing commit through queueMicrotask: collect it, do not fail the run
  vi.stubGlobal('queueMicrotask', (run: () => void) => {
    try {
      run();
    } catch (error) {
      errors.push(error);
    }
  });
  const failure = new Error('filter down');
  const onPaletteOpen = vi.fn();
  const onSearchComplete = vi.fn();
  const onItemSelected = vi.fn();
  using machine = createCommandMachine({
    items,
    filter: (item: CommandItem, query: string) => {
      if (item.value === 'Applet') throw failure;
      return item.value.toLowerCase().includes(query.toLowerCase()) ? 1 : false;
    },
    telemetry: { onPaletteOpen, onSearchComplete, onItemSelected },
  });
  nextBatch();

  machine.send({ type: 'OPEN' });
  machine.send({ type: 'ITEM_SELECT', id: itemId('apple') });
  machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
  // Registered after the query: the commit's refilter runs over it and throws
  machine.send({ type: 'REGISTER_ITEM', item: { id: itemId('applet'), value: 'Applet' } });
  nextBatch();

  expect(errors).toEqual([failure]);
  expect(onPaletteOpen).toHaveBeenCalledTimes(1);
  expect(onSearchComplete).toHaveBeenCalledTimes(1);
  expect(onItemSelected).toHaveBeenCalledTimes(1);
});

it("CE-18: each batch's onSearchComplete is timed from that batch's first SEARCH_CHANGE", () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const onSearchComplete = vi.fn();
  using machine = createCommandMachine({ items, telemetry: { onSearchComplete } });
  nextBatch();

  now = 100;
  machine.send({ type: 'SEARCH_CHANGE', query: 'a' });
  nextBatch();
  now = 200;
  machine.send({ type: 'SEARCH_CHANGE', query: 'a' }); // the committed query: reports nothing
  nextBatch();
  now = 5000;
  machine.send({ type: 'SEARCH_CHANGE', query: 'ap' });
  nextBatch();

  expect(onSearchComplete).toHaveBeenCalledTimes(2);
  expect(onSearchComplete.mock.calls.map((call) => call[2])).toEqual([0, 0]);
});

it('CE-18: onItemSelected reports each select once', () => {
  const onItemSelected = vi.fn();
  using machine = createCommandMachine({ items, telemetry: { onItemSelected } });
  nextBatch();

  machine.send({ type: 'ITEM_SELECT', id: itemId('pineapple') });
  nextBatch();
  expect(onItemSelected).toHaveBeenCalledTimes(1);

  machine.send({ type: 'OPEN' });
  nextBatch();
  expect(onItemSelected).toHaveBeenCalledTimes(1);
});

it('CE-18: one batch reports the search, then the selects, then the close', () => {
  const log: string[] = [];
  using machine = createCommandMachine({
    items,
    open: true,
    telemetry: {
      onPaletteOpen: () => log.push('open'),
      onSearchComplete: () => log.push('search'),
      onItemSelected: () => log.push('select'),
      onPaletteClose: () => log.push('close'),
    },
  });
  machine.send({ type: 'OPEN' }); // the first commit reports the open of a machine created open
  nextBatch();
  log.length = 0;

  machine.send({ type: 'SEARCH_CHANGE', query: 'app' });
  machine.send({ type: 'ITEM_SELECT', id: itemId('pineapple') });
  machine.send({ type: 'CLOSE' });
  nextBatch();

  expect(log).toEqual(['search', 'select', 'close']);
});
