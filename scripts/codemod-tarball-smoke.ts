// scripts/codemod-tarball-smoke.ts
// The tarball exit gate of the codemod split: the PACKED modern-cmdk and modern-cmdk-codemod tarballs are installed
// the way a user gets them and run against a copy of tests/fixtures/codemod-tarball/app.
// Runs with Node's native type stripping:
//
//   node scripts/codemod-tarball-smoke.ts [--pack-dir <dir>] [--modern-cmdk <tgz>] [--codemod <tgz>] [--keep]
//
// --pack-dir picks exactly one modern-cmdk-[0-9]*.tgz and one modern-cmdk-codemod-[0-9]*.tgz from <dir>
// (modern-cmdk-1.2.3.tgz never counts as the codemod tarball). At least one tarball is required. The checks of a
// tarball run only when that tarball is given; the same-diff check runs only when both are given.
// Exit codes: 0 = every check passed, 1 = a check failed, 2 = usage error (bad argv, or a pnpm-workspace.yaml that
// cannot be read, holds a line parseWorkspaceYaml does not support, or has no numeric minimumReleaseAge: main reads it
// before any check runs).
//
// Checks per tarball (each prints one line with its exit code):
//   modern-cmdk: the tarball lists dist/codemod/cli.mjs and dist/codemod/bin.mjs (read in-process with
//     listTarEntries of scripts/check-package.ts, never a host tar); `npm install` of it into a temp dir A; the bin
//     named by A's installed manifest runs `data-attrs src --dry-run` in a copy B of the app: exit 0, exactly one
//     deprecation line on stderr, a diff on stdout, B byte-identical; `--strict --bogus` exits 2.
//   modern-cmdk-codemod: the tarball lists dist/cli.mjs; `npm exec --yes --package <tgz> -- modern-cmdk-codemod`
//     in a fresh copy C (not a git work tree): `--dry-run` exits 0 (and prints the same stdout as the modern-cmdk bin
//     when both tarballs are given); a real run without --force exits 2, names --force and leaves C byte-identical;
//     with --force it exits 0 and C equals tests/fixtures/codemod-tarball/app.expected.
// The codemod tarball is also installed into a temp dir D and its resolved dependency tree is printed. Every npm call
// passes --min-release-age=<the root minimumReleaseAge in days> (npm 12 `min-release-age`), so no dependency younger
// than the repository policy is installed or run; the local tarball itself is never gated.
//
// npm is spawned as `process.execPath <npm-cli.js>` of the npm bundled next to the running Node, with no shell:
// on Windows npm is a .cmd shim that spawn cannot run without a shell (tests/dist/create-tarball.test.ts runs pnpm
// through one command string for that reason), and a shell would also re-parse the temp paths. Every child process
// has a timeout, there are no retries, and the tail of a failed child's output is printed.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { listTarEntries } from './check-package.ts';
import { parseWorkspaceYaml } from './consumer-smoke.ts';

const ROOT = resolve(import.meta.dirname, '..');
const FIXTURE = join(ROOT, 'tests/fixtures/codemod-tarball');
const NPM_TIMEOUT_MS = 300_000;
const NODE_TIMEOUT_MS = 60_000;
const TAIL_LINES = 30;

/** The first line of the deprecated bin's stderr warning (packages/modern-cmdk/src/codemod/bin.ts). */
export const DEPRECATION_PREFIX = 'warning: the modern-cmdk bin is deprecated';

/** A bad command line or an ambiguous pack dir: the script exits 2. */
export class UsageError extends Error {
  override readonly name = 'UsageError';
}

export interface Tarballs {
  readonly modernCmdk: string | undefined;
  readonly codemod: string | undefined;
}

export interface SmokeOptions {
  readonly modernCmdk: string | undefined;
  readonly codemod: string | undefined;
  readonly keep: boolean;
}

/**
 * The root minimumReleaseAge (pnpm-workspace.yaml, minutes) in whole days, rounded up and at least 1: npm's
 * `min-release-age` counts days. A missing or non-numeric key, or a line parseWorkspaceYaml does not support, is a
 * UsageError, never a silent default; main reads it inside its UsageError handling, so the smoke ends in exit 2 with
 * the usage message.
 */
export function minReleaseAgeDays(workspaceYaml: string): number {
  let minutes: unknown;
  try {
    minutes = parseWorkspaceYaml(workspaceYaml).minimumReleaseAge;
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) {
    throw new UsageError('pnpm-workspace.yaml has no numeric minimumReleaseAge');
  }
  return Math.max(1, Math.ceil(minutes / 1440));
}

/** The npm flag that holds every install and exec to the repository's release-age policy. */
export function npmPolicyArgs(days: number): readonly string[] {
  return [`--min-release-age=${days}`];
}

/** The argv of `npm install <tarball>` into an empty project. --omit=peer: `npm help install` lists --omit <dev|optional|peer>. */
export function npmInstallArgs(days: number, tarball: string): readonly string[] {
  return [
    'install',
    '--no-audit',
    '--no-fund',
    '--ignore-scripts',
    '--omit=peer',
    ...npmPolicyArgs(days),
    tarball,
  ];
}

/** The argv of `npm exec` running the codemod's data-attrs transform from the packed tarball, with `extra` appended. */
export function npmExecArgs(
  days: number,
  tarball: string,
  extra: readonly string[],
): readonly string[] {
  return [
    'exec',
    '--yes',
    ...npmPolicyArgs(days),
    '--package',
    tarball,
    '--',
    'modern-cmdk-codemod',
    'data-attrs',
    'src',
    ...extra,
  ];
}

const MODERN_CMDK_TARBALL = /^modern-cmdk-[0-9].*\.tgz$/;
const CODEMOD_TARBALL = /^modern-cmdk-codemod-[0-9].*\.tgz$/;

/** Picks exactly one modern-cmdk-[0-9]*.tgz and one modern-cmdk-codemod-[0-9]*.tgz from `names`; two of a kind, or none at all, is a usage error. */
export function findTarballs(names: readonly string[]): Tarballs {
  const modernCmdk = names.filter((name) => MODERN_CMDK_TARBALL.test(name));
  const codemod = names.filter((name) => CODEMOD_TARBALL.test(name));
  if (modernCmdk.length > 1) {
    throw new UsageError(`more than one modern-cmdk-[0-9]*.tgz: ${modernCmdk.join(', ')}`);
  }
  if (codemod.length > 1) {
    throw new UsageError(`more than one modern-cmdk-codemod-[0-9]*.tgz: ${codemod.join(', ')}`);
  }
  if (modernCmdk.length === 0 && codemod.length === 0) {
    throw new UsageError('no modern-cmdk-[0-9]*.tgz or modern-cmdk-codemod-[0-9]*.tgz found');
  }
  return { modernCmdk: modernCmdk[0], codemod: codemod[0] };
}

/** Parses argv (strict parseArgs) into the tarball paths and --keep; every problem is a UsageError. */
export function parseSmokeArgs(argv: readonly string[]): SmokeOptions {
  let values: {
    'pack-dir'?: string | undefined;
    'modern-cmdk'?: string | undefined;
    codemod?: string | undefined;
    keep?: boolean | undefined;
  };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        'pack-dir': { type: 'string' },
        'modern-cmdk': { type: 'string' },
        codemod: { type: 'string' },
        keep: { type: 'boolean' },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const packDir = values['pack-dir'];
  if (packDir !== undefined) {
    if (values['modern-cmdk'] !== undefined || values.codemod !== undefined) {
      throw new UsageError('--pack-dir cannot be combined with --modern-cmdk or --codemod');
    }
    const dir = resolve(packDir);
    if (!existsSync(dir)) throw new UsageError(`--pack-dir ${dir} does not exist`);
    const found = findTarballs(readdirSync(dir));
    return {
      modernCmdk: found.modernCmdk === undefined ? undefined : join(dir, found.modernCmdk),
      codemod: found.codemod === undefined ? undefined : join(dir, found.codemod),
      keep: values.keep === true,
    };
  }
  const modernCmdk =
    values['modern-cmdk'] === undefined ? undefined : resolve(values['modern-cmdk']);
  const codemod = values.codemod === undefined ? undefined : resolve(values.codemod);
  if (modernCmdk === undefined && codemod === undefined) {
    throw new UsageError('give --pack-dir, or at least one of --modern-cmdk and --codemod');
  }
  for (const file of [modernCmdk, codemod]) {
    if (file !== undefined && !existsSync(file)) throw new UsageError(`${file} does not exist`);
  }
  return { modernCmdk, codemod, keep: values.keep === true };
}

/** Byte-for-byte equality: nothing is trimmed, re-encoded or newline-normalised. */
export function sameOutput(a: string | Uint8Array, b: string | Uint8Array): boolean {
  return Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
}

/** Lines of `stderr` that start with the deprecated bin's warning; a usage text that names npx modern-cmdk-codemod does not count. */
export function countDeprecationLines(stderr: string): number {
  return stderr.split(/\r?\n/).filter((line) => line.startsWith(DEPRECATION_PREFIX)).length;
}

/** The bin path (as the manifest writes it) for `name`, whether `bin` is a string or a map. */
export function resolveBin(
  manifest: { readonly name?: string; readonly bin?: unknown },
  name: string,
): string {
  const { bin } = manifest;
  if (typeof bin === 'string') return bin;
  if (typeof bin === 'object' && bin !== null) {
    const path = (bin as Record<string, unknown>)[name];
    if (typeof path === 'string') return path;
  }
  throw new Error(`the installed manifest has no bin named ${name}`);
}

/** Relative path (forward slashes) to content of every file under `dir`. */
export function snapshotTree(dir: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    files.set(full.slice(dir.length + 1).replaceAll('\\', '/'), readFileSync(full));
  }
  return files;
}

/** Human-readable differences between two snapshots (empty when byte-identical). */
export function diffTrees(
  expected: ReadonlyMap<string, Buffer>,
  actual: ReadonlyMap<string, Buffer>,
): string[] {
  const problems: string[] = [];
  for (const [name, content] of expected) {
    const other = actual.get(name);
    if (other === undefined) problems.push(`missing ${name}`);
    else if (!sameOutput(content, other)) problems.push(`differs ${name}`);
  }
  for (const name of actual.keys()) if (!expected.has(name)) problems.push(`extra ${name}`);
  return problems;
}

/** The npm-cli.js of the npm bundled with the running Node (Windows keeps it next to node.exe, other hosts under ../lib). */
export function bundledNpmCli(execPath: string = process.execPath): string {
  const candidates = [
    join(dirname(execPath), 'node_modules/npm/bin/npm-cli.js'),
    join(dirname(execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found === undefined)
    throw new Error(`no bundled npm-cli.js beside ${execPath}: ${candidates.join(', ')}`);
  return found;
}

interface ChildResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

function runChild(args: readonly string[], cwd: string, timeout: number): ChildResult {
  const result = spawnSync(process.execPath, [...args], {
    cwd,
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
  });
  const timedOut =
    result.error !== undefined && 'code' in result.error && result.error.code === 'ETIMEDOUT';
  if (result.error !== undefined && !timedOut) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, timedOut };
}

function runNpm(args: readonly string[], cwd: string): ChildResult {
  return runChild([bundledNpmCli(), ...args], cwd, NPM_TIMEOUT_MS);
}

function tail(text: string): string {
  return text.trimEnd().split(/\r?\n/).slice(-TAIL_LINES).join('\n');
}

interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly exit: number | string;
  readonly detail: string;
}

class Report {
  readonly checks: Check[] = [];

  add(name: string, ok: boolean, exit: number | null | string, detail = ''): boolean {
    const check = { name, ok, exit: exit ?? 'timeout', detail };
    this.checks.push(check);
    process.stdout.write(`${ok ? 'ok  ' : 'FAIL'} ${name} (exit ${check.exit})\n`);
    if (!ok && detail !== '') process.stdout.write(`${detail.replace(/^/gm, '       ')}\n`);
    return ok;
  }

  /** A check on a child: passes when it exited with `want` and `extra` (if any) holds; on failure the output tail is printed. */
  child(
    name: string,
    result: ChildResult,
    want: number,
    problems: readonly string[] = [],
  ): boolean {
    const ok = !result.timedOut && result.status === want && problems.length === 0;
    const detail = ok
      ? ''
      : [
          ...(result.timedOut ? ['timed out'] : []),
          ...(result.status !== want ? [`expected exit ${want}`] : []),
          ...problems,
          `stdout tail:\n${tail(result.stdout)}`,
          `stderr tail:\n${tail(result.stderr)}`,
        ].join('\n');
    return this.add(name, ok, result.timedOut ? 'timeout' : result.status, detail);
  }
}

function tarballEntries(file: string): Map<string, Buffer> {
  return new Map(listTarEntries(readFileSync(file)).map((entry) => [entry.name, entry.data]));
}

function listsAll(report: Report, label: string, file: string, wanted: readonly string[]): boolean {
  const names = tarballEntries(file);
  const missing = wanted.filter((name) => !names.has(name));
  return report.add(
    `${label} tarball lists ${wanted.map((n) => n.replace('package/', '')).join(' and ')}`,
    missing.length === 0,
    0,
    `missing: ${missing.join(', ')}`,
  );
}

/** Copies the fixture app into a new temp dir under `parent` and returns it. */
async function copyApp(parent: string, name: string): Promise<string> {
  const target = join(parent, name);
  await cp(join(FIXTURE, 'app'), target, { recursive: true });
  return target;
}

async function smokeModernCmdk(
  report: Report,
  tarball: string,
  work: string,
  days: number,
): Promise<string | undefined> {
  listsAll(report, 'modern-cmdk', tarball, [
    'package/dist/codemod/cli.mjs',
    'package/dist/codemod/bin.mjs',
  ]);
  const installDir = join(work, 'A');
  await makeProject(installDir);
  const install = runNpm(npmInstallArgs(days, tarball), installDir);
  if (!report.child('npm install modern-cmdk tarball', install, 0)) return undefined;

  const manifest = JSON.parse(
    readFileSync(join(installDir, 'node_modules/modern-cmdk/package.json'), 'utf8'),
  ) as {
    bin?: unknown;
  };
  const bin = join(installDir, 'node_modules/modern-cmdk', resolveBin(manifest, 'modern-cmdk'));
  const app = await copyApp(work, 'B');
  const before = snapshotTree(app);
  const dry = runChild([bin, 'data-attrs', 'src', '--dry-run'], app, NODE_TIMEOUT_MS);
  const deprecations = countDeprecationLines(dry.stderr);
  report.child('modern-cmdk bin data-attrs src --dry-run', dry, 0, [
    ...(deprecations === 1 ? [] : [`expected 1 deprecation line on stderr, found ${deprecations}`]),
    ...(/^--- /m.test(dry.stdout) && /^\+\+\+ /m.test(dry.stdout) ? [] : ['stdout holds no diff']),
    ...diffTrees(before, snapshotTree(app)).map((problem) => `the dry run changed B: ${problem}`),
  ]);
  const bogus = runChild([bin, '--strict', '--bogus'], app, NODE_TIMEOUT_MS);
  report.child('modern-cmdk bin --strict --bogus', bogus, 2);
  return dry.status === 0 ? dry.stdout : undefined;
}

/** An empty project (just a private package.json) for npm to install a tarball into. */
async function makeProject(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'package.json'), '{"private":true}\n');
}

async function smokeCodemod(
  report: Report,
  tarball: string,
  work: string,
  bundledStdout: string | undefined,
  days: number,
): Promise<void> {
  listsAll(report, 'modern-cmdk-codemod', tarball, ['package/dist/cli.mjs']);
  const app = await copyApp(work, 'C');
  const before = snapshotTree(app);
  const exec = (extra: readonly string[]): ChildResult =>
    runNpm(npmExecArgs(days, tarball, extra), app);

  const dry = exec(['--dry-run']);
  const dryProblems = [
    ...diffTrees(before, snapshotTree(app)).map((problem) => `the dry run changed C: ${problem}`),
    ...(bundledStdout === undefined || sameOutput(bundledStdout, dry.stdout)
      ? []
      : ['stdout differs from the modern-cmdk bin dry run']),
  ];
  report.child('npm exec modern-cmdk-codemod data-attrs src --dry-run', dry, 0, dryProblems);
  if (bundledStdout !== undefined) {
    report.add(
      'same diff from the modern-cmdk bin and npm exec modern-cmdk-codemod',
      sameOutput(bundledStdout, dry.stdout),
      dry.status,
    );
  }

  const refused = exec([]);
  report.child('npm exec modern-cmdk-codemod (real run, no --force, not a git tree)', refused, 2, [
    ...(`${refused.stdout}${refused.stderr}`.includes('--force')
      ? []
      : ['output does not name --force']),
    ...diffTrees(before, snapshotTree(app)).map(
      (problem) => `the refused run changed C: ${problem}`,
    ),
  ]);

  const forced = exec(['--force']);
  report.child('npm exec modern-cmdk-codemod (real run, --force)', forced, 0, [
    ...diffTrees(snapshotTree(join(FIXTURE, 'app.expected')), snapshotTree(app)).map(
      (problem) => `C vs app.expected: ${problem}`,
    ),
  ]);

  // The resolved tree, so every transitive dependency npm resolved under --min-release-age is seen.
  const treeDir = join(work, 'D');
  await makeProject(treeDir);
  const install = runNpm(npmInstallArgs(days, tarball), treeDir);
  if (report.child('npm install modern-cmdk-codemod tarball', install, 0)) {
    const lock = JSON.parse(
      readFileSync(join(treeDir, 'node_modules/.package-lock.json'), 'utf8'),
    ) as {
      packages: Record<string, { version?: string }>;
    };
    const resolved = Object.entries(lock.packages)
      .map(([path, info]) => `${path.replace(/^node_modules\//, '')}@${info.version ?? '?'}`)
      .sort();
    process.stdout.write(
      `resolved tree of modern-cmdk-codemod (${resolved.length} packages):\n${resolved.map((line) => `  ${line}`).join('\n')}\n`,
    );
  }
}

/**
 * Runs the selected checks; the exit code is 0 when all pass, 1 otherwise. `days` is the root minimumReleaseAge in
 * days (minReleaseAgeDays), computed by main so a bad workspace file is a usage error before anything runs.
 */
export async function runSmoke(options: SmokeOptions, days: number): Promise<number> {
  const work = await mkdtemp(join(tmpdir(), 'modern-cmdk-codemod-smoke-'));
  const report = new Report();
  try {
    let bundledStdout: string | undefined;
    if (options.modernCmdk !== undefined)
      bundledStdout = await smokeModernCmdk(report, options.modernCmdk, work, days);
    if (options.codemod !== undefined) {
      await smokeCodemod(
        report,
        options.codemod,
        work,
        options.modernCmdk === undefined ? undefined : bundledStdout,
        days,
      );
    }
    if (
      options.modernCmdk !== undefined &&
      options.codemod !== undefined &&
      bundledStdout === undefined
    ) {
      report.add(
        'same diff from the modern-cmdk bin and npm exec modern-cmdk-codemod',
        false,
        'n/a',
        'the modern-cmdk bin dry run produced no output to compare',
      );
    }
  } finally {
    if (options.keep) process.stdout.write(`kept ${work}\n`);
    else await rm(work, { recursive: true, force: true });
  }
  const failed = report.checks.filter((check) => !check.ok);
  process.stdout.write(
    `${report.checks.length - failed.length}/${report.checks.length} checks passed\n`,
  );
  return failed.length === 0 ? 0 : 1;
}

const USAGE =
  'usage: node scripts/codemod-tarball-smoke.ts [--pack-dir <dir>] [--modern-cmdk <tgz>] [--codemod <tgz>] [--keep]';

/**
 * Parses `argv`, reads the release age from `workspaceFile` (the root pnpm-workspace.yaml by default), runs the smoke
 * and returns the exit code (0 pass, 1 check failed, 2 usage error: bad argv, an unreadable `workspaceFile`, an
 * unsupported line in it, or no numeric minimumReleaseAge).
 */
export async function main(
  argv: readonly string[],
  workspaceFile: string = resolve(import.meta.dirname, '../pnpm-workspace.yaml'),
): Promise<number> {
  let options: SmokeOptions;
  let days: number;
  try {
    options = parseSmokeArgs(argv);
    const text = await readFile(workspaceFile, 'utf8').catch((error: Error) => {
      throw new UsageError(`cannot read ${workspaceFile}: ${error.message}`);
    });
    days = minReleaseAgeDays(text);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${basename(import.meta.filename)}: ${error.message}\n${USAGE}\n`);
    return 2;
  }
  return runSmoke(options, days);
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
