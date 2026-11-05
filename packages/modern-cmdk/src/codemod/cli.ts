#!/usr/bin/env node

/// <reference types="node" />
// The package tsconfig loads no @types implicitly; this types the node: imports below.
// modern-cmdk — Codemod CLI entry point
// Usage: modern-cmdk <transform> <glob|dir> [--dry-run] [--strict|--lenient] [--force] [--concurrency=N]
//        modern-cmdk --help | --version
//   e.g. npx modern-cmdk import-rewrite "./src/**/*.tsx"   or   npx modern-cmdk import-rewrite ./src
// Available transforms: import-rewrite, data-attrs, forward-ref, should-filter
//
// Two program profiles share this file (CliDeps.program): the deprecated `modern-cmdk` bin runs
// lenient unless --strict is given; `modern-cmdk-codemod` runs strict unless --lenient is given.
//
// Exit codes. Lenient mode (the 1.x defaults): 0 for --help, missing arguments and per-file
// errors; 1 for an unknown transform, no matching files and an uncaught error. An unknown option
// is ignored with a warning on stderr when both positionals are present (the run carries on as in
// 1.2.2); without them it is a usage error that exits 0. A malformed known option (a flag given a
// value, --concurrency with no value or a dash-led space-form value) is a usage error that exits 0
// and writes nothing, even beside an unknown option. Strict mode (--strict, or the
// modern-cmdk-codemod default): 0 on success, reports included; 1 when any file errored, no file
// matched or the run failed; 2 for any usage error, including an unknown option, and for a refused
// dirty tree. --strict together with --lenient is a usage error that exits 2.
//
// Concurrency. The main thread loads the transform first, so a missing or broken module fails the
// run once (exit 1 in both profiles) before any thread starts. Files are transformed on worker threads (worker.ts, shipped next to this file as
// worker.mjs) when --concurrency is above 1 and no loader is injected through CliDeps.loadTransform;
// with --concurrency=1, or an injected loader (the test seam: a loader's function cannot cross
// into a thread), they run on the main thread. Results are reported in input order either way,
// and writes, the dry-run diff and the summary always happen on the main thread.

import { readFile, writeFile } from 'node:fs/promises';
import { findPackageJSON } from 'node:module';
import { availableParallelism } from 'node:os';
import { relative } from 'node:path';
import { parseArgs, styleText } from 'node:util';
import { Worker } from 'node:worker_threads';
import type { API, FileInfo } from 'jscodeshift';
import { unifiedDiff } from './diff.js';
import { discoverFiles, findDirtyFiles, type Program } from './files.js';
import { runPool } from './pool.js';
import { createApiFactory, type FileOutcome, transformFile, type WorkerInit } from './worker.js';

// --- Transform registry ---------------------------------------------------

const AVAILABLE_TRANSFORMS: Map<string, string> = new Map<string, string>([
  ['import-rewrite', 'Rewrites cmdk imports to modern-cmdk/react'],
  ['data-attrs', 'Converts [cmdk-*] selectors to [data-command-*]'],
  ['forward-ref', 'Removes React.forwardRef wrappers (React 19)'],
  ['should-filter', 'Converts shouldFilter prop to filter'],
]);

type TransformFn = (fileInfo: FileInfo, api: API) => string;

/** What a transform module exports: the script transform, and optionally one for .css/.scss files. */
export interface TransformModule {
  readonly default: TransformFn;
  readonly transformStylesheet?: (source: string, report: (message: string) => void) => string;
}

/**
 * Dynamically import a transform module by name.
 */
async function loadTransform(name: string): Promise<TransformModule> {
  // @vite-ignore: the bundled bin resolves this next to itself; Vite's dynamic-import-vars
  // rewrite would otherwise prepend a helper import above the shebang when tests load this file.
  const mod = await import(/* @vite-ignore */ `./transforms/${name}.mjs`);
  return mod as TransformModule;
}

// --- I/O -------------------------------------------------------------------

/** The two streams the CLI writes to; `process` satisfies this, tests pass collectors. */
export interface CliIo {
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
}

/** Test seam: replace how a transform is loaded (the bundled bin imports `./transforms/<name>.mjs`). */
export interface CliDeps {
  readonly loadTransform?: (name: string) => Promise<TransformModule>;
  /** Which bin is running; `modern-cmdk` until W3-01 flips the default. */
  readonly program?: Program;
}

const NODE_FLOOR_LINES: Record<Program, string> = {
  // A documented fact, not an engines field: modern-cmdk declares none (D14), so the bin cannot refuse an older Node.
  'modern-cmdk':
    "Node >= 26.4.0 (the floor modern-cmdk's toolchain and create-modern-cmdk declare; modern-cmdk itself declares no engines)",
  'modern-cmdk-codemod':
    'Node >= 26.4.0 (the floor of the modern-cmdk toolchain and create-modern-cmdk)',
};

function usageText(stream: NodeJS.WritableStream, program: Program): string {
  const bold = (s: string): string => styleText('bold', s, { stream });
  const opt = (s: string): string => styleText('cyan', s.padEnd(17), { stream });
  const profile =
    program === 'modern-cmdk'
      ? [
          'modern-cmdk (this bin) is deprecated. It runs with --lenient unless --strict is given.',
          'Use: npx modern-cmdk-codemod <transform> <glob|dir>',
        ]
      : [
          'modern-cmdk-codemod runs with --strict unless --lenient is given. A strict run without --dry-run',
          'refuses to write into a git tree with uncommitted changes (or outside a git tree) unless --force is given.',
        ];
  return [
    `${bold('Usage:')} ${program} <transform> <glob|dir> [options]`,
    '',
    ...profile,
    '',
    bold('Transforms:'),
    ...AVAILABLE_TRANSFORMS.entries()
      .map(([name, description]) => `  ${opt(name)}${description}`)
      .toArray(),
    '',
    bold('Options:'),
    `  ${opt('--dry-run')}List the files that would change; write nothing`,
    `  ${opt('--strict')}Exit 2 on usage errors (incl. unknown options), 1 on file errors`,
    `  ${opt('--concurrency=N')}Files processed at once (default: min(8, available cores))`,
    `  ${opt('-h, --help')}Show this help`,
    `  ${opt('--lenient')}Keep the lenient exit codes below (cannot be combined with --strict)`,
    `  ${opt('--force')}Skip the clean-git-tree check (modern-cmdk-codemod only; modern-cmdk ignores it)`,
    `  ${opt('-v, --version')}Print the package name and version`,
    '',
    bold('Exit codes:'),
    '  strict   0 success (reports included); 1 a file errored, no file matched or the run failed;',
    '           2 usage error (unknown or malformed option, unknown transform, missing argument,',
    '           --strict with --lenient) or a refused dirty tree',
    '  lenient  0 for --help, missing arguments, usage errors and per-file errors; 1 for an unknown',
    '           transform, no matching files and an uncaught error',
    '',
    'Files run on worker threads when --concurrency is above 1; --concurrency=1 runs them on the main thread.',
    'A directory argument covers its .ts .tsx .mts .cts .js .jsx .mjs .cjs .css .scss files.',
    '--dry-run also prints a unified diff of every file that would change.',
    '',
    NODE_FLOOR_LINES[program],
    '',
  ].join('\n');
}

async function readNameAndVersion(): Promise<string> {
  const path = findPackageJSON(import.meta.url);
  if (path === undefined) throw new Error("cannot find this package's package.json");
  const pkg = JSON.parse(await readFile(path, 'utf-8')) as { name: string; version: string };
  return `${pkg.name} ${pkg.version}`;
}

// --- Argument parsing ------------------------------------------------------

type Parsed =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | {
      readonly kind: 'usage-error';
      /** `undefined` for missing arguments: usage alone, no error line. */
      readonly message: string | undefined;
      readonly strict: boolean;
    }
  | {
      readonly kind: 'run';
      readonly transformName: string;
      readonly fileGlob: string;
      readonly dryRun: boolean;
      readonly force: boolean;
      readonly strict: boolean;
      readonly concurrency: number;
      /** Unknown options that were ignored (never when strict); run() warns about each. */
      readonly ignored: readonly string[];
    };

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  strict: { type: 'boolean' },
  lenient: { type: 'boolean' },
  force: { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  concurrency: { type: 'string' },
} as const;

interface CliValues {
  readonly help?: string | boolean | undefined;
  readonly version?: string | boolean | undefined;
  readonly strict?: string | boolean | undefined;
  readonly lenient?: string | boolean | undefined;
  readonly force?: string | boolean | undefined;
  readonly 'dry-run'?: string | boolean | undefined;
  readonly concurrency?: string | boolean | undefined;
}

function parse(argv: readonly string[], program: Program): Parsed {
  // Flags before a lone `--`; a parse failure yields no values, so argv is the only source then.
  const terminator = argv.indexOf('--');
  const head = terminator === -1 ? argv : argv.slice(0, terminator);
  if (head.includes('--strict') && head.includes('--lenient')) {
    return {
      kind: 'usage-error',
      message: '--strict and --lenient cannot be combined',
      strict: true,
    };
  }
  const codemodProfile = program === 'modern-cmdk-codemod';
  const strictArg = head.includes('--strict') || (codemodProfile && !head.includes('--lenient'));

  let values: CliValues;
  let positionals: string[];
  let ignored: string[] = [];
  try {
    ({ values, positionals } = parseCli(argv));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
      return {
        kind: 'usage-error',
        message: err instanceof Error ? err.message : String(err),
        strict: strictArg,
      };
    }
    // Re-parse loosely: unknown options become option tokens, everything else parses as before.
    const loose = parseArgs({
      args: [...argv],
      options: OPTIONS,
      allowPositionals: true,
      strict: false,
      tokens: true,
    });
    ignored = loose.tokens
      .filter((t) => t.kind === 'option' && !Object.hasOwn(OPTIONS, t.name))
      .map((t) => (t as { rawName: string }).rawName);
    const badValue = loose.tokens.find(
      (t) =>
        t.kind === 'option' &&
        Object.hasOwn(OPTIONS, t.name) &&
        (OPTIONS[t.name as keyof typeof OPTIONS].type === 'boolean'
          ? t.value !== undefined
          : t.value === undefined ||
            (!t.inlineValue && t.value.length > 1 && t.value.startsWith('-'))),
    );
    const badMessage =
      badValue?.kind === 'option'
        ? badValue.value === undefined
          ? `Option '${badValue.rawName} <value>' argument missing`
          : OPTIONS[badValue.name as keyof typeof OPTIONS].type === 'boolean'
            ? `Option '${badValue.rawName}' does not take an argument`
            : `Option '${badValue.rawName}' argument is ambiguous.\nDid you forget to specify the option argument for '${badValue.rawName}'?\nTo specify an option argument starting with a dash use '${badValue.rawName}=-XYZ'.`
        : undefined;
    if (badMessage !== undefined) {
      return { kind: 'usage-error', message: badMessage, strict: strictArg };
    }
    if (
      strictArg ||
      loose.values.help === true ||
      loose.values.version === true ||
      loose.positionals.length < 2
    ) {
      return { kind: 'usage-error', message: `unknown option ${ignored[0]}`, strict: strictArg };
    }
    values = loose.values;
    positionals = loose.positionals;
  }

  const strict = values.strict === true || (values.lenient !== true && codemodProfile);
  if (values.help) return { kind: 'help' };
  if (values.version) return { kind: 'version' };
  if (positionals.length < 2) {
    return { kind: 'usage-error', message: undefined, strict };
  }
  if (strict && positionals.length > 2) {
    return {
      kind: 'usage-error',
      message: `unexpected argument "${positionals[2]}" (quote the glob so the shell does not expand it)`,
      strict,
    };
  }

  let concurrency = defaultConcurrency();
  if (values.concurrency !== undefined) {
    if (typeof values.concurrency !== 'string' || !/^[1-9]\d*$/.test(values.concurrency)) {
      return {
        kind: 'usage-error',
        message: `--concurrency must be a positive integer, got "${String(values.concurrency)}"`,
        strict,
      };
    }
    concurrency = Number.parseInt(values.concurrency, 10);
  }

  return {
    kind: 'run',
    transformName: positionals[0] as string,
    fileGlob: positionals[1] as string,
    dryRun: values['dry-run'] === true,
    force: values.force === true,
    strict,
    concurrency,
    ignored,
  };
}

/** The default for --concurrency: one file per core, at most 8. */
export function defaultConcurrency(cores: number = availableParallelism()): number {
  return Math.min(8, cores);
}

function parseCli(argv: readonly string[]): {
  readonly values: CliValues;
  readonly positionals: string[];
} {
  return parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
}

// --- Concurrent file processing ---------------------------------------------

interface TransformResult {
  readonly filePath: string;
  readonly status: 'changed' | 'unchanged' | 'skipped' | 'error';
  /** The unified diff, for a changed file under --dry-run. */
  readonly diff?: string;
  /** One entry per `api.report` call (or stylesheet `report`) the transform made. */
  readonly reports: readonly string[];
  readonly error?: Error;
}

/** Turns a path into its outcome: in-process, or on a worker thread. */
type Transformer = (filePath: string) => Promise<FileOutcome>;

/** Write a changed file (or build its dry-run diff) on the main thread and fold the outcome into a result. */
async function finish(
  outcome: FileOutcome,
  dryRun: boolean,
  rel: (path: string) => string,
): Promise<TransformResult> {
  const { path: filePath, reports } = outcome;
  if (outcome.error !== undefined) {
    return { filePath, status: 'error', reports, error: new Error(outcome.error) };
  }
  if (outcome.skipped) return { filePath, status: 'skipped', reports };
  if (!outcome.changed) return { filePath, status: 'unchanged', reports };
  try {
    const output = outcome.output as string;
    if (!dryRun) await writeFile(filePath, output, 'utf-8');
    return {
      filePath,
      status: 'changed',
      ...(dryRun ? { diff: unifiedDiff(rel(filePath), outcome.source as string, output) } : {}),
      reports,
    };
  } catch (err) {
    return {
      filePath,
      status: 'error',
      reports,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

interface Slot {
  readonly worker: Worker;
  /** Set once the thread failed or exited; every later file given to it fails with this. */
  dead?: Error;
}

/** Start `size` worker threads for `transform`; the transformer hands each file to an idle one. */
function startWorkers(
  transform: string,
  keepSource: boolean,
  size: number,
): { readonly transformer: Transformer; readonly close: () => Promise<void> } {
  const init: WorkerInit = { kind: 'modern-cmdk-codemod-worker', transform, keepSource };
  const slots: Slot[] = Array.from({ length: size }, () => ({
    worker: new Worker(new URL('./worker.mjs', import.meta.url), { workerData: init }),
  }));
  const pending = new Map<Slot, PromiseWithResolvers<FileOutcome>>();
  for (const slot of slots) {
    const fail = (error: Error): void => {
      slot.dead ??= error;
      pending.get(slot)?.reject(slot.dead);
    };
    slot.worker.on('message', (outcome: FileOutcome) => pending.get(slot)?.resolve(outcome));
    slot.worker.on('error', fail);
    slot.worker.on('exit', (code) => fail(new Error(`worker thread exited with code ${code}`)));
  }
  // runPool never runs more than `size` files at once, so an idle slot is always there.
  const idle = [...slots];
  const transformer: Transformer = async (filePath: string): Promise<FileOutcome> => {
    const slot = idle.pop() as Slot;
    try {
      if (slot.dead !== undefined) throw slot.dead;
      const request = Promise.withResolvers<FileOutcome>();
      pending.set(slot, request);
      slot.worker.postMessage(filePath);
      return await request.promise;
    } finally {
      pending.delete(slot);
      idle.push(slot);
    }
  };
  return {
    transformer,
    close: async (): Promise<void> => {
      await Promise.all(slots.map((slot) => slot.worker.terminate()));
    },
  };
}

// --- Main ------------------------------------------------------------------

/** The message for a refused dirty-tree run: up to 10 paths, the count, and the way out. */
function dirtyMessage(paths: readonly string[], rel: (path: string) => string): string {
  const shown = paths.slice(0, 10).map((p) => `  ${rel(p)}`);
  const more = paths.length > shown.length ? [`  ... and ${paths.length - shown.length} more`] : [];
  return [
    `refusing to write: ${paths.length} matched file${paths.length === 1 ? ' has' : 's have'} uncommitted changes:`,
    ...shown,
    ...more,
    'Commit or stash them, or pass --force to write anyway (--dry-run previews without writing).',
  ].join('\n');
}

/**
 * Run the codemod CLI. Resolves to the process exit code; writes only to `io`.
 */
export async function run(argv: readonly string[], io: CliIo, deps: CliDeps = {}): Promise<number> {
  const out = (s: string): void => void io.stdout.write(`${s}\n`);
  const err = (s: string): void => void io.stderr.write(`${s}\n`);
  const fail = (s: string): void =>
    err(`${styleText('red', 'error:', { stream: io.stderr })} ${s}`);
  const program = deps.program ?? 'modern-cmdk';

  try {
    const parsed = parse(argv, program);

    if (parsed.kind === 'help') {
      out(usageText(io.stdout, program));
      return 0;
    }
    if (parsed.kind === 'version') {
      out(await readNameAndVersion());
      return 0;
    }
    if (parsed.kind === 'usage-error') {
      // Lenient: missing arguments (and an unknown option without both positionals) exit 0; strict: 2.
      if (parsed.message !== undefined) fail(parsed.message);
      err(usageText(io.stderr, program));
      return parsed.strict ? 2 : 0;
    }

    const { transformName, fileGlob, dryRun, force, strict, concurrency, ignored } = parsed;
    for (const name of ignored) {
      err(`warning: unknown option ${name} ignored (--strict makes this exit 2)`);
    }

    if (!AVAILABLE_TRANSFORMS.has(transformName)) {
      fail(
        `unknown transform "${transformName}". Valid transforms: ${[...AVAILABLE_TRANSFORMS.keys()].join(', ')}`,
      );
      return strict ? 2 : 1;
    }

    const cwd = process.cwd();
    const files = await discoverFiles([fileGlob], { program, cwd, warn: err });

    if (files.length === 0) {
      fail(`no files matched "${fileGlob}"`);
      return 1;
    }

    const rel = (p: string): string => relative(cwd, p).replaceAll('\\', '/');

    if (program === 'modern-cmdk-codemod' && strict && !dryRun && !force) {
      const dirty = await findDirtyFiles(files, cwd);
      if (dirty.kind === 'outside') {
        const n = dirty.paths.length;
        const shown = dirty.paths.slice(0, 10).map((p) => `  ${rel(p)}`);
        fail(
          [
            `refusing to write: ${n} matched file${n === 1 ? ' lies' : 's lie'} outside this git work tree:`,
            ...shown,
            ...(n > shown.length ? [`  ... and ${n - shown.length} more`] : []),
            'Run the codemod from that tree, or pass --force to write anyway.',
          ].join('\n'),
        );
        return 2;
      }
      if (dirty.kind === 'dirty') {
        fail(dirtyMessage(dirty.paths, rel));
        return 2;
      }
      if (dirty.kind !== 'clean') {
        fail(
          dirty.kind === 'no-git'
            ? 'refusing to write: git not found, so a clean tree cannot be confirmed. Pass --force to write anyway.'
            : 'refusing to write outside a git work tree: nothing could undo it. Pass --force to write anyway.',
        );
        return 2;
      }
    }

    // The main thread always loads the transform first: a missing or broken module fails the run here
    // (outer catch, exit 1 in both profiles, as in 1.4) before any worker thread starts.
    const mod = await (deps.loadTransform ?? loadTransform)(transformName);
    let transformer: Transformer;
    let closeWorkers: () => Promise<void> = async (): Promise<void> => {};
    if (concurrency > 1 && deps.loadTransform === undefined) {
      ({ transformer, close: closeWorkers } = startWorkers(
        transformName,
        dryRun,
        Math.min(concurrency, files.length),
      ));
    } else {
      const apiForParser = createApiFactory();
      transformer = (filePath: string): Promise<FileOutcome> =>
        transformFile(filePath, mod, apiForParser, dryRun);
    }

    let settled: PromiseSettledResult<TransformResult>[];
    try {
      settled = await runPool(files, concurrency, async (filePath) =>
        finish(await transformer(filePath), dryRun, rel),
      );
    } finally {
      await closeWorkers();
    }
    // A transformer rejects only when a worker thread died; that file is an error like any other.
    const results = settled.map(
      (r, i): TransformResult =>
        r.status === 'fulfilled'
          ? r.value
          : {
              filePath: files[i] as string,
              status: 'error',
              reports: [],
              error: r.reason instanceof Error ? r.reason : new Error(String(r.reason)),
            },
    );

    const counts = { changed: 0, unchanged: 0, skipped: 0, error: 0, reported: 0 };
    for (const r of results) {
      counts[r.status]++;
      counts.reported += r.reports.length;
      for (const message of r.reports) err(`${rel(r.filePath)}: ${message}`);
      if (r.error) {
        err(`${rel(r.filePath)}: ${r.error.message}`);
      } else if (r.status === 'changed') {
        const verb = styleText('green', dryRun ? 'would change' : 'changed', {
          stream: io.stdout,
        });
        out(`${verb} ${rel(r.filePath)}`);
        if (r.diff) out(r.diff);
      }
    }
    out(
      `${counts.changed} changed, ${counts.unchanged} unchanged, ${counts.error} errors` +
        (counts.skipped > 0 ? `, ${counts.skipped} skipped` : '') +
        (counts.reported > 0 ? `, ${counts.reported} reported` : '') +
        (dryRun ? ' (dry run, nothing written)' : ''),
    );

    return strict && counts.error > 0 ? 1 : 0;
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await run(process.argv.slice(2), process);
}
