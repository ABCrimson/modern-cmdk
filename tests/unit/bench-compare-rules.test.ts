// tests/unit/bench-compare-rules.test.ts
// F-02: the bench:compare verdict rules. A sub-microsecond median must not fail the gate on
// run-to-run noise, while the published target_ms stays an absolute contract.
// TEB-33: the 'basic' 10K dataset behind benchmarks/baseline.json is pinned by hash.
// R5: the browser bench's pure stats and 10K mount gate rules, the /bench page settle rule, and the
// harness refusing a diagnostic run without --out.
// P33: the bench:compare harness proves its own verdicts end to end on fixed fixtures.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { itemId } from 'modern-cmdk';
import { describe, expect, it } from 'vitest';
import {
  SETTLE_START,
  type SettleObservation,
  type SettleProgress,
  settleStep,
} from '../../apps/playground/src/bench/recorder.ts';
import {
  GATE_METRIC,
  GATE_N,
  gateVerdict,
  MOUNT_GATE_THRESHOLD_MS,
  median,
  SAMPLE_COUNT,
  summarize,
} from '../../benchmarks/browser/stats.ts';
import { generateItems } from '../../benchmarks/fixtures.ts';
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
// dataset replaced it. It hashes generateItems (what compare-baseline.ts measures), not the seeds, so a
// change in benchmarks/fixtures.ts is caught too. Change the dataset and the recorded baseline stops describing what is measured:
// re-record baseline.json and update the literal in the same change.
describe('TEB-33: the shared dataset is the one benchmarks/baseline.json was recorded on', () => {
  it("generateItems(10_000, 'basic', itemId) hashes to the baseline's recorded dataset", () => {
    const hash = createHash('sha256')
      .update(JSON.stringify(generateItems(10_000, 'basic', itemId)))
      .digest('hex');
    expect(hash).toBe('1a425a65e961e300a33be57eb4d03e3df31db69625fb04c5e5a02d9fad6cfacc');
  });
});

// R5: the browser bench's pure rules (benchmarks/browser/stats.ts). The 1.6.0 exit gate, "10K mount
// <= 50 ms on the CI image per the bench", is met by the CI run's recorded median (47.80 ms, run
// 42455685144, 2026-11-08); the job's threshold is a 75 ms regression tripwire (D94), never raised silently.
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

  it('R5: the gate threshold is the D94 tripwire: 1.5x the 47.80 ms CI median, rounded up to 5 ms', () => {
    expect(MOUNT_GATE_THRESHOLD_MS).toBe(Math.ceil((47.8 * 1.5) / 5) * 5);
    expect(MOUNT_GATE_THRESHOLD_MS).toBe(75);
    expect(GATE_METRIC).toBe('mount');
    expect(GATE_N).toBe(10_000);
  });

  it('R5: the gate passes at exactly the threshold, 75 ms', () => {
    const v = gateVerdict('mount', 10_000, 75);
    expect(v.verdict).toBe('pass');
    expect(v.median_ms).toBe(75);
    expect(v.threshold_ms).toBe(75);
  });

  it('R5: the gate fails at 75.01 ms and the verdict names the metric and N', () => {
    const v = gateVerdict('mount', 10_000, 75.01);
    expect(v.verdict).toBe('fail');
    expect(v.metric).toBe('mount');
    expect(v.n).toBe(10_000);
    expect(v.message).toContain('mount');
    expect(v.message).toContain('10000');
    expect(v.message).toContain('75.01');
  });

  it('R5: a non-finite median is a harness error, never a verdict', () => {
    expect(() => gateVerdict('mount', 10_000, Number.NaN)).toThrow(/finite/);
  });
});

// R5: when the /bench page calls the mount settled. After the all-N emit the list remounts its items
// (N unregisters and N registers); the machine answers them with one emit per send (unbatched) or with
// one emit per batch (CORE's batched refilter, R8(f)). The rule must not depend on that ratio.
describe('R5: the /bench page settle rule', () => {
  /** Drive settleStep over per-frame observations; the 1-based frame it settles on, or null. */
  function settlesAt(frames: readonly SettleObservation[]): number | null {
    let progress: SettleProgress = SETTLE_START;
    for (const [index, observation] of frames.entries()) {
      const step = settleStep(progress, observation);
      if (step.settled) return index + 1;
      progress = step;
    }
    return null;
  }

  it('R5: settles two quiet frames after one emit per send (unbatched machine)', () => {
    // Frame 1 sees the 2000 remount sends before the machine ticked; the tick answers each with an emit
    expect(
      settlesAt([
        { sends: 2000, emittedSinceLastSend: false },
        { sends: 2000, emittedSinceLastSend: true },
        { sends: 2000, emittedSinceLastSend: true },
      ]),
    ).toBe(3);
  });

  it('R5: settles the same way after ONE emit for the whole batch (batched machine)', () => {
    // One emit answers all 20000 sends: the emit count is 1, not 20000, and the page must still settle
    expect(
      settlesAt([
        { sends: 20_000, emittedSinceLastSend: false },
        { sends: 20_000, emittedSinceLastSend: true },
        { sends: 20_000, emittedSinceLastSend: true },
      ]),
    ).toBe(3);
  });

  it('R5: does not settle while a send is unanswered, however long it waits', () => {
    expect(
      settlesAt(Array.from({ length: 50 }, () => ({ sends: 7, emittedSinceLastSend: false }))),
    ).toBeNull();
  });

  it('R5: a new send restarts the quiet count', () => {
    expect(
      settlesAt([
        { sends: 5, emittedSinceLastSend: true },
        { sends: 5, emittedSinceLastSend: true },
        { sends: 9, emittedSinceLastSend: true },
        { sends: 9, emittedSinceLastSend: true },
        { sends: 9, emittedSinceLastSend: true },
      ]),
    ).toBe(5);
  });

  it('R5: a page with no sends after the mount settles on the all-N emit alone', () => {
    expect(
      settlesAt([
        { sends: 0, emittedSinceLastSend: true },
        { sends: 0, emittedSinceLastSend: true },
        { sends: 0, emittedSinceLastSend: true },
      ]),
    ).toBe(3);
  });
});

// R5: a diagnostic run on another tree's core must never take this tree's results name.
describe('R5: the browser bench harness refuses a diagnostic run without --out', () => {
  it('R5: --modern-cmdk without --out exits 2 with a message, before any build starts', () => {
    const run = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, '../../benchmarks/browser/run.ts'), '--modern-cmdk', 'x'],
      { encoding: 'utf-8', timeout: 60_000 },
    );
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('--modern-cmdk needs --out');
    expect(run.stderr).toContain('never take this tree');
    expect(run.stdout).not.toContain('building the playground');
  });
});

// P33: pnpm bench:compare is the CI bench gate, so its pipeline after the measurement (baseline,
// comparison, table, exit code) is run end to end on fixed medians: `--baseline <file> --current <file>`
// skips the live measurement. The fixtures live in benchmarks/standalone/fixtures/; each carries a
// `proves` field saying what it is for.
describe('P33: bench:compare proves its own verdicts on fixed fixtures', () => {
  const fixtures = resolve(import.meta.dirname, '../../benchmarks/standalone/fixtures');
  const harness = resolve(import.meta.dirname, '../../benchmarks/standalone/compare-baseline.ts');

  /** Runs the real harness (no shell, Node's type stripping) on fixture files, never on a live measurement. */
  function compare(args: readonly string[]): {
    status: number | null;
    stdout: string;
    stderr: string;
  } {
    const run = spawnSync(process.execPath, [harness, ...args], {
      encoding: 'utf-8',
      timeout: 30_000,
    });
    return { status: run.status, stdout: run.stdout, stderr: run.stderr };
  }
  const withFixtures = (current: string, baseline = 'baseline.json'): string[] => [
    '--baseline',
    resolve(fixtures, baseline),
    '--current',
    resolve(fixtures, current),
  ];

  it('P33: a current equal to the baseline exits 0 with every row PASS', () => {
    const run = compare(withFixtures('current-equal.json'));
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/stateUpdate:searchChange\s+\|.*\|\s+PASS \| compared/);
    expect(run.stdout).not.toMatch(/WARN|FAIL/);
  });

  it('P33: a +25 % regression on one key exits 2 with that row FAIL', () => {
    const run = compare(withFixtures('current-regressed.json'));
    expect(run.status).toBe(2);
    expect(run.stdout).toMatch(/stateUpdate:searchChange\s+\|.*\+25\.0%\s+\|\s+FAIL \| compared/);
    expect(run.stdout).toMatch(/search:ts-scorer-10k\s+\|.*\|\s+PASS/);
  });

  it('P33: a +10 % move exits 1 with that row WARN', () => {
    const run = compare(withFixtures('current-warning.json'));
    expect(run.status).toBe(1);
    expect(run.stdout).toMatch(/stateUpdate:searchChange\s+\|.*\+10\.0%\s+\|\s+WARN \| compared/);
  });

  it('P33: a current above its target_ms exits 2 although the comparison alone passes', () => {
    const run = compare(withFixtures('current-above-target.json'));
    expect(run.status).toBe(2);
    expect(run.stdout).toMatch(/search:ts-scorer-10k\s+\|.*\+4\.5%\s+\|\s+FAIL \| above target/);
  });

  it('P33: a below-floor baseline row without a target_ms is a harness error, exit 2', () => {
    const run = compare(withFixtures('current-equal.json', 'baseline-floor-no-target.json'));
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('stateUpdate:navigate');
    expect(run.stderr).toContain('no target_ms');
  });

  it('P33: a baseline row with no measurement in the current file is a harness error, exit 2', () => {
    const run = compare(withFixtures('current-missing-key.json'));
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('NO MEASUREMENT for baseline key "stateUpdate:searchChange"');
    expect(run.stdout).not.toMatch(/stateUpdate:searchChange\s+\|.*PASS/);
  });

  it('P33: a current key with no baseline entry is a harness error, exit 2', () => {
    const run = compare(withFixtures('current-extra-key.json'));
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('NO BASELINE ENTRY for measured key "stateUpdate:extra"');
  });

  it('P33: an unknown flag is a harness error, exit 2, with a usage line', () => {
    const run = compare(['--nope']);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('usage: node benchmarks/standalone/compare-baseline.ts');
  });

  it('P33: an unreadable --current file is a harness error, exit 2, with a usage line', () => {
    const run = compare(['--current', resolve(fixtures, 'does-not-exist.json')]);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('does-not-exist.json');
    expect(run.stderr).toContain('usage: node benchmarks/standalone/compare-baseline.ts');
  });
});
