import { setImmediate } from 'node:timers/promises';
import { type CommandItem, createCommandMachine, type ItemId, itemId } from 'modern-cmdk';
import { describe, expect, it } from 'vitest';

// Needs `node --expose-gc`: the 'unit' project sets execArgv in vitest.config.ts for this suite.

/** Resolves after the next animation frame; the scheduler runs a whole batch in one frame, FIFO. */
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });

/** The most major collections one `collectGarbage` call runs while its predicate stays false. */
const MAX_COLLECTIONS = 20;

/** Collections a `collectGarbage` call without a predicate runs. */
const FIXED_COLLECTIONS = 3;

/**
 * Runs major GCs until `settled()` is true, at most MAX_COLLECTIONS of them; without a predicate it
 * runs FIXED_COLLECTIONS passes. TUB-81: a single major GC can leave one of many young objects
 * uncollected (CI run 42455685144: 9999 of 10000 WeakRefs cleared, one survived), so the loop
 * repeats the collection until the refs settle. Each pass is
 * `gc({ type: 'major', execution: 'async', flavor: 'last-resort' })`, awaited, then a macrotask
 * turn: a WeakRef target created or dereferenced in a task stays alive until the microtask queue
 * drains (V8 clears kept objects at the end of the microtask checkpoint; an await is not enough),
 * and FinalizationRegistry callbacks run in their own tasks. The predicate only decides when to
 * stop: callers still assert the strict zero afterwards, so a ref that survives all
 * MAX_COLLECTIONS passes (a real leak) still fails. Fails loudly when the worker has no gc().
 */
async function collectGarbage(settled?: () => boolean): Promise<void> {
  const gc = globalThis.gc;
  if (typeof gc !== 'function') {
    throw new Error(
      'gc() is missing: the unit project must run with --expose-gc (vitest.config.ts execArgv)',
    );
  }
  const passes = settled === undefined ? FIXED_COLLECTIONS : MAX_COLLECTIONS;
  for (let pass = 0; pass < passes; pass++) {
    await gc({ type: 'major', execution: 'async', flavor: 'last-resort' });
    await setImmediate();
    if (settled?.()) return;
  }
}

/** True when every ref's target has been collected. */
const allCollected = (refs: readonly WeakRef<object>[]): boolean =>
  refs.every((ref) => ref.deref() === undefined);

// ES2025 Iterator helpers: 1000 items, "Item 0" .. "Item 999"
const items: readonly CommandItem[] = Iterator.from({
  [Symbol.iterator]: function* (): Generator<number> {
    for (let i = 0; i < 1000; i++) yield i;
  },
})
  .map((i) => ({ id: itemId(`item-${i}`), value: `Item ${i}` }))
  .toArray();

/**
 * Creates, drives and disposes 100 machines. The machines exist only inside this function, so
 * the caller holds nothing but the WeakRefs.
 */
async function runLifecycles(): Promise<WeakRef<object>[]> {
  const refs: WeakRef<object>[] = [];
  for (let i = 0; i < 100; i++) {
    using machine = createCommandMachine({ items });
    refs.push(new WeakRef(machine));

    machine.send({ type: 'SEARCH_CHANGE', query: 'item' });
    machine.send({ type: 'NAVIGATE', direction: 'next' });
    await nextFrame();

    // SEARCH_CHANGE refiltered and NAVIGATE moved the active item one past the first match
    const state = machine.getState();
    expect(state.search).toBe('item');
    expect(state.filteredIds.length).toBeGreaterThan(1);
    expect(state.activeId).toBe(state.filteredIds[1]);
  }
  return refs;
}

/** Subscribes `count` listeners, unsubscribes them all and returns WeakRefs to the listeners. */
function subscribeAndUnsubscribe(
  machine: ReturnType<typeof createCommandMachine>,
  count: number,
): { refs: WeakRef<object>[]; sink: { calls: number } } {
  const refs: WeakRef<object>[] = [];
  const unsubs: Array<() => void> = [];
  const sink = { calls: 0 };
  for (let i = 0; i < count; i++) {
    const listener = (): void => {
      sink.calls++;
    };
    refs.push(new WeakRef(listener));
    unsubs.push(machine.subscribe(listener));
  }
  for (const unsub of unsubs) unsub();
  return { refs, sink };
}

/** Subscribes one listener and returns a WeakRef to it. */
function subscribeOne(machine: ReturnType<typeof createCommandMachine>): WeakRef<object> {
  const listener = (): void => {};
  machine.subscribe(listener);
  return new WeakRef(listener);
}

describe('memory leak detection', () => {
  it('T13, MEM-1, MEM-3: 100 lifecycles process their events, leave no machine reachable after dispose, and the final machine\'s "Item 5" query keeps item-5 and drops item-0', async () => {
    const refs = await runLifecycles();
    expect(refs).toHaveLength(100);

    await collectGarbage(() => allCollected(refs));
    expect(refs.filter((ref) => ref.deref() !== undefined)).toHaveLength(0);

    // The system still works after 100 create/dispose cycles
    using finalMachine = createCommandMachine({ items });
    finalMachine.send({ type: 'SEARCH_CHANGE', query: 'Item 5' });
    await nextFrame();

    const state = finalMachine.getState();
    expect(state.search).toBe('Item 5');
    expect(state.filteredIds).toContain(itemId('item-5'));
    // "Item 0" has no "5" to match, so the query must have removed it
    expect(state.filteredIds).not.toContain(itemId('item-0'));
    expect(state.filteredIds.length).toBeLessThan(items.length);
  });

  it('MEM-3: 10K unsubscribed listeners are released while the machine stays alive, and never fire', async () => {
    using machine = createCommandMachine();
    const { refs, sink } = subscribeAndUnsubscribe(machine, 10_000);
    expect(refs).toHaveLength(10_000);

    // A listener unsubscribed before the event must stay silent; a live one proves events fire
    let removedCalls = 0;
    let liveCalls = 0;
    const unsubRemoved = machine.subscribe(() => {
      removedCalls++;
    });
    const unsubLive = machine.subscribe(() => {
      liveCalls++;
    });
    unsubRemoved();

    machine.send({ type: 'SEARCH_CHANGE', query: 'test' });
    await nextFrame();
    expect(machine.getState().search).toBe('test');
    expect(liveCalls).toBeGreaterThan(0);
    expect(removedCalls).toBe(0);
    expect(sink.calls).toBe(0);
    unsubLive();

    await collectGarbage(() => allCollected(refs));
    expect(refs.filter((ref) => ref.deref() !== undefined)).toHaveLength(0);
    // The machine is still referenced and usable after the collection
    expect(machine.getState().search).toBe('test');
  });

  it('MEM-3: dispose releases the subscribers of a machine that is still referenced', async () => {
    const machine = createCommandMachine();
    const listenerRef = subscribeOne(machine);

    machine[Symbol.dispose]();
    await collectGarbage(() => listenerRef.deref() === undefined);

    expect(listenerRef.deref()).toBeUndefined();
    // The machine itself was alive for the whole collection
    expect(machine.getState().search).toBe('');
  });

  it('MEM-2: 5000 register/unregister pairs leave only the persistent item in the registry and the filtered ids', async () => {
    using machine = createCommandMachine();
    const keep: ItemId = itemId('persistent');
    machine.send({ type: 'REGISTER_ITEM', item: { id: keep, value: 'Persistent' } });

    for (let i = 0; i < 5000; i++) {
      const id = itemId(`temp-${i}`);
      machine.send({ type: 'REGISTER_ITEM', item: { id, value: `Temp ${i}` } });
      machine.send({ type: 'UNREGISTER_ITEM', id });
    }
    await nextFrame();

    expect(machine.getRegistry().size).toBe(1);
    expect(machine.getState().filteredIds).toEqual([keep]);
  });
});
