// benchmarks/standalone/compare-rules.ts
// The verdict rules of `pnpm bench:compare`, kept pure so tests/unit/bench-compare-rules.test.ts can
// pin them. Order: (1) a current median above the entry's target_ms (the absolute contract the
// README publishes) is FAIL; (2) a baseline median below thresholds.floor_ms is reported, not compared,
// because run-to-run noise at that scale exceeds the relative thresholds, and it must carry a target_ms,
// the only check left for it (a below-floor entry without one is a harness error); (3) otherwise the
// relative delta against the baseline decides: above `failure` FAIL, above `warning` WARN, else PASS.
// Imported by compare-baseline.ts under Node's native type stripping, hence the `.ts` extension.

export interface Thresholds {
  /** Relative regression above which the verdict is WARN (0.05 = 5 %). */
  readonly warning: number;
  /** Relative regression above which the verdict is FAIL (0.15 = 15 %). */
  readonly failure: number;
  /** Baseline medians below this many ms are reported, not compared. Absent means 0: always compared. */
  readonly floor_ms?: number;
}

export interface ClassifyInput {
  readonly baseline_ms: number;
  readonly current_ms: number;
  /** The published absolute target; absent means the entry has none. */
  readonly target_ms?: number | undefined;
  readonly thresholds: Thresholds;
}

export type Verdict = 'PASS' | 'WARN' | 'FAIL';
export type Reason = 'compared' | 'below floor' | 'above target';

export interface Classification {
  readonly status: Verdict;
  /** (current - baseline) / baseline as a fraction, always computed. */
  readonly delta_pct: number;
  readonly reason: Reason;
}

export function classify(input: ClassifyInput): Classification {
  const { baseline_ms, current_ms, target_ms, thresholds } = input;
  const delta_pct = (current_ms - baseline_ms) / baseline_ms;
  if (target_ms !== undefined && current_ms > target_ms) {
    return { status: 'FAIL', delta_pct, reason: 'above target' };
  }
  if (baseline_ms < (thresholds.floor_ms ?? 0)) {
    if (target_ms === undefined) {
      throw new Error(
        `baseline median ${baseline_ms} ms is below floor_ms but has no target_ms: nothing would check it`,
      );
    }
    return { status: 'PASS', delta_pct, reason: 'below floor' };
  }
  if (delta_pct > thresholds.failure) return { status: 'FAIL', delta_pct, reason: 'compared' };
  if (delta_pct > thresholds.warning) return { status: 'WARN', delta_pct, reason: 'compared' };
  return { status: 'PASS', delta_pct, reason: 'compared' };
}
