// benchmarks/browser/stats.ts
// The pure rules of the browser bench (run.ts): the median of the measured runs and the 10K mount
// gate verdict. No I/O, no imports, so tests/unit/bench-compare-rules.test.ts pins them directly.

/** Measured runs per N and metric (after the warm-up): the median of exactly this many samples. */
export const SAMPLE_COUNT = 7;

/**
 * The 10K mount gate is a regression tripwire (D94, 2026-11-08), not the roadmap's exit figure. The
 * 1.6.0 exit gate, "10K mount <= 50 ms on the CI image per the bench" (roadmap
 * docs/plans/2026-10-31-roadmap-1.3-to-2.0.md:276; ruling R5 of the 1.6.0 plan), is met by the median
 * the job recorded on its first run: 47.80 ms (CI run 42455685144, 2026-11-08, release/1.6.0 at
 * 8362840, ubuntu-26.04 image 20261101.186.1, AMD EPYC 7763 at 4 cores, Chromium 158.0.8127.18; the
 * seven samples span 40.70 to 59.70 ms, three above 50). The threshold is that runner's measurement at
 * 1.5x the median, rounded up to the next 5 ms: ceil(47.80 x 1.5 = 71.70 / 5) x 5 = 75 ms. It is
 * re-measured at the RC and never raised silently. Re-measured at the 1.7.0 RC (CI run 42504230690,
 * 2026-11-08, release/1.7.0 at 79e3c14, the same image on an AMD EPYC 9V74 at 4 cores, Chromium
 * 158.0.8127.18): 54.70 ms median, seven samples 47.70 to 65.70 ms, inside the tripwire, recorded
 * as benchmarks/browser/results/1.4.0-79e3c14.json beside the first record. The threshold stands
 * (D120): it moves only when an RC median falls outside the recorded range of the same CPU, or on
 * a new runner image with its own first measurement, never on one sample from a different CPU. An
 * absolute threshold: no relative comparison until CodSpeed at 1.9 (D20).
 */
export const MOUNT_GATE_THRESHOLD_MS = 75;

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
