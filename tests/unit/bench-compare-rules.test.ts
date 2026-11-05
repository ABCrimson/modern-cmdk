// tests/unit/bench-compare-rules.test.ts
// F-02: the bench:compare verdict rules. A sub-microsecond median must not fail the gate on
// run-to-run noise, while the published target_ms stays an absolute contract.

import { describe, expect, it } from 'vitest';
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
