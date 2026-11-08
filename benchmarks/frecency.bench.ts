import type { FrecencyRecord, ItemId } from 'modern-cmdk';
import { computeFrecencyBonus, FrecencyEngine, itemId, MemoryFrecencyStorage } from 'modern-cmdk';
import { beforeAll, describe, test } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = Date.now();

function makeRecord(hoursAgo: number, frequency: number): FrecencyRecord {
  const msAgo = hoursAgo * 3_600_000;
  return { lastUsed: NOW - msAgo, frequency };
}

// ES2025 Iterator Helpers — generate frecency records via iterator pipeline. The ages spread over every
// decay bucket of computeFrecencyBonus: with (i * 7) % 2000 hours, 10K records land 5 under an hour, 115
// under a day, 720 under a week, 2760 under a month and 6400 older.
function generateRecords(count: number): Map<ItemId, FrecencyRecord> {
  return new Map(
    Iterator.from({
      [Symbol.iterator]: function* () {
        for (let i = 0; i < count; i++) yield i;
      },
    })
      .map((i): [ItemId, FrecencyRecord] => [
        itemId(`item-${i}`),
        makeRecord((i * 7) % 2000, (i % 20) + 1),
      ])
      .toArray(),
  );
}

// Vitest 5 — `bench` is a fixture factory; .run() executes/measures the task.

// ---------------------------------------------------------------------------
// 1. computeFrecencyBonus — pure function performance
// ---------------------------------------------------------------------------

describe('computeFrecencyBonus — Pure Function', () => {
  const recentRecord = makeRecord(0.5, 10);
  const dayRecord = makeRecord(12, 5);
  const weekRecord = makeRecord(100, 3);
  const monthRecord = makeRecord(500, 2);
  const oldRecord = makeRecord(2000, 1);

  test('recent (< 1 hour)', async ({ bench }) => {
    await bench('recent (< 1 hour)', () => {
      computeFrecencyBonus(recentRecord, NOW);
    }).run();
  });

  test('day-old', async ({ bench }) => {
    await bench('day-old', () => {
      computeFrecencyBonus(dayRecord, NOW);
    }).run();
  });

  test('week-old', async ({ bench }) => {
    await bench('week-old', () => {
      computeFrecencyBonus(weekRecord, NOW);
    }).run();
  });

  test('month-old', async ({ bench }) => {
    await bench('month-old', () => {
      computeFrecencyBonus(monthRecord, NOW);
    }).run();
  });

  test('old (> 30 days)', async ({ bench }) => {
    await bench('old (> 30 days)', () => {
      computeFrecencyBonus(oldRecord, NOW);
    }).run();
  });
});

// ---------------------------------------------------------------------------
// 2. FrecencyEngine.getBonus — instance method
// ---------------------------------------------------------------------------

describe('FrecencyEngine.getBonus — 10K Records', () => {
  // TEB-21: the engine is seeded through storage, not recordSelection (which stamps Date.now() and
  // would put all 10K records in the under-an-hour bucket, so getAllBonuses would time one decay
  // branch). The seeded storage holds generateRecords(10_000); load() hydrates the engine from it.
  // beforeAll runs before any bench of this describe (describe callbacks stay synchronous).
  const records = generateRecords(10_000);
  const ids = [...records.keys()];
  const storage = new MemoryFrecencyStorage();
  storage.save('default', { records });
  const engine = new FrecencyEngine({ enabled: true, storage });

  beforeAll(async () => {
    await engine.load();
  });

  test('single getBonus lookup', async ({ bench }) => {
    await bench('single getBonus lookup', () => {
      engine.getBonus(ids[5000] as ItemId);
    }).run();
  });

  test('100 sequential getBonus lookups', async ({ bench }) => {
    await bench('100 sequential getBonus lookups', () => {
      for (let i = 0; i < 100; i++) {
        engine.getBonus(ids[i * 100] as ItemId);
      }
    }).run();
  });

  test('getAllBonuses (10K items)', async ({ bench }) => {
    await bench('getAllBonuses (10K items)', () => {
      engine.getAllBonuses(NOW);
    }).run();
  });
});

// ---------------------------------------------------------------------------
// 3. FrecencyEngine.recordSelection throughput
// ---------------------------------------------------------------------------

describe('FrecencyEngine — Record Selection', () => {
  // A fresh engine per iteration is created in beforeEach and disposed in afterEach (which awaits
  // the pending save before the storage is cleared), so only the recordSelection loop is timed.
  let engine: FrecencyEngine | undefined;
  const ids = Array.from({ length: 10_000 }, (_, i) => itemId(`item-${i}`));

  const recordBench = (count: number, modulo = count) => ({
    options: {
      beforeEach() {
        engine = new FrecencyEngine({ enabled: true, storage: new MemoryFrecencyStorage() });
      },
      async afterEach() {
        await engine?.[Symbol.asyncDispose]();
        engine = undefined;
      },
    },
    fn: (): void => {
      if (!engine) throw new Error('engine fixture missing: beforeEach did not run');
      for (let i = 0; i < count; i++) {
        engine.recordSelection(ids[i % modulo] as ItemId);
      }
    },
  });

  test('100 selections', async ({ bench }) => {
    const { options, fn } = recordBench(100);
    await bench('100 selections', options, fn).run();
  });

  test('1K selections', async ({ bench }) => {
    const { options, fn } = recordBench(1_000);
    await bench('1K selections', options, fn).run();
  });

  test('10K selections (rapid typing simulation)', async ({ bench }) => {
    const { options, fn } = recordBench(10_000, 500);
    await bench('10K selections (rapid typing simulation)', options, fn).run();
  });
});

// ---------------------------------------------------------------------------
// 4. Full pipeline: engine create + record + getAllBonuses
// ---------------------------------------------------------------------------

describe('FrecencyEngine — Full Pipeline', () => {
  test('create + 100 records + getAllBonuses', async ({ bench }) => {
    await bench('create + 100 records + getAllBonuses', () => {
      using engine = new FrecencyEngine({ enabled: true, storage: new MemoryFrecencyStorage() });
      for (let i = 0; i < 100; i++) {
        engine.recordSelection(itemId(`item-${i}`));
      }
      engine.getAllBonuses(NOW);
    }).run();
  });

  test('create + 1K records + getAllBonuses', async ({ bench }) => {
    await bench('create + 1K records + getAllBonuses', () => {
      using engine = new FrecencyEngine({ enabled: true, storage: new MemoryFrecencyStorage() });
      for (let i = 0; i < 1_000; i++) {
        engine.recordSelection(itemId(`item-${i}`));
      }
      engine.getAllBonuses(NOW);
    }).run();
  });
});
