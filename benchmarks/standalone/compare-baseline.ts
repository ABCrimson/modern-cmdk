// benchmarks/standalone/compare-baseline.ts
// The one standalone bench harness (`pnpm bench:compare`): runs the named operations 3x with
// tinybench, averages the run statistics, writes benchmarks/results/bench-<shortsha>.json and
// compares the medians with benchmarks/baseline.json.
// Exit codes: 0 = pass, 1 = warning (>5% regression), 2 = failure (>15% regression) or harness
// error (missing dist or tinybench, task that did not complete, measured key with no baseline entry).
// When the baseline's CPU or Node differs from this machine, one line says so before the table and the
// results JSON carries `comparedTo`; the exit codes do not change.
// Runs under Node's native type stripping, no loader: `node benchmarks/standalone/compare-baseline.ts`.
// Requires: tinybench 6.2.3, built packages (pnpm build), Node >=26.4.0 (package.json engines)

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BaselineBenchmark {
  readonly median_ms: number;
  readonly p99_ms: number;
  readonly target_ms?: number;
}

interface BaselineFile {
  readonly environment?: { readonly cpu?: string | null; readonly node?: string | null };
  readonly regressionThresholds: {
    readonly warning: number;
    readonly failure: number;
  };
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

type Status = 'pass' | 'warn' | 'fail';

interface ComparisonRow {
  readonly name: string;
  readonly baseline_ms: number;
  readonly current_ms: number;
  readonly delta_pct: number;
  readonly status: Status;
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

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  // 1. Read baseline
  const baselinePath = new URL('../../benchmarks/baseline.json', import.meta.url);
  const baseline: BaselineFile = JSON.parse(await readFile(baselinePath, 'utf-8'));
  const { warning: warnThreshold, failure: failThreshold } = baseline.regressionThresholds;

  // 2. Import built core package — a missing dist is a harness error (exit 2), not a pass
  const { Bench } = await import('tinybench');
  const { createSearchEngine, createCommandMachine, itemId }: Core = await import(
    '../../packages/modern-cmdk/dist/core/index.mjs'
  );

  // 3. Prepare test data — ES2025 Iterator Helpers pipeline
  const words = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew'];
  const items10K = Iterator.from({
    [Symbol.iterator]: function* () {
      for (let i = 0; i < 10_000; i++) yield i;
    },
  })
    .map((i: number) => ({
      id: itemId(`item-${i}`),
      value: `${words[i % words.length]} ${i} action`,
      keywords: [`kw-${i}`],
    }))
    .toArray();
  const items1K = items10K.slice(0, 1_000);
  const items100 = items10K.slice(0, 100);

  // 4. Task definitions. Each fixture is created in beforeEach and disposed in afterEach, so
  //    only the named call sits inside the timed window.
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

  // 5. Run the benchmarks RUNS times and collect per-task statistics
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
    return 2;
  }

  // 6. Average the run statistics per task
  const measured = new Map<string, TaskStats>();
  for (const [name, acc] of perTask) {
    measured.set(name, {
      median_ms: mean(acc.p50),
      p99_ms: mean(acc.p99),
      samples: acc.samples.reduce((a, b) => a + b, 0),
      rme: mean(acc.rme),
    });
  }

  // 7. Write benchmarks/results/bench-<shortsha>.json
  const thisCpu = os.cpus()[0]?.model ?? null;
  const baseCpu = baseline.environment?.cpu ?? null;
  const baseNode = baseline.environment?.node ?? null;
  const sameMachine = baseCpu === thisCpu && baseNode === process.version;
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
        tasks: Object.fromEntries(measured),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Results written to ${resultsUrl.pathname.replace(/^\/(?=[A-Za-z]:)/, '')}\n`);

  // 8. Compare against baseline. A measured key without a baseline entry is a failure.
  let missing = false;
  const rows: ComparisonRow[] = [];
  for (const spec of specs) {
    const name = `${spec.category}:${spec.key}`;
    const stats = measured.get(name);
    if (!stats) throw new Error(`${name}: no statistics collected`);
    const category = baseline.benchmarks[spec.category] as Record<string, unknown> | undefined;
    const entry = category?.[spec.key];
    if (!isBaselineBenchmark(entry)) {
      console.error(`NO BASELINE ENTRY for measured key "${name}" in benchmarks/baseline.json`);
      missing = true;
      continue;
    }
    const delta_pct = (stats.median_ms - entry.median_ms) / entry.median_ms;
    let status: Status = 'pass';
    if (delta_pct > failThreshold) status = 'fail';
    else if (delta_pct > warnThreshold) status = 'warn';
    rows.push({
      name,
      baseline_ms: entry.median_ms,
      current_ms: stats.median_ms,
      delta_pct,
      status,
    });
  }

  // 9. Print formatted table
  if (!sameMachine) {
    console.log(
      `baseline: ${baseCpu ?? 'unknown CPU'}, Node ${baseNode ?? 'unknown'}; this machine: ${thisCpu ?? 'unknown CPU'}, Node ${process.version}: cross-machine numbers, the thresholds below are a tripwire, not a verdict
`,
    );
  }
  const colName = 30;
  const colBaseline = 14;
  const colCurrent = 14;
  const colDelta = 12;
  const colStatus = 8;
  const separator = '-'.repeat(colName + colBaseline + colCurrent + colDelta + colStatus + 8);

  console.log(
    `${'Benchmark'.padEnd(colName)} | ${'Baseline'.padStart(colBaseline)} | ${'Current'.padStart(colCurrent)} | ${'Delta'.padStart(colDelta)} | ${'Status'.padStart(colStatus)}`,
  );
  console.log(separator);
  for (const row of rows) {
    const baselineStr = `${row.baseline_ms.toFixed(3)} ms`;
    const currentStr = `${row.current_ms.toFixed(3)} ms`;
    const deltaStr = `${row.delta_pct >= 0 ? '+' : ''}${(row.delta_pct * 100).toFixed(1)}%`;
    console.log(
      `${row.name.padEnd(colName)} | ${baselineStr.padStart(colBaseline)} | ${currentStr.padStart(colCurrent)} | ${deltaStr.padStart(colDelta)} | ${row.status.toUpperCase().padStart(colStatus)}`,
    );
  }
  console.log(separator);

  // Baseline entries this harness does not measure are reported, never silently compared
  const measuredNames = new Set(specs.map((s) => `${s.category}:${s.key}`));
  for (const [category, entries] of Object.entries(baseline.benchmarks)) {
    if (typeof entries !== 'object' || entries === null) continue;
    for (const [key, entry] of Object.entries(entries)) {
      if (isBaselineBenchmark(entry) && !measuredNames.has(`${category}:${key}`)) {
        console.log(`not measured: ${category}:${key}`);
      }
    }
  }

  // 10. Exit code
  if (missing || rows.some((r) => r.status === 'fail')) return 2;
  if (rows.some((r) => r.status === 'warn')) return 1;
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
  process.exitCode = 2;
}
