// benchmarks/standalone/compare-baseline.ts
// Regression comparison script — reads baseline.json, runs benchmarks 3x, averages, compares.
// Exit codes: 0 = pass, 1 = warning (>5% regression), 2 = failure (>15% regression)
// Requires: tinybench 6.0.0, built packages (pnpm build), Node 25.8.0+

import './setup.js';
import { readFile } from 'node:fs/promises';
import { Bench } from 'tinybench';

// ── Types ──────────────────────────────────────────────────────────────────────

interface BaselineBenchmark {
  readonly median_ms: number;
  readonly p99_ms: number;
  readonly target_ms: number;
}

interface BaselineFile {
  readonly regressionThresholds: {
    readonly warning: number;
    readonly failure: number;
  };
  readonly benchmarks: {
    readonly search: Record<string, BaselineBenchmark>;
    readonly stateUpdate: Record<string, BaselineBenchmark>;
    readonly [category: string]: unknown;
  };
}

interface BenchResult {
  readonly name: string;
  readonly baselineKey: string;
  readonly category: string;
  readonly median_ms: number;
  readonly p99_ms: number;
}

type Status = 'pass' | 'warn' | 'fail';

interface ComparisonRow {
  readonly name: string;
  readonly baseline_ms: number;
  readonly current_ms: number;
  readonly delta_pct: number;
  readonly status: Status;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number);
}

function _padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function _padLeft(str: string, len: number): string {
  return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Read baseline
  const baselinePath = new URL('../../benchmarks/baseline.json', import.meta.url);
  const baselineRaw = await readFile(baselinePath, 'utf-8');
  const baseline: BaselineFile = JSON.parse(baselineRaw);
  const { warning: warnThreshold, failure: failThreshold } = baseline.regressionThresholds;

  // 2. Import built core package
  const { createSearchEngine, createCommandMachine, itemId } = await import(
    '../../packages/modern-cmdk/dist/core/index.js'
  );

  // 3. Prepare test data
  const words = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew'];

  // ES2026 Iterator Helpers — generate benchmark items via iterator pipeline
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

  // 4. Run benchmarks 3 times and collect per-task medians
  const RUNS = 3;
  const taskMedians = new Map<string, number[]>();

  for (let run = 0; run < RUNS; run++) {
    const bench = new Bench({
      warmupIterations: 50,
      iterations: 500,
    });

    // search:ts-scorer-10k — create engine, index 10K items, search "apple"
    bench.add('search:ts-scorer-10k', () => {
      using engine = createSearchEngine();
      engine.index(items10K);
      engine.search('apple', items10K).toArray();
    });

    // stateUpdate:navigate — create machine with 100 items, send NAVIGATE next
    bench.add('stateUpdate:navigate', () => {
      using machine = createCommandMachine({ items: items100 });
      machine.send({ type: 'NAVIGATE', direction: 'next' });
    });

    // stateUpdate:searchChange — create machine with 1K items, search "apple"
    bench.add('stateUpdate:searchChange', () => {
      using machine = createCommandMachine({ items: items1K });
      machine.send({ type: 'SEARCH_CHANGE', query: 'apple' });
    });

    const results = await bench.run();

    // Collect median from each task — Iterator Helpers pipeline
    results.values().forEach((task) => {
      if (task.result) {
        const samples = (task.result.samples ?? []).toSorted((a, b) => a - b);
        const med = samples.length > 0 ? median(samples) : (task.result.mean ?? 0);
        const existing = taskMedians.get(task.name) ?? [];
        existing.push(med);
        taskMedians.set(task.name, existing);
      }
    });
  }

  // 5. Average the 3 run medians for each task
  const benchResults: BenchResult[] = [
    { name: 'search:ts-scorer-10k', baselineKey: 'ts-scorer-10k', category: 'search' },
    { name: 'stateUpdate:navigate', baselineKey: 'navigate', category: 'stateUpdate' },
    { name: 'stateUpdate:searchChange', baselineKey: 'searchChange', category: 'stateUpdate' },
  ].map((spec) => {
    const medians = taskMedians.get(spec.name) ?? [0];
    const avgMedian = Math.sumPrecise(medians) / medians.length;
    return {
      ...spec,
      median_ms: avgMedian,
      p99_ms: avgMedian, // simplified — we compare on median
    };
  });

  // 6. Compare against baseline
  const rows: ComparisonRow[] = benchResults.map((result) => {
    const baselineCategory = baseline.benchmarks[result.category] as
      | Record<string, BaselineBenchmark>
      | undefined;
    const baselineEntry = baselineCategory?.[result.baselineKey];

    if (!baselineEntry) {
      return {
        name: result.name,
        baseline_ms: 0,
        current_ms: result.median_ms,
        delta_pct: 0,
        status: 'pass' as Status,
      };
    }

    const delta_pct = (result.median_ms - baselineEntry.median_ms) / baselineEntry.median_ms;
    let status: Status = 'pass';
    if (delta_pct > failThreshold) status = 'fail';
    else if (delta_pct > warnThreshold) status = 'warn';

    return {
      name: result.name,
      baseline_ms: baselineEntry.median_ms,
      current_ms: result.median_ms,
      delta_pct,
      status,
    };
  });

  // 7. Print formatted table
  const STATUS_ICONS: Record<Status, string> = {
    pass: 'PASS',
    warn: 'WARN',
    fail: 'FAIL',
  };

  const colName = 30;
  const colBaseline = 14;
  const colCurrent = 14;
  const colDelta = 12;
  const colStatus = 8;

  const _separator = '-'.repeat(colName + colBaseline + colCurrent + colDelta + colStatus + 8);

  for (const row of rows) {
    const _baselineStr = row.baseline_ms > 0 ? `${row.baseline_ms.toFixed(3)} ms` : 'N/A';
    const _currentStr = `${row.current_ms.toFixed(3)} ms`;
    const _deltaStr =
      row.baseline_ms > 0
        ? `${row.delta_pct >= 0 ? '+' : ''}${(row.delta_pct * 100).toFixed(1)}%`
        : 'N/A';
    const _statusStr = STATUS_ICONS[row.status];
  }

  // 8. Determine overall exit code
  const hasFailure = rows.some((r) => r.status === 'fail');
  const hasWarning = rows.some((r) => r.status === 'warn');

  if (hasFailure) {
    process.exit(2);
  } else if (hasWarning) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((_err) => {
  process.exit(2);
});
