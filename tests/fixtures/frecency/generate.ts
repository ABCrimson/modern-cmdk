// tests/fixtures/frecency/generate.ts
// The 10K-record frecency fixture of 1.6.0: the records that the frecency bench
// (benchmarks/frecency.bench.ts, cluster BENCH, TEB-21) is meant to load into a FrecencyEngine and
// that tests/unit/frecency-machine.test.ts loads for the IDB round trip.
// It is a deterministic generator (seeded PRNG) and not a committed 10K-row JSON (ruling R6):
// the same (count, seed, now) always gives the same Map, and the repository carries
// a short generator instead of a megabyte of data.
// Ledger rows it serves: TEB-21 (bench seeding, cluster BENCH) and DG-63, TUB-24, CE-31 (the IDB round trip).

import type { FrecencyRecord, ItemId } from 'modern-cmdk';
import { itemId } from 'modern-cmdk';

/** The record count of the 10K fixture. */
export const FRECENCY_FIXTURE_COUNT = 10_000;

/** Fixed default seed: any change to it changes every default fixture. */
const DEFAULT_SEED = 0x5eed_c0de;

/** Fixed default clock (2026-11-01T00:00:00Z): callers pass Date.now() for wall-clock records. */
const DEFAULT_NOW = Date.UTC(2026, 10, 1);

const MS_PER_HOUR = 3_600_000;

/**
 * The recency buckets of computeFrecencyBonus (packages/modern-cmdk/src/core/frecency/index.ts),
 * as [from, to) hour ranges; the last one is capped at 2000 h.
 */
const BUCKETS: readonly (readonly [from: number, to: number])[] = [
  [0, 1],
  [1, 24],
  [24, 168],
  [168, 720],
  [720, 2000],
];

/** mulberry32: a 32-bit seeded PRNG returning floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Generates `count` frecency records keyed `item-0` .. `item-<count-1>`: frequency is an integer
 * in 1..50, and lastUsed lies in a recency bucket picked uniformly (< 1 h, < 24 h, < 168 h,
 * < 720 h, older up to 2000 h) at a uniform offset inside it.
 */
export function generateFrecencyRecords(
  count: number,
  options: { readonly seed?: number; readonly now?: number } = {},
): Map<ItemId, FrecencyRecord> {
  const { seed = DEFAULT_SEED, now = DEFAULT_NOW } = options;
  const random = mulberry32(seed);
  const records = new Map<ItemId, FrecencyRecord>();
  for (let i = 0; i < count; i++) {
    const [from, to] = BUCKETS[Math.floor(random() * BUCKETS.length)] ?? BUCKETS[0] ?? [0, 1];
    const hours = from + random() * (to - from);
    const frequency = 1 + Math.floor(random() * 50);
    records.set(itemId(`item-${i}`), { frequency, lastUsed: now - hours * MS_PER_HOUR });
  }
  return records;
}
