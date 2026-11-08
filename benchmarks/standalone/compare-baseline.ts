// benchmarks/standalone/compare-baseline.ts
// The one standalone bench harness (`pnpm bench:compare`): runs the named operations 5x with
// tinybench, takes per task the median of the 5 runs' p50, p99 and rme, writes
// benchmarks/results/bench-<shortsha>.json and compares those p50 medians with benchmarks/baseline.json.
// The baseline holds one record per CPU model (D97: numbers from two CPU models are never compared
// against a threshold). The run's CPU model (os.cpus()[0].model; with --current the file's
// environment.cpu when it has one) selects the record whose key equals it; the thresholds
// (regressionThresholds, shared by all records) apply to that record only.
// Verdicts come from compare-rules.ts: a median above its target_ms fails; a baseline median below
// the floor (regressionThresholds.floor_ms, 0.01 ms; today only stateUpdate:navigate, 0.902 microseconds)
// is reported, not compared, because run-to-run noise at that scale exceeds the thresholds; every
// other median is compared with the baseline.
// A run whose CPU model has no record prints one table per record, status INFO, each row naming the
// record's CPU and the run's CPU, then one line saying that no threshold applies, and exits 0; the
// results JSON is still written, so the next record can add that CPU.
// Exit codes: 0 = pass (or no record for this CPU), 1 = warning (>5% regression), 2 = failure (>15%
// regression, or above target_ms) or harness error (missing dist or tinybench, task that did not
// complete, measured key with no entry in the matching record, entry of the matching record with no
// measurement (--current only), a below-floor entry without a target_ms, an unknown flag, an unreadable
// or malformed --baseline or --current file).
// When the matching record's Node differs from the run's, one line says so before the table; the exit
// codes do not change. The results JSON carries `comparedTo`.
// Runs under Node's native type stripping, no loader: `node benchmarks/standalone/compare-baseline.ts`.
//
// Flags (the default invocation, no flags, is what CI runs: it measures live):
//   --baseline <file>  the baseline to compare with (default benchmarks/baseline.json)
//   --current <file>   skip the measurement and compare the medians in <file> instead: a JSON object
//                      `{ "environment"?: { "cpu"?, "node"? }, "tasks": { "<category>:<key>": { "median_ms": <number> } } }`,
//                      which is what benchmarks/results/bench-<sha>.json already holds. Every entry of
//                      the matching record needs a task in the file and every task an entry, or it is a
//                      harness error (never a silent pass). Nothing is written to benchmarks/results/ in
//                      this mode.
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

/** The numbers recorded on one CPU model. */
interface BaselineRecord {
  readonly environment?: { readonly cpu?: string | null; readonly node?: string | null };
  readonly benchmarks: Readonly<Record<string, unknown>>;
}

interface BaselineFile {
  readonly regressionThresholds: Thresholds;
  /** One record per CPU model, keyed by that model (the record's environment.cpu). */
  readonly records: Readonly<Record<string, BaselineRecord>>;
}

/** The medians of a run and the machine they were taken on. */
interface Measurement {
  readonly tasks: Map<string, TaskStats>;
  readonly cpu: string | null;
  readonly node: string | null;
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

/** One printed table row; `note` is the Reason column of a verdict table, the two CPUs of an informational one. */
interface TableRow {
  readonly name: string;
  readonly baseline_ms: number | undefined;
  readonly current_ms: number;
  readonly delta_pct: number | undefined;
  readonly status: string;
  readonly note: string;
}

const RUNS = 5;
let currentTask = '(outside a task)';

// ── Helpers ────────────────────────────────────────────────────────────────────

const mean = (values: readonly number[]): number =>
  values.reduce((a, b) => a + b, 0) / values.length;

/** The middle value of a sorted copy; for an even count the mean of the two middle values. Throws on an empty array. */
function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median of an empty array');
  const sorted = values.toSorted((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : mean([sorted[mid - 1] as number, sorted[mid] as number]);
}

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

/** Runs the named operations RUNS times on the built core and takes the median of the runs' p50, p99 and rme per task; undefined when a task did not complete. */
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

  // Median of the runs' p50, p99 and rme per task; samples is the sum
  const measured = new Map<string, TaskStats>();
  for (const [name, acc] of perTask) {
    measured.set(name, {
      median_ms: median(acc.p50),
      p99_ms: median(acc.p99),
      samples: acc.samples.reduce((a, b) => a + b, 0),
      rme: median(acc.rme),
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

/** The medians of a results-shaped file (`{ environment?, tasks: { "<category>:<key>": { median_ms } } }`), in file order, and the CPU and Node it names. */
async function readCurrent(path: string): Promise<Measurement> {
  const file = await readJson(path);
  if (!isRecord(file) || !isRecord(file.tasks)) {
    throw new UsageError(`${path}: expected an object with a "tasks" object`);
  }
  const tasks = new Map<string, TaskStats>();
  for (const [name, task] of Object.entries(file.tasks)) {
    if (!isRecord(task) || typeof task.median_ms !== 'number' || !Number.isFinite(task.median_ms)) {
      throw new UsageError(`${path}: task "${name}" has no finite median_ms`);
    }
    tasks.set(name, {
      median_ms: task.median_ms,
      p99_ms: Number.NaN,
      samples: 0,
      rme: Number.NaN,
    });
  }
  const environment = isRecord(file.environment) ? file.environment : {};
  return {
    tasks,
    // a file that names no CPU is read as taken on this machine
    cpu: typeof environment.cpu === 'string' ? environment.cpu : (os.cpus()[0]?.model ?? null),
    node: typeof environment.node === 'string' ? environment.node : null,
  };
}

/** Every `<category>:<key>` row of a record, in file order. */
function listRecordKeys(record: BaselineRecord): string[] {
  return Object.entries(record.benchmarks).flatMap(([category, entries]) =>
    isRecord(entries)
      ? Object.entries(entries)
          .filter(([, entry]) => isBaselineBenchmark(entry))
          .map(([key]) => `${category}:${key}`)
      : [],
  );
}

/** The entry of `<category>:<key>` in a record, when it has one. */
function findEntry(record: BaselineRecord, name: string): BaselineBenchmark | undefined {
  const [category = '', key = ''] = name.split(/:(.*)/s);
  const entries = record.benchmarks[category];
  const entry = isRecord(entries) ? entries[key] : undefined;
  return isBaselineBenchmark(entry) ? entry : undefined;
}

/** Validates the baseline's shape: the shared thresholds and a record per CPU model, each keyed by its own environment.cpu. */
function parseBaseline(path: string, json: unknown): BaselineFile {
  if (!isRecord(json) || !isRecord(json.regressionThresholds) || !isRecord(json.records)) {
    throw new UsageError(`${path}: expected "regressionThresholds" and "records" objects`);
  }
  for (const [cpu, record] of Object.entries(json.records)) {
    if (!isRecord(record) || !isRecord(record.benchmarks)) {
      throw new UsageError(`${path}: record "${cpu}" needs a "benchmarks" object`);
    }
    const named = isRecord(record.environment) ? record.environment.cpu : undefined;
    if (named !== undefined && named !== cpu) {
      throw new UsageError(
        `${path}: record "${cpu}" is keyed by a CPU model other than its environment.cpu ${JSON.stringify(named)}`,
      );
    }
  }
  return json as unknown as BaselineFile;
}

/** Millisecond medians print three decimals; sub-millisecond ones keep three significant digits (0.000752 ms, not 0.001 ms), so a row reported below the floor still shows its numbers. */
const fmtMs = (ms: number): string => `${ms >= 1 ? ms.toFixed(3) : ms.toPrecision(3)} ms`;

function printTable(rows: readonly TableRow[], noteHeader: string): void {
  const colName = 30;
  const colBaseline = 14;
  const colCurrent = 14;
  const colDelta = 12;
  const colStatus = 6;
  const noteWidth = Math.max(noteHeader.length, 12, ...rows.map((r) => r.note.length));
  const separator = '-'.repeat(
    colName + colBaseline + colCurrent + colDelta + colStatus + noteWidth + 10,
  );
  console.log(
    `${'Benchmark'.padEnd(colName)} | ${'Baseline'.padStart(colBaseline)} | ${'Current'.padStart(colCurrent)} | ${'Delta'.padStart(colDelta)} | ${'Status'.padStart(colStatus)} | ${noteHeader.padEnd(noteWidth)}`,
  );
  console.log(separator);
  for (const row of rows) {
    const baselineStr = row.baseline_ms === undefined ? 'no entry' : fmtMs(row.baseline_ms);
    const deltaStr =
      row.delta_pct === undefined
        ? '-'
        : `${row.delta_pct >= 0 ? '+' : ''}${(row.delta_pct * 100).toFixed(1)}%`;
    console.log(
      `${row.name.padEnd(colName)} | ${baselineStr.padStart(colBaseline)} | ${fmtMs(row.current_ms).padStart(colCurrent)} | ${deltaStr.padStart(colDelta)} | ${row.status.padStart(colStatus)} | ${row.note.padEnd(noteWidth)}`,
    );
  }
  console.log(separator);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const args = parseCli(argv);
  // 1. Read baseline
  const baselinePath =
    args.baseline === undefined
      ? fileURLToPath(new URL('../../benchmarks/baseline.json', import.meta.url))
      : resolve(args.baseline);
  const baseline = parseBaseline(baselinePath, await readJson(baselinePath));
  const { regressionThresholds } = baseline;
  const currentPath = args.current === undefined ? undefined : resolve(args.current);

  // 2-6. Measure live, or take the medians from --current
  const live = currentPath === undefined ? await measureLive() : undefined;
  if (currentPath === undefined && live === undefined) return 2;
  const run: Measurement =
    live === undefined
      ? await readCurrent(currentPath as string)
      : { tasks: live, cpu: os.cpus()[0]?.model ?? null, node: process.version };
  const { tasks: measured, cpu: thisCpu } = run;

  // 7. Pick the record of this run's CPU model (D97); without one nothing is judged.
  const matched =
    thisCpu !== null && Object.hasOwn(baseline.records, thisCpu)
      ? baseline.records[thisCpu]
      : undefined;
  const recordNode = matched?.environment?.node ?? null;

  // 8. Compare against the matching record. A measured key without an entry is a failure.
  let missing = false;
  const rows: ComparisonRow[] = [];
  if (matched !== undefined) {
    for (const [name, stats] of measured) {
      const entry = findEntry(matched, name);
      if (entry === undefined) {
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
  }

  // With --current every entry of the matching record needs a measurement: a missing one is a failure,
  // never a skip (live, the entries this harness does not measure are listed after the table instead).
  const unmeasured =
    matched === undefined ? [] : listRecordKeys(matched).filter((name) => !measured.has(name));
  if (currentPath !== undefined) {
    for (const name of unmeasured) {
      console.error(`NO MEASUREMENT for baseline key "${name}" in ${currentPath}`);
      missing = true;
    }
  }

  // 9. The informational comparison with every record, when none is for this CPU: the same deltas, no verdict.
  const informational =
    matched === undefined
      ? Object.entries(baseline.records).map(([recordCpu, record]) => ({
          recordCpu,
          rows: [...measured].map(([name, stats]): TableRow => {
            const entry = findEntry(record, name);
            return {
              name,
              baseline_ms: entry?.median_ms,
              current_ms: stats.median_ms,
              delta_pct: entry && (stats.median_ms - entry.median_ms) / entry.median_ms,
              status: 'INFO',
              note: `${recordCpu} -> ${thisCpu ?? 'unknown CPU'}`,
            };
          }),
        }))
      : [];

  // 10. Write benchmarks/results/bench-<shortsha>.json (after the comparison: it records each verdict).
  //     Not with --current: those medians are not a measurement of this commit.
  if (currentPath === undefined) {
    const commit = process.env.GITHUB_SHA ?? git('rev-parse', 'HEAD');
    const resultsDir = new URL('../../benchmarks/results/', import.meta.url);
    await mkdir(resultsDir, { recursive: true });
    const resultsUrl = new URL(`bench-${commit.slice(0, 7)}.json`, resultsDir);
    await writeFile(
      resultsUrl,
      `${JSON.stringify(
        {
          schemaVersion: 2,
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
          comparedTo:
            matched === undefined
              ? { record: false, cpu: null, node: null }
              : { record: true, cpu: thisCpu, node: recordNode },
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
          informational: Object.fromEntries(
            informational.map(({ recordCpu, rows: infoRows }) => [
              recordCpu,
              Object.fromEntries(
                infoRows.map((r) => [
                  r.name,
                  { baseline_ms: r.baseline_ms, delta_pct: r.delta_pct },
                ]),
              ),
            ]),
          ),
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Results written to ${resultsUrl.pathname.replace(/^\/(?=[A-Za-z]:)/, '')}\n`);
  }

  // 11. Print the formatted table(s)
  if (currentPath !== undefined) {
    console.log(`baseline: ${baselinePath}\ncurrent: ${currentPath}\n`);
  }
  if (matched === undefined) {
    for (const { recordCpu, rows: infoRows } of informational) {
      console.log(`record: ${recordCpu}; this run: ${thisCpu ?? 'unknown CPU'}`);
      printTable(infoRows, 'Record CPU -> run CPU');
      console.log('');
    }
    console.log(
      `no baseline record for ${thisCpu ?? 'unknown CPU'}: the tables above are informational, no threshold applies (exit 0)`,
    );
    return 0;
  }
  if (recordNode !== null && run.node !== null && recordNode !== run.node) {
    console.log(
      `record: ${thisCpu}, Node ${recordNode}; this run: Node ${run.node}: the thresholds apply, but the Node versions differ\n`,
    );
  }
  printTable(
    rows.map((r) => ({ ...r, note: r.reason })),
    'Reason',
  );

  // Entries of the record this harness does not measure are reported, never silently compared
  if (currentPath === undefined) {
    for (const name of unmeasured) console.log(`not measured: ${name}`);
  }

  // 12. Exit code
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
  process.exitCode = await main();
} catch (err: unknown) {
  console.error('bench harness error:', err);
  if (err instanceof UsageError) console.error(USAGE);
  process.exitCode = 2;
}
