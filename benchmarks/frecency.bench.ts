import type { FrecencyRecord, ItemId } from '@crimson_dev/command';
import {
  computeFrecencyBonus,
  FrecencyEngine,
  itemId,
  MemoryFrecencyStorage,
} from '@crimson_dev/command';
import { bench, describe } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = Temporal.Now.instant();

function makeRecord(hoursAgo: number, frequency: number): FrecencyRecord {
  const minutes = Math.round(hoursAgo * 60);
  const past = NOW.subtract(Temporal.Duration.from({ minutes }));
  return { lastUsed: past, frequency };
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

// ---------------------------------------------------------------------------
// 1. computeFrecencyBonus — pure function performance
// ---------------------------------------------------------------------------

describe('computeFrecencyBonus — Pure Function', () => {
  const recentRecord = makeRecord(0.5, 10);
  const dayRecord = makeRecord(12, 5);
  const weekRecord = makeRecord(100, 3);
  const monthRecord = makeRecord(500, 2);
  const oldRecord = makeRecord(2000, 1);

  bench('recent (< 1 hour)', () => {
    computeFrecencyBonus(recentRecord, NOW);
  });

  bench('day-old', () => {
    computeFrecencyBonus(dayRecord, NOW);
  });

  bench('week-old', () => {
    computeFrecencyBonus(weekRecord, NOW);
  });

  bench('month-old', () => {
    computeFrecencyBonus(monthRecord, NOW);
  });

  bench('old (> 30 days)', () => {
    computeFrecencyBonus(oldRecord, NOW);
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

  bench('single getBonus lookup', () => {
    engine.getBonus(ids[5000] as ItemId);
  });

  bench('100 sequential getBonus lookups', () => {
    for (let i = 0; i < 100; i++) {
      engine.getBonus(ids[i * 100] as ItemId);
    }
  });

  bench('getAllBonuses (10K items)', () => {
    engine.getAllBonuses(NOW);
  });
});

// ---------------------------------------------------------------------------
// 3. FrecencyEngine.recordSelection throughput
// ---------------------------------------------------------------------------

describe('FrecencyEngine — Record Selection', () => {
  bench('100 selections', () => {
    using engine = new FrecencyEngine({ storage: new MemoryFrecencyStorage() });
    for (let i = 0; i < 100; i++) {
      engine.recordSelection(itemId(`item-${i}`));
    }
  });

  bench('1K selections', () => {
    using engine = new FrecencyEngine({ storage: new MemoryFrecencyStorage() });
    for (let i = 0; i < 1_000; i++) {
      engine.recordSelection(itemId(`item-${i}`));
    }
  });

  bench('10K selections (rapid typing simulation)', () => {
    using engine = new FrecencyEngine({ storage: new MemoryFrecencyStorage() });
    for (let i = 0; i < 10_000; i++) {
      engine.recordSelection(itemId(`item-${i % 500}`));
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Full pipeline: engine create + record + getAllBonuses
// ---------------------------------------------------------------------------

describe('FrecencyEngine — Full Pipeline', () => {
  bench('create + 100 records + getAllBonuses', () => {
    using engine = new FrecencyEngine({ storage: new MemoryFrecencyStorage() });
    for (let i = 0; i < 100; i++) {
      engine.recordSelection(itemId(`item-${i}`));
    }
    engine.getAllBonuses();
  });

  bench('create + 1K records + getAllBonuses', () => {
    using engine = new FrecencyEngine({ storage: new MemoryFrecencyStorage() });
    for (let i = 0; i < 1_000; i++) {
      engine.recordSelection(itemId(`item-${i}`));
    }
    engine.getAllBonuses();
  });
});
