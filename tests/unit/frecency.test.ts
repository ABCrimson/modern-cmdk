import type { FrecencyRecord } from 'modern-cmdk';
import { computeFrecencyBonus, FrecencyEngine, itemId, MemoryFrecencyStorage } from 'modern-cmdk';
import { describe, expect, it } from 'vitest';

describe('computeFrecencyBonus', () => {
  it('should give highest weight to items used within the last hour', () => {
    const now = Temporal.Now.instant();
    const record: FrecencyRecord = {
      frequency: 1,
      lastUsed: now.subtract({ minutes: 30 }),
    };

    const bonus = computeFrecencyBonus(record, now);
    expect(bonus).toBe(4.0); // hourWeight * frequency
  });

  it('should give day weight for items used 12 hours ago', () => {
    const now = Temporal.Now.instant();
    const record: FrecencyRecord = {
      frequency: 1,
      lastUsed: now.subtract({ hours: 12 }),
    };

    const bonus = computeFrecencyBonus(record, now);
    expect(bonus).toBe(2.0); // dayWeight * frequency
  });

  it('should give week weight for items used 3 days ago', () => {
    const now = Temporal.Now.instant();
    const record: FrecencyRecord = {
      frequency: 1,
      lastUsed: now.subtract({ hours: 72 }),
    };

    const bonus = computeFrecencyBonus(record, now);
    expect(bonus).toBe(1.5); // weekWeight * frequency
  });

  it('should give month weight for items used 2 weeks ago', () => {
    const now = Temporal.Now.instant();
    const record: FrecencyRecord = {
      frequency: 1,
      lastUsed: now.subtract({ hours: 336 }),
    };

    const bonus = computeFrecencyBonus(record, now);
    expect(bonus).toBe(1.0); // monthWeight * frequency
  });

  it('should give older weight for items used more than a month ago', () => {
    const now = Temporal.Now.instant();
    const record: FrecencyRecord = {
      frequency: 1,
      lastUsed: now.subtract({ hours: 1000 }),
    };

    const bonus = computeFrecencyBonus(record, now);
    expect(bonus).toBe(0.5); // olderWeight * frequency
  });

  it('should multiply by frequency', () => {
    const now = Temporal.Now.instant();
    const record: FrecencyRecord = {
      frequency: 5,
      lastUsed: now.subtract({ minutes: 30 }),
    };

    const bonus = computeFrecencyBonus(record, now);
    expect(bonus).toBe(20.0); // 4.0 * 5
  });

  it('should support custom decay config', () => {
    const now = Temporal.Now.instant();
    const record: FrecencyRecord = {
      frequency: 1,
      lastUsed: now.subtract({ minutes: 30 }),
    };

    const bonus = computeFrecencyBonus(record, now, { hourWeight: 10.0 });
    expect(bonus).toBe(10.0);
  });
});

describe('FrecencyEngine', () => {
  it('should record selections and compute bonuses', () => {
    using engine = new FrecencyEngine({ enabled: true });
    const id = itemId('test');

    engine.recordSelection(id);
    const bonus = engine.getBonus(id);

    expect(bonus).toBeGreaterThan(0);
  });

  it('should accumulate frequency', () => {
    using engine = new FrecencyEngine({ enabled: true });
    const id = itemId('test');

    engine.recordSelection(id);
    engine.recordSelection(id);
    engine.recordSelection(id);

    const data = engine.getData();
    const record = data.records.get(id);
    expect(record?.frequency).toBe(3);
  });

  it('should return 0 bonus for unrecorded items', () => {
    using engine = new FrecencyEngine({ enabled: true });
    const bonus = engine.getBonus(itemId('unknown'));
    expect(bonus).toBe(0);
  });

  it('should get all bonuses as a map', () => {
    using engine = new FrecencyEngine({ enabled: true });
    engine.recordSelection(itemId('a'));
    engine.recordSelection(itemId('b'));

    const bonuses = engine.getAllBonuses();
    expect(bonuses.size).toBe(2);
    expect(bonuses.has(itemId('a'))).toBe(true);
    expect(bonuses.has(itemId('b'))).toBe(true);
  });
});

describe('MemoryFrecencyStorage', () => {
  it('should load empty data for new namespace', () => {
    using storage = new MemoryFrecencyStorage();
    const data = storage.load('test');

    expect(data.records.size).toBe(0);
  });

  it('should persist and reload data', () => {
    using storage = new MemoryFrecencyStorage();
    const records = new Map();
    records.set(itemId('a'), { frequency: 3, lastUsed: Temporal.Now.instant() });

    storage.save('test', { records });
    const loaded = storage.load('test');

    expect(loaded.records.size).toBe(1);
  });

  it('should serialize to JSON using Iterator.prototype.toArray()', () => {
    using storage = new MemoryFrecencyStorage();
    const records = new Map();
    records.set(itemId('a'), { frequency: 1, lastUsed: Temporal.Now.instant() });

    storage.save('test', { records });
    const json = storage.toJSON();

    expect(json.test).toBeDefined();
    expect(json.test?.records.length).toBe(1);
  });
});
