// benchmarks/standalone/record-baseline.ts
// The baseline recorder (`pnpm bench:record`, D93): rewrites benchmarks/baseline.json from the
// `benchmark-results` artifact of a CI run (benchmarks/results/bench-<sha>.json, which
// compare-baseline.ts writes). D93 re-records the baseline from the first green run after each Node pin
// bump; this is that step as a tool, so the file is never edited by hand.
//
// Usage: node benchmarks/standalone/record-baseline.ts <results.json> --source <run url or id>
//                                                      [--out <file>] [--baseline <file>]
//                                                      [--target <category>:<key>=<ms>]...
//   <results.json>  the artifact. Every task's `median_ms` becomes the row's median_ms and its `p99_ms`
//                   the row's p99_ms (both are the medians of the harness's 5 runs, D93).
//   --source        the run the artifact came from (its URL or id): written to `source`, named in `note`.
//   --out           the file to write (default benchmarks/baseline.json).
//   --baseline      the existing baseline the rows' target_ms, the thresholds (warning, failure,
//                   floor_ms) and `version` are carried over from (default benchmarks/baseline.json).
//   --target        the target_ms of a task that has no row in the existing baseline, or a new target for
//                   one that has (repeatable).
// `commit`, `date` (its calendar day) and `environment` come from the results file. Row order follows the
// existing baseline, new rows come last in the results file's order.
// Exit codes: 0 = written, 2 = usage or harness error (an unknown flag, a missing <results.json> or
// --source, an unreadable or malformed input, a task with no existing row and no --target, a --target
// that names no task, an existing row that the results file has no task for). Nothing is written then.
// Runs under Node's native type stripping, no loader.
// tests/unit/bench-record.test.ts proves the output against compare-baseline.ts on the fixtures in
// benchmarks/standalone/fixtures/ (record-*.json).

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Thresholds {
  readonly warning: number;
  readonly failure: number;
  readonly floor_ms?: number;
}

interface Row {
  readonly median_ms: number;
  readonly p99_ms: number;
  readonly target_ms: number;
}

interface Task {
  readonly name: string;
  readonly median_ms: number;
  readonly p99_ms: number;
}

interface CliArgs {
  readonly results: string;
  readonly source: string;
  readonly out: string;
  readonly baseline: string;
  readonly targets: ReadonlyMap<string, number>;
}

const USAGE =
  'usage: node benchmarks/standalone/record-baseline.ts <results.json> --source <run url or id> [--out <file>] [--baseline <file>] [--target <category>:<key>=<ms>]...';

const DEFAULT_BASELINE = fileURLToPath(new URL('../baseline.json', import.meta.url));

/** A bad flag, a missing argument or an unreadable, malformed or inconsistent input: exit 2 with the usage line. */
class UsageError extends Error {}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const OPTIONS = {
  source: { type: 'string' },
  out: { type: 'string' },
  baseline: { type: 'string' },
  target: { type: 'string', multiple: true },
} as const;

function parseCli(argv: readonly string[]): CliArgs {
  const { values, positionals } = (() => {
    try {
      return parseArgs({ args: [...argv], options: OPTIONS, strict: true, allowPositionals: true });
    } catch (err: unknown) {
      throw new UsageError(err instanceof Error ? err.message : String(err), { cause: err });
    }
  })();
  const [results, ...extra] = positionals;
  if (results === undefined) throw new UsageError('missing <results.json>');
  if (extra.length > 0) throw new UsageError(`unexpected argument ${extra[0]}`);
  if (values.source === undefined || values.source.trim() === '') {
    throw new UsageError('missing --source <run url or id>');
  }
  const targets = new Map<string, number>();
  for (const spec of values.target ?? []) {
    const at = spec.lastIndexOf('=');
    const key = spec.slice(0, at);
    const ms = Number(spec.slice(at + 1));
    if (at < 1 || !key.includes(':') || spec.slice(at + 1).trim() === '' || !(ms > 0)) {
      throw new UsageError(`--target ${spec}: expected <category>:<key>=<ms> with ms > 0`);
    }
    targets.set(key, ms);
  }
  return {
    results: resolve(results),
    source: values.source.trim(),
    out: resolve(values.out ?? DEFAULT_BASELINE),
    baseline: resolve(values.baseline ?? DEFAULT_BASELINE),
    targets,
  };
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf-8'));
  } catch (err: unknown) {
    throw new UsageError(
      `cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  if (!isRecord(parsed)) throw new UsageError(`${path}: expected a JSON object`);
  return parsed;
}

/** The results file's tasks, in file order; each needs finite median_ms and p99_ms. */
function readTasks(path: string, file: Record<string, unknown>): Task[] {
  if (!isRecord(file.tasks) || Object.keys(file.tasks).length === 0) {
    throw new UsageError(`${path}: expected a non-empty "tasks" object`);
  }
  return Object.entries(file.tasks).map(([name, task]) => {
    if (!isRecord(task) || !isFiniteNumber(task.median_ms) || !isFiniteNumber(task.p99_ms)) {
      throw new UsageError(`${path}: task "${name}" needs a finite median_ms and p99_ms`);
    }
    if (!name.includes(':'))
      throw new UsageError(`${path}: task "${name}" is not <category>:<key>`);
    return { name, median_ms: task.median_ms, p99_ms: task.p99_ms };
  });
}

function readThresholds(path: string, file: Record<string, unknown>): Thresholds {
  const t = file.regressionThresholds;
  if (
    !isRecord(t) ||
    !isFiniteNumber(t.warning) ||
    !isFiniteNumber(t.failure) ||
    (t.floor_ms !== undefined && !isFiniteNumber(t.floor_ms))
  ) {
    throw new UsageError(
      `${path}: expected "regressionThresholds" with numeric warning and failure`,
    );
  }
  return t.floor_ms === undefined
    ? { warning: t.warning, failure: t.failure }
    : { warning: t.warning, failure: t.failure, floor_ms: t.floor_ms };
}

/** The existing rows' target_ms by `<category>:<key>`, in file order. */
function readExistingTargets(path: string, file: Record<string, unknown>): Map<string, number> {
  if (!isRecord(file.benchmarks)) throw new UsageError(`${path}: expected a "benchmarks" object`);
  const targets = new Map<string, number>();
  for (const [category, entries] of Object.entries(file.benchmarks)) {
    if (!isRecord(entries)) continue;
    for (const [key, entry] of Object.entries(entries)) {
      if (isRecord(entry) && isFiniteNumber(entry.target_ms)) {
        targets.set(`${category}:${key}`, entry.target_ms);
      } else {
        throw new UsageError(`${path}: row "${category}:${key}" has no finite target_ms`);
      }
    }
  }
  return targets;
}

const percent = (fraction: number): string => `${Number((fraction * 100).toFixed(2))} %`;

/** The note, rewritten at each re-record (present tense, D93). */
function buildNote(args: {
  readonly source: string;
  readonly environment: Record<string, unknown>;
  readonly thresholds: Thresholds;
}): string {
  const { source, environment, thresholds } = args;
  const text = (key: string): string => String(environment[key] ?? 'unknown');
  const runner = [text('runner'), text('runnerImageVersion')].join(' image ');
  const floor =
    thresholds.floor_ms === undefined
      ? 'no floor'
      : `a floor of ${thresholds.floor_ms} ms (a baseline median below it is reported, not compared)`;
  return [
    `The medians are the median of the harness's 5 runs' p50 (D93), recorded from ${source} on ${runner} (${text('cpu')}, ${text('cpuCount')} cores) with Node ${text('node')}.`,
    `The compare warns above ${percent(thresholds.warning)} and fails above ${percent(thresholds.failure)} of regression, with ${floor}; a median above target_ms fails.`,
    'Runner noise is a coarse tripwire, not a verdict, until the 1.9 CodSpeed gate. This note is rewritten at each re-record by benchmarks/standalone/record-baseline.ts.',
  ].join(' ');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const args = parseCli(argv);
  const resultsFile = await readJson(args.results);
  const baselineFile = await readJson(args.baseline);
  const tasks = readTasks(args.results, resultsFile);
  const thresholds = readThresholds(args.baseline, baselineFile);
  const existing = readExistingTargets(args.baseline, baselineFile);

  if (typeof resultsFile.commit !== 'string' || typeof resultsFile.date !== 'string') {
    throw new UsageError(`${args.results}: expected string "commit" and "date"`);
  }
  const day = /^\d{4}-\d{2}-\d{2}/.exec(resultsFile.date)?.[0];
  if (day === undefined) {
    throw new UsageError(`${args.results}: "date" is not an ISO date: ${resultsFile.date}`);
  }
  if (!isRecord(resultsFile.environment)) {
    throw new UsageError(`${args.results}: expected an "environment" object`);
  }

  const names = new Set(tasks.map((task) => task.name));
  for (const key of args.targets.keys()) {
    if (!names.has(key)) throw new UsageError(`--target ${key}: the results file has no such task`);
  }
  const unmeasured = [...existing.keys()].filter((key) => !names.has(key));
  if (unmeasured.length > 0) {
    throw new UsageError(
      `${args.results} has no task for the existing row(s) ${unmeasured.join(', ')}: a re-record never drops a row silently`,
    );
  }
  const untargeted = tasks.filter((t) => !existing.has(t.name) && !args.targets.has(t.name));
  if (untargeted.length > 0) {
    throw new UsageError(
      `no existing row in ${args.baseline} for ${untargeted.map((t) => t.name).join(', ')}: pass --target ${untargeted[0]?.name}=<ms> for each`,
    );
  }

  // Existing rows keep their file order, new ones follow in the results file's order
  const order = [...existing.keys(), ...tasks.map((t) => t.name).filter((n) => !existing.has(n))];
  const byName = new Map(tasks.map((task) => [task.name, task]));
  const benchmarks: Record<string, Record<string, Row>> = {};
  for (const name of order) {
    const task = byName.get(name) as Task;
    const [category = '', key = ''] = name.split(/:(.*)/s);
    const rows = benchmarks[category] ?? {};
    benchmarks[category] = rows;
    rows[key] = {
      median_ms: task.median_ms,
      p99_ms: task.p99_ms,
      target_ms: (args.targets.get(name) ?? existing.get(name)) as number,
    };
  }

  const document = {
    ...(typeof baselineFile.version === 'string' ? { version: baselineFile.version } : {}),
    date: day,
    commit: resultsFile.commit,
    source: args.source,
    note: buildNote({ source: args.source, environment: resultsFile.environment, thresholds }),
    environment: resultsFile.environment,
    regressionThresholds: thresholds,
    benchmarks,
  };
  await writeFile(args.out, `${JSON.stringify(document, null, 2)}\n`);
  console.log(
    `recorded ${tasks.length} rows from ${args.results} (commit ${resultsFile.commit.slice(0, 7)}, ${day}) into ${args.out}`,
  );
  return 0;
}

try {
  process.exitCode = await main();
} catch (err: unknown) {
  if (err instanceof UsageError) {
    console.error(`record-baseline: ${err.message}\n${USAGE}`);
  } else {
    console.error('record-baseline harness error:', err);
  }
  process.exitCode = 2;
}
