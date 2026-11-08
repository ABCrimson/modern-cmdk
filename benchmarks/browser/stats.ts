// benchmarks/browser/stats.ts
// The pure rules of the browser bench (run.ts): the median of the measured runs and the 10K mount
// gate verdict. No I/O, no imports, so tests/unit/bench-compare-rules.test.ts pins them directly.

/** Measured runs per N and metric (after the warm-up): the median of exactly this many samples. */
export const SAMPLE_COUNT = 7;

/**
 * The 1.6.0 exit gate: "10K mount <= 50 ms on the CI image per the bench" (roadmap
 * docs/plans/2026-10-31-roadmap-1.3-to-2.0.md:276; ruling R5 of the 1.6.0 plan). An absolute
 * threshold: no relative comparison until CodSpeed at 1.9 (D20). It is never loosened to make a run
 * pass; the gate is expected to fail on a tree without the batched refilter.
 */
export const MOUNT_GATE_THRESHOLD_MS = 50;

/** The gated metric and size. */
export const GATE_METRIC = 'mount';
export const GATE_N = 10_000;

export interface Summary {
  readonly median: number;
  readonly min: number;
  readonly max: number;
  /** The samples in run order. */
  readonly samples: readonly number[];
}

export interface GateVerdict {
  readonly metric: string;
  readonly n: number;
  readonly threshold_ms: number;
  readonly median_ms: number;
  readonly verdict: 'pass' | 'fail';
  readonly message: string;
}

function checked(samples: readonly number[]): readonly number[] {
  if (samples.length !== SAMPLE_COUNT) {
    throw new Error(`expected exactly ${SAMPLE_COUNT} samples, got ${samples.length}`);
  }
  samples.forEach((sample, index) => {
    if (!Number.isFinite(sample)) {
      throw new Error(`sample ${index} is not a finite number: ${sample}`);
    }
  });
  return samples;
}

/** Median of exactly 7 finite samples (odd count: the middle one once sorted). */
export function median(samples: readonly number[]): number {
  const sorted = checked(samples).toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

export function summarize(samples: readonly number[]): Summary {
  const sorted = checked(samples).toSorted((a, b) => a - b);
  return {
    median: median(samples),
    min: sorted[0] as number,
    max: sorted.at(-1) as number,
    samples: [...samples],
  };
}

/** Pass at or below the threshold, fail above it. */
export function gateVerdict(
  metric: string,
  n: number,
  median_ms: number,
  threshold_ms: number = MOUNT_GATE_THRESHOLD_MS,
): GateVerdict {
  if (!Number.isFinite(median_ms)) {
    throw new Error(`${metric} N=${n}: the median must be finite, got ${median_ms}`);
  }
  const verdict = median_ms <= threshold_ms ? 'pass' : 'fail';
  const relation = verdict === 'pass' ? '<=' : '>';
  return {
    metric,
    n,
    threshold_ms,
    median_ms,
    verdict,
    message: `gate ${verdict.toUpperCase()}: ${metric} N=${n} median ${median_ms.toFixed(2)} ms ${relation} ${threshold_ms} ms`,
  };
}
