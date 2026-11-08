// benchmarks/mount.bench.ts
// Ruling R5's Node-side mount series: how long the headless machine takes to hold N registered items,
// at N = 1,000 and 10,000, on the dataset every bench shares (benchmarks/fixtures.ts, 'basic').
// The browser series (10K <Command.Item> children in Chromium) is benchmarks/browser/. No absolute
// assertion here: the numbers are reported, the browser bench carries the gate.
//
//   registerItems       createCommandMachine({ items }) until the first state whose filteredIds holds all N.
//                       The constructor registers, indexes and refilters synchronously, so that state
//                       exists when the call returns; the bench asserts it and times the creation.
//   REGISTER_ITEM x N   an empty machine, N sends of { type: 'REGISTER_ITEM', item }, then the state
//                       emit (through subscribeState) whose filteredIds holds all N. Every send is a
//                       scheduled event that refilters the whole registry, so this path grows
//                       quadratically until the core batches the refilter.
//
// Machine creation of the second path and every dispose happen in beforeEach/afterEach, outside the
// timed window; every machine either path creates is disposed in afterEach. The slow case (REGISTER_ITEM x N at 10K takes seconds per iteration) gets an exact,
// small iteration count (time: 0 turns off tinybench's time budget, so the count alone decides the run
// length), which keeps `pnpm bench --run` well inside the CI bench job's 10 minute timeout.

import type { CommandEvent, CommandItem, CommandMachine } from 'modern-cmdk';
import { createCommandMachine, itemId } from 'modern-cmdk';
import { describe, test } from 'vitest';
import { generateItems } from './fixtures.ts';

/** tinybench run options: exactly `iterations` timed calls after exactly `warmupIterations` warm-up calls. */
const SLOW_RUN = { warmupIterations: 1, warmupTime: 0, iterations: 4, time: 0 } as const;

function registerItemsBench(items: readonly CommandItem[]) {
  let machine: CommandMachine | undefined;
  return {
    options: {
      // fn is synchronous. Without this option tinybench calls fn() once while registering the task, to
      // detect whether it is async, outside the hooks; that machine would be overwritten and never
      // disposed. `async: false` skips the probe (an async fn, as below, is recognised without a call).
      async: false,
      afterEach() {
        machine?.[Symbol.dispose]();
        machine = undefined;
      },
    },
    fn(): void {
      machine = createCommandMachine({ items });
      const held = machine.getState().filteredIds.length;
      if (held !== items.length) {
        throw new Error(`registerItems: filteredIds holds ${held} of ${items.length} items`);
      }
    },
  };
}

function registerEventsBench(items: readonly CommandItem[]) {
  const events: readonly CommandEvent[] = items.map((item) => ({ type: 'REGISTER_ITEM', item }));
  let machine: CommandMachine | undefined;
  let subscription: Disposable | undefined;
  let allHeld: PromiseWithResolvers<void> | undefined;
  return {
    options: {
      beforeEach() {
        const held = Promise.withResolvers<void>();
        allHeld = held;
        machine = createCommandMachine({});
        subscription = machine.subscribeState((state) => {
          if (state.filteredIds.length === items.length) held.resolve();
        });
      },
      afterEach() {
        subscription?.[Symbol.dispose]();
        machine?.[Symbol.dispose]();
        subscription = machine = allHeld = undefined;
      },
    },
    async fn(): Promise<void> {
      if (!machine || !allHeld) throw new Error('machine fixture missing: beforeEach did not run');
      for (const event of events) machine.send(event);
      await allHeld.promise;
    },
  };
}

// Vitest 5 — `bench` is a fixture factory; .run(options) executes/measures the task with tinybench options.
describe('Mount — 1K items', () => {
  const items = generateItems(1_000, 'basic', itemId);

  test('registerItems — 1K', async ({ bench }) => {
    const { options, fn } = registerItemsBench(items);
    await bench('registerItems — 1K', options, fn).run();
  });

  test('REGISTER_ITEM x N — 1K', async ({ bench }) => {
    const { options, fn } = registerEventsBench(items);
    await bench('REGISTER_ITEM x N — 1K', options, fn).run();
  });
});

describe('Mount — 10K items', () => {
  const items = generateItems(10_000, 'basic', itemId);

  test('registerItems — 10K', async ({ bench }) => {
    const { options, fn } = registerItemsBench(items);
    await bench('registerItems — 10K', options, fn).run();
  });

  test('REGISTER_ITEM x N — 10K', async ({ bench }) => {
    const { options, fn } = registerEventsBench(items);
    await bench('REGISTER_ITEM x N — 10K', options, fn).run(SLOW_RUN);
  });
});
