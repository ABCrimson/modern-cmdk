import { itemId } from 'modern-cmdk';
import { describe, expect, it } from 'vitest';
import { FRECENCY_FIXTURE_COUNT, generateFrecencyRecords } from '../fixtures/frecency/generate.ts';

const DEFAULT_NOW = Date.UTC(2026, 10, 1);
const HOUR = 3_600_000;

describe('R6 fixture: seeded frecency record generator', () => {
  it('R6 fixture: the same seed gives deep-equal maps', () => {
    const a = generateFrecencyRecords(500, { seed: 7, now: 1_000_000_000_000 });
    const b = generateFrecencyRecords(500, { seed: 7, now: 1_000_000_000_000 });
    expect(a).toEqual(b);
    expect([...a.keys()]).toEqual([...b.keys()]);
  });

  it('R6 fixture: a different seed gives a different map', () => {
    const a = generateFrecencyRecords(500, { seed: 7 });
    const b = generateFrecencyRecords(500, { seed: 8 });
    expect(a).not.toEqual(b);
    expect([...a.keys()]).toEqual([...b.keys()]);
  });

  it('R6 fixture: the default now is a fixed constant, so calls agree', () => {
    const a = generateFrecencyRecords(100);
    const b = generateFrecencyRecords(100);
    expect(a).toEqual(b);
    expect(a).toEqual(generateFrecencyRecords(100, { now: DEFAULT_NOW }));
  });

  it('R6 fixture: the 10K fixture has 10,000 well-formed records', () => {
    const now = Date.now();
    const records = generateFrecencyRecords(FRECENCY_FIXTURE_COUNT, { now });
    expect(FRECENCY_FIXTURE_COUNT).toBe(10_000);
    expect(records.size).toBe(10_000);
    expect(records.has(itemId('item-0'))).toBe(true);
    expect(records.has(itemId('item-9999'))).toBe(true);
    for (const record of records.values()) {
      expect(Number.isInteger(record.frequency)).toBe(true);
      expect(record.frequency).toBeGreaterThanOrEqual(1);
      expect(record.frequency).toBeLessThanOrEqual(50);
      expect(Number.isFinite(record.lastUsed)).toBe(true);
      expect(record.lastUsed).toBeLessThanOrEqual(now);
    }
  });

  it('R6 fixture: every recency bucket of computeFrecencyBonus holds at least 5% of the records', () => {
    const records = generateFrecencyRecords(FRECENCY_FIXTURE_COUNT);
    const buckets = [0, 0, 0, 0, 0];
    for (const { lastUsed } of records.values()) {
      const hours = (DEFAULT_NOW - lastUsed) / HOUR;
      const index = hours < 1 ? 0 : hours < 24 ? 1 : hours < 168 ? 2 : hours < 720 ? 3 : 4;
      buckets[index] = (buckets[index] ?? 0) + 1;
    }
    for (const bucket of buckets) {
      expect(bucket).toBeGreaterThanOrEqual(FRECENCY_FIXTURE_COUNT * 0.05);
    }
  });
});
