// benchmarks/registration.bench.ts
// P33, the registration complexity budget: registering N items through the machine and unregistering
// them again must stay linear in N. The benches time four paths at N = 1,000 and 10,000, then one
// assertion divides the per-item time at 10K by the per-item time at 1K and fails when the quotient
// exceeds GROWTH_FACTOR, so a registry (or keyboard registry, or search index) that does O(N) work
// per item turns the perf project red.
//
//   register              N sends of { type: 'REGISTER_ITEM', item }, then the state emit whose
//                         filteredIds holds all N (as benchmarks/mount.bench.ts times it).
//   unregister            the machine holds N items (set up in beforeEach, outside the timed window);
//                         N sends of { type: 'UNREGISTER_ITEM', id }, then the state emit whose
//                         filteredIds is empty.
//   register + shortcuts  the same as register, each item carrying a distinct shortcut, with
//   unregister + shortcuts shortcutAction: 'select' so the machine binds every one of them: the
//                         unregister path then runs KeyboardShortcutRegistry.unregisterByItem N times.
//
// The statistic is the median latency (tinybench's latency.p50, ms per iteration) divided by N; the
// ratio is per-item(10K) / per-item(1K). Measured on the landed 1.6.0 core (Node 28 nightly, Windows 11,
// 4 runs of this file, 2026-11-08): register 1.29-2.12x, unregister 1.72-1.95x, register + shortcuts
// 1.08-1.97x, unregister + shortcuts 1.20-1.59x. The pre-1.6.0 core refiltered on every send;
// mount.bench.ts measured REGISTER_ITEM x N at ~70-90 ms for 1K and ~9-10 s for 10K, a per-item ratio
// of ~13. The self-check at the end of this file measures a deliberately quadratic stand-in at 9.0-12.0x.
//
// Vitest runs the tests of a file in order, so the benches fill RESULTS before the assertion reads it;
// a missing result (a bench filtered out with -t, or one that threw) fails the assertion with its name.

import type { CommandEvent, CommandItem, CommandMachine } from 'modern-cmdk';
import { createCommandMachine, itemId } from 'modern-cmdk';
import { describe, expect, test } from 'vitest';
import { generateItems } from './fixtures.ts';

/**
 * The most the per-item time may grow from 1K to 10K items. Linear work measures ~1-2x here (the fixed
 * cost of one microtask batch and one refilter weighs more at 1K, a bigger working set costs more cache
 * misses and GC at 10K); a quadratic path measures ~10x (13x on the pre-1.6.0 core, 9-12x for the
 * self-check stand-in). 4x sits about twice the highest linear ratio measured (2.12x) and under half the
 * lowest quadratic one (9.0x), which leaves room for CI noise in both directions.
 */
const GROWTH_FACTOR = 4;

const SIZES = [1_000, 10_000] as const;
type Size = (typeof SIZES)[number];

/** Median latency per iteration (ms) of every bench, keyed by `${path} @ ${N}`. */
const RESULTS = new Map<string, number>();

const key = (path: string, n: number): string => `${path} @ ${n}`;

/** Per-item time (ms) of a recorded bench, or an error naming the path that has no result. */
function perItemMs(path: string, n: Size): number {
  const median = RESULTS.get(key(path, n));
  if (median === undefined)
    throw new Error(`registration: no result recorded for "${key(path, n)}"`);
  return median / n;
}

/** One line with a path's per-item times and growth ratio, for the test report. */
function growthSummary(path: string): string {
  const small = perItemMs(path, 1_000);
  const large = perItemMs(path, 10_000);
  return `${path}: ${(small * 1_000).toFixed(2)} us/item at 1K, ${(large * 1_000).toFixed(2)} us/item at 10K, ratio ${(large / small).toFixed(2)}x (budget ${GROWTH_FACTOR}x)`;
}

/**
 * Checks the growth of `paths` from 1K to 10K items against `factor`; returns one message per path
 * that exceeds it (empty when all stay within). Each message names the path, N, both per-item times
 * and the factor.
 */
function growthViolations(paths: readonly string[], factor: number): string[] {
  return paths.flatMap((path) => {
    const small = perItemMs(path, 1_000);
    const large = perItemMs(path, 10_000);
    const ratio = large / small;
    return ratio > factor
      ? [
          `${path}: per-item time ${(large * 1_000).toFixed(2)} us at N=10000 is ${ratio.toFixed(1)}x ` +
            `the ${(small * 1_000).toFixed(2)} us at N=1000, over the budget of ${factor}x`,
        ]
      : [];
  });
}

type Mode = 'register' | 'unregister';

/** A bench of `mode` over `items`, on a machine whose shortcuts bind under shortcutAction: 'select'. */
function machineBench(mode: Mode, items: readonly CommandItem[]) {
  const registerEvents: readonly CommandEvent[] = items.map((item) => ({
    type: 'REGISTER_ITEM',
    item,
  }));
  const unregisterEvents: readonly CommandEvent[] = items.map(({ id }) => ({
    type: 'UNREGISTER_ITEM',
    id,
  }));
  const events = mode === 'register' ? registerEvents : unregisterEvents;
  const target = mode === 'register' ? items.length : 0;

  let machine: CommandMachine | undefined;
  let subscription: Disposable | undefined;
  let reached: PromiseWithResolvers<void> | undefined;

  /** Resolves on the first state emit whose filteredIds holds `count` ids. */
  function awaitCount(count: number): Promise<void> {
    if (!machine) throw new Error('machine fixture missing');
    const done = Promise.withResolvers<void>();
    reached = done;
    subscription?.[Symbol.dispose]();
    subscription = machine.subscribeState((state) => {
      if (state.filteredIds.length === count) done.resolve();
    });
    return done.promise;
  }

  return {
    options: {
      async beforeEach() {
        machine = createCommandMachine({ shortcutAction: 'select' });
        if (mode === 'unregister') {
          // Untimed: fill the machine, wait for the batch to settle, then arm the timed wait for 0
          const filled = awaitCount(items.length);
          for (const event of registerEvents) machine.send(event);
          await filled;
        }
        void awaitCount(target);
      },
      afterEach() {
        subscription?.[Symbol.dispose]();
        machine?.[Symbol.dispose]();
        subscription = machine = reached = undefined;
      },
    },
    async fn(): Promise<void> {
      if (!machine || !reached) throw new Error('machine fixture missing: beforeEach did not run');
      for (const event of events) machine.send(event);
      await reached.promise;
    },
  };
}

/** Runs one bench and records its median latency (ms per iteration) under `path @ N`. */
async function record(
  path: string,
  n: Size,
  run: (name: string) => Promise<{ latency: { p50: number } }>,
): Promise<void> {
  const result = await run(key(path, n));
  RESULTS.set(key(path, n), result.latency.p50);
}

/** The four machine paths the budget covers. */
const PATHS = ['register', 'unregister', 'register + shortcuts', 'unregister + shortcuts'] as const;

const PATH_MODE: Readonly<Record<(typeof PATHS)[number], Mode>> = {
  register: 'register',
  unregister: 'unregister',
  'register + shortcuts': 'register',
  'unregister + shortcuts': 'unregister',
};

/** Items of a path: the 'basic' dataset, plus a distinct shortcut per item on the shortcut paths. */
function itemsFor(path: (typeof PATHS)[number], n: Size): CommandItem[] {
  const items = generateItems(n, 'basic', itemId);
  return path.endsWith('shortcuts')
    ? items.map((item, i) => ({ ...item, shortcut: `Mod+Alt+${i}` }))
    : items;
}

// Vitest 5: `bench` is a fixture factory; .run() resolves to the task result (latency statistics in ms).
for (const n of SIZES) {
  describe(`Registration: ${n} items`, () => {
    for (const path of PATHS) {
      test(`${path} @ ${n}`, async ({ bench }) => {
        const { options, fn } = machineBench(PATH_MODE[path], itemsFor(path, n));
        await record(path, n, (name) => bench(name, options, fn).run());
      });
    }
  });
}

describe('Registration: complexity budget (P33)', () => {
  test('per-item time at 10K stays within the growth factor of 1K', async ({ annotate }) => {
    for (const path of PATHS) await annotate(growthSummary(path));
    const violations = growthViolations(PATHS, GROWTH_FACTOR);
    expect(violations, violations.join(' | ')).toEqual([]);
  });
});

// Self-check of the assertion, not a registry measurement: a deliberately quadratic stand-in (every
// removal rebuilds the whole id list, the shape of the pre-1.6.0 per-send refilter) goes through the
// same recording and the same growthViolations, and must exceed GROWTH_FACTOR, so the budget above is
// shown to turn red on quadratic work in every run.
/** One 10K iteration of the stand-in takes ~0.3 s: five timed iterations (median of five) after one warm-up, no time budget. */
const STAND_IN_RUN = { warmupIterations: 1, warmupTime: 0, iterations: 5, time: 0 } as const;

describe('Registration: self-check, a quadratic stand-in', () => {
  const STAND_IN = 'quadratic stand-in (self-check)';
  for (const n of SIZES) {
    test(`${STAND_IN} @ ${n}`, async ({ bench }) => {
      const ids = generateItems(n, 'basic', itemId).map(({ id }) => id);
      let live: readonly string[] = [];
      await record(STAND_IN, n, (name) =>
        bench(
          name,
          {
            beforeEach() {
              live = [...ids];
            },
          },
          () => {
            for (const id of ids) live = live.filter((other) => other !== id);
          },
        ).run(STAND_IN_RUN),
      );
      expect(live).toHaveLength(0);
    });
  }

  test('the budget flags the quadratic stand-in', async ({ annotate }) => {
    await annotate(growthSummary(STAND_IN));
    const violations = growthViolations([STAND_IN], GROWTH_FACTOR);
    expect(violations, 'the quadratic stand-in stayed within the growth factor').toHaveLength(1);
  });
});
