import type { FrecencyDecayConfig, FrecencyRecord, ItemId } from 'modern-cmdk';
import {
  computeFrecencyBonus,
  DEFAULT_FRECENCY_DECAY,
  FrecencyEngine,
  itemId,
  MemoryFrecencyStorage,
} from 'modern-cmdk';
import { describe, expect, it } from 'vitest';

describe('computeFrecencyBonus', () => {
  it('should give highest weight to items used within the last hour', () => {
    const now = Date.now();
    const record: FrecencyRecord = {
      frequency: 1,
      lastUsed: now - 30 * 60_000, // 30 minutes ago
    };

    const bonus = computeFrecencyBonus(record, now);
    expect(bonus).toBe(4.0); // hourWeight * frequency
  });

  it('should give day weight for items used 12 hours ago', () => {
    const now = Date.now();
    const record: FrecencyRecord = {
      frequency: 1,
      lastUsed: now - 12 * 3_600_000, // 12 hours ago
    };

    const bonus = computeFrecencyBonus(record, now);
    expect(bonus).toBe(2.0); // dayWeight * frequency
  });

  it('should give week weight for items used 3 days ago', () => {
    const now = Date.now();
    const record: FrecencyRecord = {
      frequency: 1,
      lastUsed: now - 72 * 3_600_000, // 72 hours ago
    };

    const bonus = computeFrecencyBonus(record, now);
    expect(bonus).toBe(1.5); // weekWeight * frequency
  });

  it('should give month weight for items used 2 weeks ago', () => {
    const now = Date.now();
    const record: FrecencyRecord = {
      frequency: 1,
      lastUsed: now - 336 * 3_600_000, // 336 hours ago
    };

    const bonus = computeFrecencyBonus(record, now);
    expect(bonus).toBe(1.0); // monthWeight * frequency
  });

  it('should give older weight for items used more than a month ago', () => {
    const now = Date.now();
    const record: FrecencyRecord = {
      frequency: 1,
      lastUsed: now - 1000 * 3_600_000, // 1000 hours ago
    };

    const bonus = computeFrecencyBonus(record, now);
    expect(bonus).toBe(0.5); // olderWeight * frequency
  });

  it('should multiply by frequency', () => {
    const now = Date.now();
    const record: FrecencyRecord = {
      frequency: 5,
      lastUsed: now - 30 * 60_000, // 30 minutes ago
    };

    const bonus = computeFrecencyBonus(record, now);
    expect(bonus).toBe(20.0); // 4.0 * 5
  });
});

describe('computeFrecencyBonus bucket boundaries', () => {
  const NOW = 1_700_000_000_000;
  const HOUR_MS = 3_600_000;
  const at = (hours: number, offsetMs = 0): FrecencyRecord => ({
    frequency: 1,
    lastUsed: NOW - hours * HOUR_MS + offsetMs,
  });

  // A record used exactly h hours ago is in the NEXT bucket (each comparison is hours < boundary),
  // one millisecond younger it is still in the lower bucket.
  it.for([
    { hours: 1, below: 'hourWeight', above: 'dayWeight' },
    { hours: 24, below: 'dayWeight', above: 'weekWeight' },
    { hours: 168, below: 'weekWeight', above: 'monthWeight' },
    { hours: 720, below: 'monthWeight', above: 'olderWeight' },
  ] as const)(
    'TUB-45: at $hours h a record 1 ms younger gets $below and exactly $hours h or older gets $above',
    ({ hours, below, above }) => {
      expect(computeFrecencyBonus(at(hours, 1), NOW)).toBe(DEFAULT_FRECENCY_DECAY[below]);
      expect(computeFrecencyBonus(at(hours), NOW)).toBe(DEFAULT_FRECENCY_DECAY[above]);
      expect(computeFrecencyBonus(at(hours, -1), NOW)).toBe(DEFAULT_FRECENCY_DECAY[above]);
    },
  );

  it('TUB-45: a partial decay config falls back to the default weight of every bucket it omits', () => {
    const partial: FrecencyDecayConfig = { hourWeight: 10 };
    expect(computeFrecencyBonus(at(0.5), NOW, partial)).toBe(10);
    expect(computeFrecencyBonus(at(12), NOW, partial)).toBe(DEFAULT_FRECENCY_DECAY.dayWeight);
    expect(computeFrecencyBonus(at(100), NOW, partial)).toBe(DEFAULT_FRECENCY_DECAY.weekWeight);
    expect(computeFrecencyBonus(at(400), NOW, partial)).toBe(DEFAULT_FRECENCY_DECAY.monthWeight);
    expect(computeFrecencyBonus(at(1000), NOW, partial)).toBe(DEFAULT_FRECENCY_DECAY.olderWeight);
  });

  const SAMPLES = [
    ['hourWeight', 0.5],
    ['dayWeight', 12],
    ['weekWeight', 100],
    ['monthWeight', 400],
    ['olderWeight', 1000],
  ] as const;

  it.for(SAMPLES)('TUB-45: a config that sets only %s changes only the bucket at %d h', ([key]) => {
    const config: FrecencyDecayConfig = { [key]: 99 };
    const weights = SAMPLES.map(([, hours]) => computeFrecencyBonus(at(hours), NOW, config));
    expect(weights).toEqual(
      SAMPLES.map(([bucket]) => (bucket === key ? 99 : DEFAULT_FRECENCY_DECAY[bucket])),
    );
  });
});

describe('FrecencyEngine', () => {
  it('TUB-23: without a decayConfig getConfig returns the defaults and setConfig changes later bonuses', () => {
    using engine = new FrecencyEngine({});
    const id = itemId('cfg');
    expect(engine.getConfig()).toEqual(DEFAULT_FRECENCY_DECAY);

    engine.recordSelection(id);
    expect(engine.getAllBonuses().get(id)).toBe(DEFAULT_FRECENCY_DECAY.hourWeight);

    engine.setConfig({ hourWeight: 11 });
    expect(engine.getBonus(id)).toBe(11);
    expect(engine.getAllBonuses().get(id)).toBe(11);
    expect(engine.getConfig()).toEqual({ ...DEFAULT_FRECENCY_DECAY, hourWeight: 11 });
  });

  it('TUB-23: load hydrates a fresh engine from custom storage so persisted items get a bonus', async () => {
    const id = itemId('persisted');
    const storage = new MemoryFrecencyStorage();
    storage.save('ns', { records: new Map([[id, { frequency: 3, lastUsed: Date.now() }]]) }); // 3 x hourWeight 4
    using engine = new FrecencyEngine({ storage, namespace: 'ns' });
    expect(engine.getBonus(id)).toBe(0);

    await engine.load();

    expect(engine.getBonus(id)).toBe(12); // frequency 3 x the default hourWeight 4
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
    const records = new Map<ItemId, FrecencyRecord>();
    records.set(itemId('a'), { frequency: 3, lastUsed: Date.now() });

    storage.save('test', { records });
    const loaded = storage.load('test');

    expect(loaded.records.size).toBe(1);
  });

  it('should serialize to JSON using Iterator.prototype.toArray()', () => {
    using storage = new MemoryFrecencyStorage();
    const records = new Map<ItemId, FrecencyRecord>();
    records.set(itemId('a'), { frequency: 1, lastUsed: Date.now() });

    storage.save('test', { records });
    const json = storage.toJSON();

    expect(json.test).toBeDefined();
    expect(json.test?.records.length).toBe(1);
  });
});
