import type { FrecencyRecord, ItemId } from 'modern-cmdk';
import { computeFrecencyBonus, FrecencyEngine, itemId, MemoryFrecencyStorage } from 'modern-cmdk';
import { describe, test } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = Date.now();

function makeRecord(hoursAgo: number, frequency: number): FrecencyRecord {
  const msAgo = hoursAgo * 3_600_000;
  return { lastUsed: NOW - msAgo, frequency };
}

// ES2026 Iterator Helpers — generate frecency records via iterator pipeline
function _generateRecords(count: number): Map<ItemId, FrecencyRecord> {
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
  const engine = new FrecencyEngine({ storage: new MemoryFrecencyStorage() });

  // Populate engine with 10K records
  const ids: ItemId[] = [];
  for (let i = 0; i < 10_000; i++) {
    const id = itemId(`item-${i}`);
    ids.push(id);
    for (let j = 0; j < (i % 5) + 1; j++) {
      engine.recordSelection(id);
    }
  }

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
  test('100 selections', async ({ bench }) => {
    await bench('100 selections', () => {
      using engine = new FrecencyEngine({ storage: new MemoryFrecencyStorage() });
      for (let i = 0; i < 100; i++) {
        engine.recordSelection(itemId(`item-${i}`));
      }
    }).run();
  });

  test('1K selections', async ({ bench }) => {
    await bench('1K selections', () => {
      using engine = new FrecencyEngine({ storage: new MemoryFrecencyStorage() });
      for (let i = 0; i < 1_000; i++) {
        engine.recordSelection(itemId(`item-${i}`));
      }
    }).run();
  });

  test('10K selections (rapid typing simulation)', async ({ bench }) => {
    await bench('10K selections (rapid typing simulation)', () => {
      using engine = new FrecencyEngine({ storage: new MemoryFrecencyStorage() });
      for (let i = 0; i < 10_000; i++) {
        engine.recordSelection(itemId(`item-${i % 500}`));
      }
    }).run();
  });
});

// ---------------------------------------------------------------------------
// 4. Full pipeline: engine create + record + getAllBonuses
// ---------------------------------------------------------------------------

describe('FrecencyEngine — Full Pipeline', () => {
  test('create + 100 records + getAllBonuses', async ({ bench }) => {
    await bench('create + 100 records + getAllBonuses', () => {
      using engine = new FrecencyEngine({ storage: new MemoryFrecencyStorage() });
      for (let i = 0; i < 100; i++) {
        engine.recordSelection(itemId(`item-${i}`));
      }
      engine.getAllBonuses(NOW);
    }).run();
  });

  test('create + 1K records + getAllBonuses', async ({ bench }) => {
    await bench('create + 1K records + getAllBonuses', () => {
      using engine = new FrecencyEngine({ storage: new MemoryFrecencyStorage() });
      for (let i = 0; i < 1_000; i++) {
        engine.recordSelection(itemId(`item-${i}`));
      }
      engine.getAllBonuses(NOW);
    }).run();
  });
});
