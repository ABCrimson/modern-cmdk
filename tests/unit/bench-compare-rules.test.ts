// tests/unit/bench-compare-rules.test.ts
// F-02: the bench:compare verdict rules. A sub-microsecond median must not fail the gate on
// run-to-run noise, while the published target_ms stays an absolute contract.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { itemSeeds } from '../../apps/playground/src/bench/dataset.ts';
import {
  GATE_METRIC,
  GATE_N,
  gateVerdict,
  MOUNT_GATE_THRESHOLD_MS,
  median,
  SAMPLE_COUNT,
  summarize,
} from '../../benchmarks/browser/stats.ts';
import { classify } from '../../benchmarks/standalone/compare-rules.ts';

const thresholds = { warning: 0.05, failure: 0.15, floor_ms: 0.01 } as const;

describe('bench:compare classify()', () => {
  it('(a) compares a +0.76 % move on a millisecond benchmark and passes', () => {
    const r = classify({ baseline_ms: 3.4618, current_ms: 3.488, target_ms: 16, thresholds });
    expect(r.status).toBe('PASS');
    expect(r.reason).toBe('compared');
    expect(r.delta_pct).toBeCloseTo(0.0076, 4);
  });

  it('(b) warns on +6 %', () => {
    const r = classify({ baseline_ms: 1, current_ms: 1.06, target_ms: 16, thresholds });
    expect(r.status).toBe('WARN');
    expect(r.reason).toBe('compared');
  });

  it('(c) fails on +20 %', () => {
    const r = classify({ baseline_ms: 1, current_ms: 1.2, target_ms: 16, thresholds });
    expect(r.status).toBe('FAIL');
    expect(r.reason).toBe('compared');
  });

  it('(d) reports, not compares, a baseline below the floor', () => {
    const r = classify({
      baseline_ms: 0.00075166,
      current_ms: 0.0009,
      target_ms: 1,
      thresholds,
    });
    expect(r.status).toBe('PASS');
    expect(r.reason).toBe('below floor');
    expect(r.delta_pct).toBeCloseTo(0.197, 3);
  });

  it('(e) fails a current median above target_ms even below the floor', () => {
    const r = classify({ baseline_ms: 0.00075166, current_ms: 1.2, target_ms: 1, thresholds });
    expect(r.status).toBe('FAIL');
    expect(r.reason).toBe('above target');
  });

  it('(f) without floor_ms the floor is 0 and the old relative rule applies', () => {
    const r = classify({
      baseline_ms: 0.00075166,
      current_ms: 0.0009,
      target_ms: 1,
      thresholds: { warning: 0.05, failure: 0.15 },
    });
    expect(r.status).toBe('FAIL');
    expect(r.reason).toBe('compared');
  });

  it('(h) the floor tests the baseline median, not the current one', () => {
    const r = classify({ baseline_ms: 0.00075166, current_ms: 0.05, target_ms: 1, thresholds });
    expect(r.status).toBe('PASS');
    expect(r.reason).toBe('below floor');
  });

  it('(g) a baseline exactly equal to floor_ms is compared, not below the floor', () => {
    const r = classify({ baseline_ms: 0.01, current_ms: 0.012, target_ms: 1, thresholds });
    expect(r.status).toBe('FAIL');
    expect(r.reason).toBe('compared');
  });

  it('(i) a baseline below the floor without a target_ms is a harness error naming the baseline.json key', () => {
    expect(() =>
      classify({
        key: 'search:ts-scorer-10k',
        baseline_ms: 0.00075166,
        current_ms: 0.0009,
        thresholds,
      }),
    ).toThrow(/^search:ts-scorer-10k: baseline median .* no target_ms/);
  });

  it('(j) without a key the harness error is still thrown, unprefixed', () => {
    expect(() => classify({ baseline_ms: 0.00075166, current_ms: 0.0009, thresholds })).toThrow(
      /^baseline median .* no target_ms/,
    );
  });
});

// TEB-33: benchmarks/baseline.json was recorded on the 'basic' 10K dataset. This literal is the sha256
// of that dataset's JSON, computed from the generator compare-baseline.ts had before the shared
// dataset replaced it. Change the dataset and the recorded baseline stops describing what is measured:
// re-record baseline.json and update the literal in the same change.
describe('TEB-33: the shared dataset is the one benchmarks/baseline.json was recorded on', () => {
  it("itemSeeds(10_000, 'basic') hashes to the baseline's recorded dataset", () => {
    const hash = createHash('sha256')
      .update(JSON.stringify(itemSeeds(10_000, 'basic')))
      .digest('hex');
    expect(hash).toBe('1a425a65e961e300a33be57eb4d03e3df31db69625fb04c5e5a02d9fad6cfacc');
  });
});

// R5: the browser bench's pure rules (benchmarks/browser/stats.ts). The 1.6.0 exit gate is "10K mount
// <= 50 ms on the CI image per the bench"; the run fails above it and the threshold is never loosened.
describe('R5: the browser bench stats and the 10K mount gate', () => {
  it('R5: the median of 7 odd samples is the middle one, whatever the order', () => {
    expect(median([9, 1, 7, 3, 5, 100, 0.5])).toBe(5);
    expect(summarize([7, 6, 5, 4, 3, 2, 1])).toEqual({
      median: 4,
      min: 1,
      max: 7,
      samples: [7, 6, 5, 4, 3, 2, 1],
    });
  });

  it.each([0, 1, 6, 8])('R5: rejects a sample count of %i (exactly 7 are measured)', (count) => {
    expect(() => median(Array.from({ length: count }, (_, i) => i + 1))).toThrow(
      new RegExp(`exactly ${SAMPLE_COUNT} samples, got ${count}`),
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'R5: rejects a non-finite sample (%s)',
    (bad) => {
      expect(() => median([1, 2, 3, bad, 5, 6, 7])).toThrow(/sample 3 is not a finite number/);
    },
  );

  it('R5: the gate threshold is the roadmap exit gate, 50 ms on the 10K mount', () => {
    expect(MOUNT_GATE_THRESHOLD_MS).toBe(50);
    expect(GATE_METRIC).toBe('mount');
    expect(GATE_N).toBe(10_000);
  });

  it('R5: the gate passes at exactly 50 ms', () => {
    const v = gateVerdict('mount', 10_000, 50);
    expect(v.verdict).toBe('pass');
    expect(v.median_ms).toBe(50);
    expect(v.threshold_ms).toBe(50);
  });

  it('R5: the gate fails at 50.01 ms and the verdict names the metric and N', () => {
    const v = gateVerdict('mount', 10_000, 50.01);
    expect(v.verdict).toBe('fail');
    expect(v.metric).toBe('mount');
    expect(v.n).toBe(10_000);
    expect(v.message).toContain('mount');
    expect(v.message).toContain('10000');
    expect(v.message).toContain('50.01');
  });

  it('R5: a non-finite median is a harness error, never a verdict', () => {
    expect(() => gateVerdict('mount', 10_000, Number.NaN)).toThrow(/finite/);
  });
});
