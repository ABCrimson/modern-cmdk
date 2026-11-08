// benchmarks/standalone/compare-baseline.ts
// The one standalone bench harness (`pnpm bench:compare`): runs the named operations 3x with
// tinybench, averages the run statistics, writes benchmarks/results/bench-<shortsha>.json and
// compares the medians with benchmarks/baseline.json.
// Verdicts come from compare-rules.ts: a median above its target_ms fails; a baseline median below
// the floor (regressionThresholds.floor_ms, 0.01 ms; today only stateUpdate:navigate, 0.75 microseconds)
// is reported, not compared, because run-to-run noise at that scale exceeds the thresholds; every
// other median is compared with the baseline.
// Exit codes: 0 = pass, 1 = warning (>5% regression), 2 = failure (>15% regression, or above target_ms)
// or harness error (missing dist or tinybench, task that did not complete, measured key with no baseline
// entry, baseline entry with no measurement (--current only), a below-floor baseline entry without a
// target_ms, an unknown flag, an unreadable or malformed --baseline or --current file).
// When the baseline's CPU or Node differs from this machine, one line says so before the table and the
// results JSON carries `comparedTo`; the exit codes do not change.
// Runs under Node's native type stripping, no loader: `node benchmarks/standalone/compare-baseline.ts`.
//
// Flags (the default invocation, no flags, is what CI runs: it measures live):
//   --baseline <file>  the baseline to compare with (default benchmarks/baseline.json)
//   --current <file>   skip the measurement and compare the medians in <file> instead: a JSON object
//                      `{ "tasks": { "<category>:<key>": { "median_ms": <number> } } }`, which is what
//                      benchmarks/results/bench-<sha>.json already holds. Every baseline entry needs a
//                      task in the file and every task a baseline entry, or it is a harness error (never a
//                      silent pass). Nothing is written to benchmarks/results/ in this mode.
// tests/unit/bench-compare-rules.test.ts (P33) runs the harness on the fixtures in
// benchmarks/standalone/fixtures/ to prove the verdicts and exit codes end to end.
// Requires: tinybench 6.2.3, built packages (pnpm build), Node >=26.4.0 (package.json engines)

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { generateItems } from '../fixtures.ts';
import { type Classification, classify, type Thresholds } from './compare-rules.ts';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BaselineBenchmark {
  readonly median_ms: number;
  readonly p99_ms: number;
  readonly target_ms?: number;
}

interface BaselineFile {
  readonly environment?: { readonly cpu?: string | null; readonly node?: string | null };
  readonly regressionThresholds: Thresholds;
  readonly benchmarks: Readonly<Record<string, unknown>>;
}

type Core = typeof import('../../packages/modern-cmdk/dist/core/index.mjs');

/** One measured operation. `beforeEach` builds the fixture outside the timed window. */
interface TaskSpec {
  readonly category: 'search' | 'stateUpdate';
  readonly key: string;
  readonly beforeEach: () => void;
  readonly fn: () => void | Promise<void>;
  readonly afterEach: () => void;
}

interface TaskStats {
  readonly median_ms: number;
  readonly p99_ms: number;
  readonly samples: number;
  readonly rme: number;
}

interface ComparisonRow extends Classification {
  readonly name: string;
  readonly baseline_ms: number;
  readonly current_ms: number;
}

const RUNS = 3;
let currentTask = '(outside a task)';

// ── Helpers ────────────────────────────────────────────────────────────────────

const mean = (values: readonly number[]): number =>
  values.reduce((a, b) => a + b, 0) / values.length;

function isBaselineBenchmark(value: unknown): value is BaselineBenchmark {
  return (
    typeof value === 'object' &&
    value !== null &&
    'median_ms' in value &&
    typeof value.median_ms === 'number'
  );
}

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf-8' }).trim();
}

/** Runs the named operations RUNS times on the built core and averages the run statistics per task; undefined when a task did not complete. */
async function measureLive(): Promise<Map<string, TaskStats> | undefined> {
  // Import built core package — a missing dist is a harness error (exit 2), not a pass
  const { Bench } = await import('tinybench');
  const { createSearchEngine, createCommandMachine, itemId }: Core = await import(
    '../../packages/modern-cmdk/dist/core/index.mjs'
  );

  // Prepare test data: the 'basic' variant, the dataset benchmarks/baseline.json was recorded on
  // (pinned by tests/unit/bench-compare-rules.test.ts). The core comes from dist, so its itemId is
  // passed to the generator.
  const items10K = generateItems(10_000, 'basic', itemId);
  const items1K = items10K.slice(0, 1_000);
  const items100 = items10K.slice(0, 100);

  // Task definitions. Each fixture is created in beforeEach and disposed in afterEach, so
  // only the named call sits inside the timed window.
  let engine: ReturnType<Core['createSearchEngine']> | undefined;
  let machine: ReturnType<Core['createCommandMachine']> | undefined;
  let subscription: Disposable | undefined;
  let stateChanged: PromiseWithResolvers<void> | undefined;

  const withEngine = (): NonNullable<typeof engine> => {
    if (!engine) throw new Error('engine fixture missing: beforeEach did not run');
    return engine;
  };

  // The machine batches events through its scheduler, so the work only happens once the event
  // is processed. Await the resulting state change through the public subscribeState API.
  const machineTask = (
    key: string,
    items: typeof items100,
    event: Parameters<NonNullable<typeof machine>['send']>[0],
  ): TaskSpec => ({
    category: 'stateUpdate',
    key,
    beforeEach: () => {
      machine = createCommandMachine({ items });
      const changed = Promise.withResolvers<void>();
      stateChanged = changed;
      subscription = machine.subscribeState(() => changed.resolve());
    },
    fn: async () => {
      if (!machine || !stateChanged) throw new Error('machine fixture missing');
      machine.send(event);
      await stateChanged.promise;
    },
    afterEach: () => {
      subscription?.[Symbol.dispose]();
      machine?.[Symbol.dispose]();
      subscription = machine = stateChanged = undefined;
    },
  });

  const specs: readonly TaskSpec[] = [
    {
      category: 'search',
      key: 'ts-scorer-10k',
      beforeEach: () => {
        engine = createSearchEngine();
        engine.index(items10K);
      },
      fn: () => {
        withEngine().search('apple', items10K).toArray();
      },
      afterEach: () => {
        engine?.[Symbol.dispose]();
        engine = undefined;
      },
    },
    machineTask('navigate', items100, { type: 'NAVIGATE', direction: 'next' }),
    machineTask('searchChange', items1K, { type: 'SEARCH_CHANGE', query: 'apple' }),
  ];

  // Run the benchmarks RUNS times and collect per-task statistics
  const perTask = new Map<
    string,
    { p50: number[]; p99: number[]; samples: number[]; rme: number[] }
  >();
  const failures: string[] = [];

  for (let run = 0; run < RUNS; run++) {
    // time/warmupTime 0: tinybench counts only the timed call against its time budget, so with the
    // default 1000 ms a sub-microsecond call would repeat ~1.6M times, each with a fresh fixture.
    // An exact iteration count keeps the run length independent of the call's speed.
    const bench = new Bench({ warmupIterations: 50, warmupTime: 0, iterations: 1_000, time: 0 });
    for (const spec of specs) {
      const name = `${spec.category}:${spec.key}`;
      bench.add(name, spec.fn, {
        beforeEach: () => {
          currentTask = name;
          spec.beforeEach();
        },
        afterEach: spec.afterEach,
      });
    }

    const tasks = await bench.run();
    for (const task of tasks) {
      const { result } = task;
      if (result.state !== 'completed') {
        const reason = 'error' in result ? String(result.error) : '';
        failures.push(`${task.name} (run ${run + 1}): ${result.state} ${reason}`.trim());
        continue;
      }
      const acc = perTask.get(task.name) ?? { p50: [], p99: [], samples: [], rme: [] };
      acc.p50.push(result.latency.p50);
      acc.p99.push(result.latency.p99);
      acc.samples.push(result.latency.samplesCount);
      acc.rme.push(result.latency.rme);
      perTask.set(task.name, acc);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`TASK FAILED: ${failure}`);
    return undefined;
  }

  // Average the run statistics per task
  const measured = new Map<string, TaskStats>();
  for (const [name, acc] of perTask) {
    measured.set(name, {
      median_ms: mean(acc.p50),
      p99_ms: mean(acc.p99),
      samples: acc.samples.reduce((a, b) => a + b, 0),
      rme: mean(acc.rme),
    });
  }

  return measured;
}

const USAGE =
  'usage: node benchmarks/standalone/compare-baseline.ts [--baseline <file>] [--current <file>]';

/** A bad flag or an unreadable or malformed input file: the harness error that also prints the usage line. */
class UsageError extends Error {}

interface CliArgs {
  readonly baseline: string | undefined;
  readonly current: string | undefined;
}

/** Parses the flags; throws on an unknown flag, a flag without a value or a positional argument. */
function parseCli(argv: readonly string[]): CliArgs {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: { baseline: { type: 'string' }, current: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    });
    return { baseline: values.baseline, current: values.current };
  } catch (err: unknown) {
    throw new UsageError(err instanceof Error ? err.message : String(err), { cause: err });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads and parses a JSON file; the error names the path. */
async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch (err: unknown) {
    throw new UsageError(
      `cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`,
      {
        cause: err,
      },
    );
  }
}

/** The medians of a results-shaped file (`{ tasks: { "<category>:<key>": { median_ms } } }`), in file order. */
async function readCurrent(path: string): Promise<Map<string, TaskStats>> {
  const file = await readJson(path);
  if (!isRecord(file) || !isRecord(file.tasks)) {
    throw new UsageError(`${path}: expected an object with a "tasks" object`);
  }
  const measured = new Map<string, TaskStats>();
  for (const [name, task] of Object.entries(file.tasks)) {
    if (!isRecord(task) || typeof task.median_ms !== 'number' || !Number.isFinite(task.median_ms)) {
      throw new UsageError(`${path}: task "${name}" has no finite median_ms`);
    }
    measured.set(name, {
      median_ms: task.median_ms,
      p99_ms: Number.NaN,
      samples: 0,
      rme: Number.NaN,
    });
  }
  return measured;
}

/** Every `<category>:<key>` row of the baseline, in file order. */
function listBaselineKeys(baseline: BaselineFile): string[] {
  return Object.entries(baseline.benchmarks).flatMap(([category, entries]) =>
    isRecord(entries)
      ? Object.entries(entries)
          .filter(([, entry]) => isBaselineBenchmark(entry))
          .map(([key]) => `${category}:${key}`)
      : [],
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(args: CliArgs): Promise<number> {
  // 1. Read baseline
  const baselinePath =
    args.baseline === undefined
      ? fileURLToPath(new URL('../../benchmarks/baseline.json', import.meta.url))
      : resolve(args.baseline);
  const baselineJson = await readJson(baselinePath);
  if (
    !isRecord(baselineJson) ||
    !isRecord(baselineJson.regressionThresholds) ||
    !isRecord(baselineJson.benchmarks)
  ) {
    throw new UsageError(
      `${baselinePath}: expected "regressionThresholds" and "benchmarks" objects`,
    );
  }
  const baseline = baselineJson as unknown as BaselineFile;
  const { regressionThresholds } = baseline;
  const currentPath = args.current === undefined ? undefined : resolve(args.current);

  // 2-6. Measure live, or take the medians from --current
  const measured = currentPath === undefined ? await measureLive() : await readCurrent(currentPath);
  if (measured === undefined) return 2;

  // 7. Compare against baseline. A measured key without a baseline entry is a failure.
  let missing = false;
  const rows: ComparisonRow[] = [];
  for (const [name, stats] of measured) {
    const [category = '', key = ''] = name.split(/:(.*)/s);
    const entries = baseline.benchmarks[category];
    const entry = isRecord(entries) ? entries[key] : undefined;
    if (!isBaselineBenchmark(entry)) {
      console.error(`NO BASELINE ENTRY for measured key "${name}" in ${baselinePath}`);
      missing = true;
      continue;
    }
    rows.push({
      name,
      baseline_ms: entry.median_ms,
      current_ms: stats.median_ms,
      ...classify({
        key: name,
        baseline_ms: entry.median_ms,
        current_ms: stats.median_ms,
        target_ms: entry.target_ms,
        thresholds: regressionThresholds,
      }),
    });
  }

  // With --current every baseline entry needs a measurement: a missing one is a failure, never a skip
  // (live, the entries this harness does not measure are listed after the table instead).
  const unmeasured = listBaselineKeys(baseline).filter((name) => !measured.has(name));
  if (currentPath !== undefined) {
    for (const name of unmeasured) {
      console.error(`NO MEASUREMENT for baseline key "${name}" in ${currentPath}`);
      missing = true;
    }
  }

  // 8. Write benchmarks/results/bench-<shortsha>.json (after the comparison: it records each verdict).
  //    Not with --current: those medians are not a measurement of this commit.
  const thisCpu = os.cpus()[0]?.model ?? null;
  const baseCpu = baseline.environment?.cpu ?? null;
  const baseNode = baseline.environment?.node ?? null;
  const sameMachine = baseCpu === thisCpu && baseNode === process.version;
  if (currentPath === undefined) {
    const commit = process.env.GITHUB_SHA ?? git('rev-parse', 'HEAD');
    const resultsDir = new URL('../../benchmarks/results/', import.meta.url);
    await mkdir(resultsDir, { recursive: true });
    const resultsUrl = new URL(`bench-${commit.slice(0, 7)}.json`, resultsDir);
    await writeFile(
      resultsUrl,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          commit,
          date: new Date().toISOString(),
          environment: {
            os: `${os.platform()} ${os.release()}`,
            runner: process.env.ImageOS ?? process.env.RUNNER_OS ?? null,
            runnerImageVersion: process.env.ImageVersion ?? null,
            node: process.version,
            cpu: thisCpu,
            cpuCount: os.availableParallelism(),
          },
          comparedTo: { cpu: baseCpu, node: baseNode, sameMachine },
          runs: RUNS,
          thresholds: regressionThresholds,
          tasks: Object.fromEntries(measured),
          comparisons: Object.fromEntries(
            rows.map((r) => [
              r.name,
              {
                baseline_ms: r.baseline_ms,
                delta_pct: r.delta_pct,
                status: r.status,
                reason: r.reason,
              },
            ]),
          ),
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Results written to ${resultsUrl.pathname.replace(/^\/(?=[A-Za-z]:)/, '')}\n`);
  }

  // 9. Print formatted table
  if (currentPath !== undefined) {
    console.log(`baseline: ${baselinePath}\ncurrent: ${currentPath}\n`);
  } else if (!sameMachine) {
    console.log(
      `baseline: ${baseCpu ?? 'unknown CPU'}, Node ${baseNode ?? 'unknown'}; this machine: ${thisCpu ?? 'unknown CPU'}, Node ${process.version}: cross-machine numbers, the thresholds below are a tripwire, not a verdict
`,
    );
  }
  const colName = 30;
  const colBaseline = 14;
  const colCurrent = 14;
  const colDelta = 12;
  const colStatus = 6;
  const colReason = 12;
  const separator = '-'.repeat(
    colName + colBaseline + colCurrent + colDelta + colStatus + colReason + 10,
  );

  console.log(
    `${'Benchmark'.padEnd(colName)} | ${'Baseline'.padStart(colBaseline)} | ${'Current'.padStart(colCurrent)} | ${'Delta'.padStart(colDelta)} | ${'Status'.padStart(colStatus)} | ${'Reason'.padEnd(colReason)}`,
  );
  console.log(separator);
  // Millisecond medians print three decimals; sub-millisecond ones keep three significant digits
  // (0.000752 ms, not 0.001 ms), so a row reported below the floor still shows its numbers.
  const fmtMs = (ms: number): string => `${ms >= 1 ? ms.toFixed(3) : ms.toPrecision(3)} ms`;
  for (const row of rows) {
    const baselineStr = fmtMs(row.baseline_ms);
    const currentStr = fmtMs(row.current_ms);
    const deltaStr = `${row.delta_pct >= 0 ? '+' : ''}${(row.delta_pct * 100).toFixed(1)}%`;
    console.log(
      `${row.name.padEnd(colName)} | ${baselineStr.padStart(colBaseline)} | ${currentStr.padStart(colCurrent)} | ${deltaStr.padStart(colDelta)} | ${row.status.padStart(colStatus)} | ${row.reason.padEnd(colReason)}`,
    );
  }
  console.log(separator);

  // Baseline entries this harness does not measure are reported, never silently compared
  if (currentPath === undefined) {
    for (const name of unmeasured) console.log(`not measured: ${name}`);
  }

  // 10. Exit code
  if (missing || rows.some((r) => r.status === 'FAIL')) return 2;
  if (rows.some((r) => r.status === 'WARN')) return 1;
  return 0;
}

// The machine's scheduler rethrows a failing event from a queued microtask, so the error surfaces
// here instead of as an errored tinybench task; Node's default exit 1 would read as a warning.
process.on('uncaughtException', (err: unknown) => {
  console.error(`TASK FAILED: ${currentTask}: uncaught`, err);
  process.exit(2);
});

try {
  process.exitCode = await main(parseCli(process.argv.slice(2)));
} catch (err: unknown) {
  console.error('bench harness error:', err);
  if (err instanceof UsageError) console.error(USAGE);
  process.exitCode = 2;
}
