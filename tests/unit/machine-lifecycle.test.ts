import { setImmediate } from 'node:timers/promises';
import type { CommandItem, FrecencyData, FrecencyStorage, ItemId } from 'modern-cmdk';
import {
  createCommandMachine,
  createSearchEngine,
  FrecencyEngine,
  itemId,
  KeyboardShortcutRegistry,
  MemoryFrecencyStorage,
} from 'modern-cmdk';
import { afterEach, beforeEach, expect, it, type Mock, vi } from 'vitest';

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

it("D103: dispose leaves a caller's searchEngine undisposed and disposes the engine the machine created", () => {
  // The search engine unregisters its dev leak sentinel from the FinalizationRegistry when it is disposed
  // (the sentinel is the unregister token), so an unregister call observes the disposal; the machine unregisters
  // its own collection hook (token: the machine) when it owns the engine
  using unregister = vi.spyOn(FinalizationRegistry.prototype, 'unregister');

  using callerEngine = createSearchEngine();
  const callerDispose = vi.spyOn(callerEngine, Symbol.dispose);
  createCommandMachine({ searchEngine: callerEngine })[Symbol.dispose]();
  createCommandMachine({ search: callerEngine })[Symbol.dispose]();
  expect(callerDispose).not.toHaveBeenCalled();
  expect(unregister).not.toHaveBeenCalled();

  const owning = createCommandMachine();
  owning[Symbol.dispose]();
  // The machine drops its own registration (token: the machine) and the engine its sentinel (token: the sentinel)
  const tokens = unregister.mock.calls.map(([token]) => token);
  expect(tokens).toHaveLength(2);
  expect(tokens).toContain(owning);
});

/** Presses Ctrl+<key> on the document */
function press(key: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, cancelable: true }));
}

/** How many of a listener spy's calls concern `keydown` */
const keydowns = (spy: { mock: { calls: unknown[][] } }): number =>
  spy.mock.calls.filter(([type]) => type === 'keydown').length;

/** A storage that counts its saves */
function countingStorage(): FrecencyStorage & { readonly save: Mock<FrecencyStorage['save']> } {
  const inner = new MemoryFrecencyStorage();
  return {
    load: (namespace: string) => inner.load(namespace),
    save: vi.fn((namespace: string, data: FrecencyData) => inner.save(namespace, data)),
    [Symbol.dispose]: () => inner[Symbol.dispose](),
  };
}

const apple: CommandItem = { id: itemId('apple'), value: 'Apple', shortcut: 'ctrl+j' };

it('D102: suspend() detaches the shortcut keydown listener and resume() re-attaches it', () => {
  const onSelect = vi.fn();
  using add = vi.spyOn(document, 'addEventListener');
  using remove = vi.spyOn(document, 'removeEventListener');
  using machine = createCommandMachine({ items: [{ ...apple, onSelect }] });
  expect(keydowns(add)).toBe(1);

  press('j');
  expect(onSelect).toHaveBeenCalledTimes(1);

  machine.suspend();
  expect(keydowns(remove)).toBe(1);
  press('j');
  expect(onSelect).toHaveBeenCalledTimes(1);

  machine.resume();
  expect(keydowns(add)).toBe(2);
  press('j');
  expect(onSelect).toHaveBeenCalledTimes(2);
});

it('D102: suspend() starts the save of a pending frecency selection and leaves no timer', async () => {
  vi.useRealTimers();
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  const storage = countingStorage();
  using machine = createCommandMachine({ items: [apple], frecency: { enabled: true, storage } });
  machine.send({ type: 'ITEM_SELECT', id: apple.id });
  nextBatch();
  expect(storage.save).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1); // the 1000 ms debounce

  machine.suspend();
  await setImmediate();
  expect(storage.save).toHaveBeenCalledTimes(1); // before the debounce elapsed
  expect(vi.getTimerCount()).toBe(0);

  await vi.advanceTimersByTimeAsync(2000);
  expect(storage.save).toHaveBeenCalledTimes(1);
});

it('D102: suspend() detaches the pagehide and visibilitychange saves and resume() re-attaches them', async () => {
  const storage = countingStorage();
  using hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  using machine = createCommandMachine({ items: [apple], frecency: { enabled: true, storage } });
  const select = async (): Promise<void> => {
    machine.send({ type: 'ITEM_SELECT', id: apple.id });
    nextBatch();
    await setImmediate();
  };

  machine.suspend();
  await select(); // dirty again, and no timer
  globalThis.dispatchEvent(new Event('pagehide'));
  document.dispatchEvent(new Event('visibilitychange'));
  await setImmediate();
  expect(storage.save).not.toHaveBeenCalled();

  machine.resume();
  globalThis.dispatchEvent(new Event('pagehide'));
  await setImmediate();
  expect(storage.save).toHaveBeenCalledTimes(1);

  await select();
  document.dispatchEvent(new Event('visibilitychange'));
  await setImmediate();
  expect(storage.save).toHaveBeenCalledTimes(2);
  expect(hidden).toHaveBeenCalled();
});

it('D102: suspend() runs the scheduled batch at once, so no frame stays queued', () => {
  using machine = createCommandMachine({ items: [apple, { id: itemId('pear'), value: 'Pear' }] });
  machine.send({ type: 'SEARCH_CHANGE', query: 'pear' });
  expect(machine.getState().search).toBe('');
  expect(vi.getTimerCount()).toBe(1); // the frame

  machine.suspend();
  expect(machine.getState().search).toBe('pear');
  expect(vi.getTimerCount()).toBe(0);
});

it('D102: suspend() and resume() are idempotent and do nothing after dispose', async () => {
  const onSelect = vi.fn();
  const storage = countingStorage();
  using add = vi.spyOn(document, 'addEventListener');
  using remove = vi.spyOn(document, 'removeEventListener');
  const machine = createCommandMachine({
    items: [{ ...apple, onSelect }],
    frecency: { enabled: true, storage },
  });

  machine.suspend();
  machine.suspend();
  expect(keydowns(remove)).toBe(1);
  machine.resume();
  machine.resume();
  expect(keydowns(add)).toBe(2); // construction and the one resume
  press('j');
  expect(onSelect).toHaveBeenCalledTimes(1);

  machine[Symbol.dispose]();
  const added = add.mock.calls.length;
  machine.suspend();
  machine.resume();
  expect(add.mock.calls.length).toBe(added);
  press('j');
  expect(onSelect).toHaveBeenCalledTimes(1);
  await setImmediate();
});

it('D102: FrecencyEngine suspend() and resume() do nothing after dispose', async () => {
  const storage = countingStorage();
  const engine = new FrecencyEngine({ storage });
  engine.suspend();
  engine.resume();
  engine.recordSelection(apple.id);
  globalThis.dispatchEvent(new Event('pagehide'));
  await setImmediate();
  expect(storage.save).toHaveBeenCalledTimes(1);

  engine[Symbol.dispose]();
  await setImmediate();
  const saves = storage.save.mock.calls.length;
  engine.resume(); // must not re-attach
  engine.recordSelection(apple.id);
  engine.suspend();
  globalThis.dispatchEvent(new Event('pagehide'));
  await setImmediate();
  expect(storage.save.mock.calls.length).toBe(saves);
  expect(vi.getTimerCount()).toBe(0);
});

it('D102: KeyboardShortcutRegistry suspend() and resume() do nothing after dispose', () => {
  const handler = vi.fn();
  const registry = new KeyboardShortcutRegistry();
  registry.register('ctrl+j', apple.id, handler);
  registry.suspend();
  press('j');
  expect(handler).not.toHaveBeenCalled();
  registry.resume();
  press('j');
  expect(handler).toHaveBeenCalledTimes(1);

  registry[Symbol.dispose]();
  registry.resume();
  press('j');
  registry.suspend();
  expect(handler).toHaveBeenCalledTimes(1);
});

// Copied from tests/unit/memory-leak.test.ts (TUB-81): major GCs, each followed by a macrotask so
// FinalizationRegistry callbacks run, until the caller's WeakRefs settle.
async function collectGarbage(settled: () => boolean, passes = 20): Promise<void> {
  const gc = globalThis.gc;
  if (typeof gc !== 'function')
    throw new Error('gc() is missing: the unit project runs with --expose-gc');
  for (let pass = 0; pass < passes; pass++) {
    await gc({ type: 'major', execution: 'async', flavor: 'last-resort' });
    await setImmediate();
    if (settled()) return;
  }
}

/** Creates suspended machines (one with a custom filter, the closure that could pin its machine) and drops them. */
function createAndDrop(): WeakRef<object>[] {
  const refs: WeakRef<object>[] = [];
  for (let i = 0; i < 20; i++) {
    const machine = createCommandMachine({
      items: [{ ...apple, onSelect: () => undefined }],
      filter:
        i % 2
          ? (item: CommandItem, query: string) => (item.value.includes(query) ? 1 : false)
          : undefined,
      frecency: { enabled: true },
    });
    machine.suspend();
    refs.push(new WeakRef(machine));
  }
  return refs;
}

it('D102: a collected machine disposes the search engine it created, so the leak warning stays silent', async () => {
  // The dev leak registry is active here: NODE_ENV is 'test' and happy-dom defines window
  using warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const refs = createAndDrop();
  await collectGarbage(() => refs.every((ref) => ref.deref() === undefined));
  expect(refs.filter((ref) => ref.deref() !== undefined)).toHaveLength(0);
  await collectGarbage(() => false, 5); // the engines' sentinels would have warned by now
  expect(
    warn.mock.calls.filter(([message]) =>
      String(message).includes('garbage collected without being disposed'),
    ),
  ).toEqual([]);
});

const abc: CommandItem[] = ['a', 'b', 'c'].map((id) => ({ id: itemId(id), value: `Item ${id}` }));
const [a, b, c] = abc.map((item) => item.id) as [ItemId, ItemId, ItemId];

it('ARCH-29: controlled activeId: navigation reports the candidate and the state holds', () => {
  const onActiveChange = vi.fn();
  using machine = createCommandMachine({ items: abc, activeId: a, onActiveChange });
  expect(machine.getState().activeId).toBe(a);

  machine.send({ type: 'NAVIGATE', direction: 'next' });
  nextBatch();
  expect(onActiveChange).toHaveBeenCalledExactlyOnceWith(b);
  expect(machine.getState().activeId).toBe(a);

  machine.send({ type: 'ITEM_ACTIVATE', id: c });
  nextBatch();
  expect(onActiveChange).toHaveBeenLastCalledWith(c);
  expect(machine.getState().activeId).toBe(a);

  // The refilter's fallback is a candidate too: the controlled item left the list
  machine.send({ type: 'SEARCH_CHANGE', query: 'Item b' });
  nextBatch();
  expect(onActiveChange).toHaveBeenLastCalledWith(b);
  expect(machine.getState().activeId).toBe(a);
});

it("ARCH-29: controlled activeId: activating the option's own id applies it without a callback", () => {
  const onActiveChange = vi.fn();
  let controlled: ItemId | null = a;
  using machine = createCommandMachine({
    items: abc,
    get activeId(): ItemId | null {
      return controlled;
    },
    onActiveChange,
  });

  controlled = b; // the caller moved the active item; its root tells the machine
  machine.send({ type: 'NAVIGATE', direction: 'next' }); // from the option's b to c
  machine.send({ type: 'ITEM_ACTIVATE', id: b });
  nextBatch();
  expect(onActiveChange).toHaveBeenCalledExactlyOnceWith(c);
  expect(machine.getState().activeId).toBe(b);
});

it('ARCH-29: controlled activeId: undefined leaves the machine in charge of the active item', () => {
  const onActiveChange = vi.fn();
  using machine = createCommandMachine({ items: abc, activeId: undefined, onActiveChange });
  expect(machine.getState().activeId).toBe(a); // the first item

  machine.send({ type: 'NAVIGATE', direction: 'next' });
  nextBatch();
  expect(machine.getState().activeId).toBe(b);
  machine.send({ type: 'ITEM_ACTIVATE', id: c });
  nextBatch();
  expect(machine.getState().activeId).toBe(c);
  expect(onActiveChange.mock.calls).toEqual([[b], [c]]);
});

it('ARCH-29: controlled activeId: construction calls no callback, whatever the option names', () => {
  const onActiveChange = vi.fn();
  const missing = itemId('missing');
  using named = createCommandMachine({ items: abc, activeId: missing, onActiveChange });
  using none = createCommandMachine({ items: abc, activeId: null, onActiveChange });
  expect(onActiveChange).not.toHaveBeenCalled();
  expect(named.getState().activeId).toBe(missing);
  expect(none.getState().activeId).toBeNull();
});
