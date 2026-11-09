// scripts/consumer-smoke.ts
// The consumer matrix: Next.js App Router (RSC; Turbopack and webpack) and Vite 8 SSR apps built
// from the PACKED modern-cmdk tarball, checked for the core copy count, SSR output and hydration.
// Runs with Node's native type stripping:
//
//   node scripts/consumer-smoke.ts [--app next-turbopack|next-webpack|vite|all] [--tarball <tgz>]
//        [--expect-core-copies <n>] [--report <file>] [--keep]
//
// Exit codes: 0 = every variant passed, 1 = a variant failed, 2 = usage error. The default exit
// codes of the shipped CLIs are unaffected: this is a repository tool, not a shipped one.
//
// Per variant:
//   1. tarball: --tarball, or `pnpm --filter modern-cmdk pack` (never builds; a missing
//      packages/modern-cmdk/dist/react/index.mjs exits 1 with 'run pnpm build');
//   2. the app under tests/consumers/<app> is copied into os.tmpdir()/modern-cmdk-consumer-<variant>-*
//      and gets dependencies['modern-cmdk'] = file:<tarball>;
//   3. pnpm-workspace.yaml in the copy: packages ['.'], the root file's supply-chain keys read now
//      (never packages or overrides) and the app's release-age-exclude.json entries, each spec once;
//   4. pnpm install; then `require.resolve('modern-cmdk/package.json')` in the copy (the './package.json'
//      export; it must print a path inside node_modules/modern-cmdk); for vite the app's pinned
//      TypeScript, `tsc --noEmit -p .` (next type-checks inside `next build`); then the build
//      (next build | next build --webpack | two vite builds, run directly, never the app's build script);
//   5. core copies, counted in client JS only (.next/static/**/*.js; vite: dist/client/assets/**/*.js);
//   6. serve (next start on a free port; vite: a node:http server in this process that renders
//      dist/server/entry-server.js into dist/client/index.html) and fetch the HTML;
//   7. chromium (root @playwright/test), emulating macOS through CDP (navigator.platform 'MacIntel', asserted in
//      the page; every Command.Shortcut must show the Command glyph text after hydration): hydrate, type 'zz' for the empty state, clear, click the
//      'Open palette' button (the CommandDialog from modern-cmdk/react/dialog), expect
//      [data-command-dialog] visible, press Escape, expect it gone (visibility only: the dialog
//      animation waits for DT-19, 1.8.0), collect the console errors and warnings, compare the
//      hydration count to tests/consumers/hydration-baseline.json.
//
// No lockfile is committed for the apps: the tarball's integrity changes with every build, so a
// committed lockfile would be stale on the next pack. Every install resolves fresh under the
// supply-chain policy of the root pnpm-workspace.yaml.
//
// CORE COPY LITERAL: '[modern-cmdk] frecency load failed:' (CORE_COPY_LITERAL), the warning
// createCommandMachine prints when the frecency load rejects (packages/modern-cmdk/src/core/machine.ts).
// It occurs exactly once in packages/modern-cmdk/src/core and never in src/react; the unit test
// 'TUB-80: CORE_COPY_LITERAL occurs exactly once under src/core and never under src/react' in
// tests/unit/consumer-smoke.test.ts pins that, so a rename fails at `pnpm test` instead of in the
// consumer CI jobs (on 2026-11-08 the previous marker, a FrecencyEngine warning, was renamed by the
// frecency rework and every consumer job reported 0 copies). A string literal survives minification
// in both bundlers, and createCommandMachine (which both the adapter and the apps call) is the core's
// entry point, so each core copy in the client output carries the literal once.

import type { ChildProcess, ChildProcessByStdio } from 'node:child_process';
import { spawn, spawnSync } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { Page } from '@playwright/test';

export const VARIANTS: readonly ['next-turbopack', 'next-webpack', 'vite'] = [
  'next-turbopack',
  'next-webpack',
  'vite',
];
export type Variant = (typeof VARIANTS)[number];

export const CORE_COPY_LITERAL = '[modern-cmdk] frecency load failed:';

export interface ConsoleMessage {
  readonly type: string;
  readonly text: string;
}

export interface CliOptions {
  readonly variants: readonly Variant[];
  readonly tarball: string | undefined;
  readonly expectCoreCopies: number;
  readonly report: string | undefined;
  readonly keep: boolean;
}

export type ParsedCli =
  | { readonly kind: 'run'; readonly options: CliOptions }
  | { readonly kind: 'usage'; readonly message: string; readonly exitCode: 2 };

export type BaselineVerdict = 'pass' | 'regression' | 'lower the baseline';

// --- pure helpers -----------------------------------------------------------------------------

// react-dom development messages, read from node_modules/react-dom/cjs/react-dom-client.development.js
// (lines 2740-2791, 5545, 5731, 10272, 10282). Lowercased substrings.
const HYDRATION_PHRASES: readonly string[] = [
  'hydration failed because',
  'this will cause a hydration error',
  'some attributes of the server rendered html',
  'error while hydrating',
];

// Production builds carry only the minified code: 418 hydration mismatch (throwOnHydrationMismatch), 419 server could not finish a Suspense boundary, 422 and 423 recovered by client rendering (formatProdErrorMessage calls in node_modules/react-dom/cjs/react-dom-client.production.js).
const HYDRATION_MINIFIED_CODES: readonly string[] = ['418', '419', '422', '423'];
const MINIFIED_PATTERN = /minified react error #(\d+)(?!\d)/gi;

/** Counts the console errors, console warnings and page errors that are hydration reports. Production React reports hydration errors through window.reportError, which Playwright surfaces as 'pageerror', never as a console message. */
export function countHydrationMessages(messages: readonly ConsoleMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (
      message.type !== 'error' &&
      message.type !== 'warning' &&
      message.type !== 'warn' &&
      message.type !== 'pageerror'
    )
      continue;
    const text = message.text.toLowerCase();
    const named = HYDRATION_PHRASES.some((phrase: string): boolean => text.includes(phrase));
    const minified = [...message.text.matchAll(MINIFIED_PATTERN)].some(
      (match: RegExpMatchArray): boolean => HYDRATION_MINIFIED_CODES.includes(match[1] ?? ''),
    );
    if (named || minified) count += 1;
  }
  return count;
}

/**
 * True when `printed` (stdout of `require.resolve('modern-cmdk/package.json')`) is a path to the
 * package manifest inside an installed modern-cmdk: the last non-empty line ends with
 * node_modules/modern-cmdk/package.json (pnpm prints the real path under node_modules/.pnpm, which
 * keeps that tail).
 */
export function isInstalledPackageJsonPath(printed: string): boolean {
  const lines = printed
    .split(/\r?\n/)
    .map((line: string): string => line.trim())
    .filter((line: string): boolean => line !== '');
  const last = lines.at(-1);
  if (last === undefined) return false;
  return last.replaceAll('\\', '/').endsWith('/node_modules/modern-cmdk/package.json');
}

/** A ratchet: equal passes, higher is a regression, lower demands the baseline be lowered. */
export function compareToBaseline(count: number, baseline: number): BaselineVerdict {
  if (count === baseline) return 'pass';
  return count > baseline ? 'regression' : 'lower the baseline';
}

/** Total occurrences of `literal` across the file contents. */
export function countCoreCopies(contents: readonly string[], literal: string): number {
  let total = 0;
  for (const content of contents) {
    total += content.split(literal).length - 1;
  }
  return total;
}

function usage(message: string): ParsedCli {
  return { kind: 'usage', message, exitCode: 2 };
}

/** Parses argv strictly; every usage error carries exit code 2. */
export function parseCli(argv: readonly string[]): ParsedCli {
  let values: {
    app?: string | undefined;
    tarball?: string | undefined;
    'expect-core-copies'?: string | undefined;
    report?: string | undefined;
    keep?: boolean | undefined;
  };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        app: { type: 'string' },
        tarball: { type: 'string' },
        'expect-core-copies': { type: 'string' },
        report: { type: 'string' },
        keep: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error));
  }

  const app = values.app ?? 'all';
  let variants: readonly Variant[];
  if (app === 'all') {
    variants = VARIANTS;
  } else if ((VARIANTS as readonly string[]).includes(app)) {
    variants = [app as Variant];
  } else {
    return usage(`--app must be one of ${VARIANTS.join(', ')}, all; got '${app}'`);
  }

  const expectRaw = values['expect-core-copies'];
  let expectCoreCopies = 1;
  if (expectRaw !== undefined) {
    if (!/^\d+$/.test(expectRaw)) {
      return usage(`--expect-core-copies must be a non-negative integer; got '${expectRaw}'`);
    }
    expectCoreCopies = Number(expectRaw);
  }

  return {
    kind: 'run',
    options: {
      variants,
      tarball: values.tarball,
      expectCoreCopies,
      report: values.report,
      keep: values.keep === true,
    },
  };
}

// --- the supply-chain policy of the copy ------------------------------------------------------

type YamlScalar = string | number | boolean;
type YamlValue = YamlScalar | readonly YamlScalar[] | Readonly<Record<string, YamlScalar>>;

function parseScalar(raw: string): YamlScalar {
  const text = raw.trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  const quote = text[0];
  if ((quote === "'" || quote === '"') && text.endsWith(quote) && text.length >= 2) {
    return text.slice(1, -1);
  }
  return text;
}

/**
 * Reads the subset of YAML pnpm-workspace.yaml uses here: top-level scalars, lists of scalars and
 * one-level maps of scalars, with full-line comments. Anything else throws, so a new construct in
 * the root file fails loudly instead of being dropped.
 */
export function parseWorkspaceYaml(text: string): Record<string, YamlValue> {
  const result: Record<string, YamlValue> = {};
  let current: { key: string; list: YamlScalar[]; map: Record<string, YamlScalar> } | undefined;
  const flush = (): void => {
    if (current === undefined) return;
    result[current.key] = current.list.length > 0 ? current.list : current.map;
    current = undefined;
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      flush();
      const match = /^([A-Za-z][A-Za-z0-9]*):(.*)$/.exec(line);
      if (match === null) throw new Error(`pnpm-workspace.yaml: unsupported line '${line}'`);
      const key = match[1] as string;
      const rest = (match[2] as string).trim();
      if (rest === '') current = { key, list: [], map: {} };
      else result[key] = parseScalar(rest);
      continue;
    }
    if (current === undefined)
      throw new Error(`pnpm-workspace.yaml: stray indented line '${line}'`);
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item !== null) {
      current.list.push(parseScalar(item[1] as string));
      continue;
    }
    const entry = /^\s+([^:\s][^:]*):\s*(.*)$/.exec(line);
    if (entry === null) throw new Error(`pnpm-workspace.yaml: unsupported line '${line}'`);
    current.map[(entry[1] as string).trim().replace(/^['"]|['"]$/g, '')] = parseScalar(
      entry[2] as string,
    );
  }
  flush();
  return result;
}

const POLICY_KEYS: readonly string[] = [
  'minimumReleaseAge',
  'minimumReleaseAgeStrict',
  'trustPolicy',
  'trustPolicyExclude',
  'minimumReleaseAgeExclude',
  'allowBuilds',
];

interface ReleaseAgeExclude {
  readonly spec: string;
  readonly reason: string;
}

/** The pnpm-workspace.yaml of an app copy (JSON scalars are valid YAML scalars). */
export function buildWorkspaceYaml(
  rootYaml: Readonly<Record<string, YamlValue>>,
  excludes: readonly ReleaseAgeExclude[],
): string {
  const lines: string[] = [
    '# Written by scripts/consumer-smoke.ts: the supply-chain policy of the repository root, read at run time.',
    'packages:',
    '  - "."',
  ];
  for (const key of POLICY_KEYS) {
    let value = rootYaml[key];
    if (key === 'minimumReleaseAgeExclude') {
      const base: readonly YamlScalar[] = Array.isArray(value)
        ? (value as readonly YamlScalar[])
        : [];
      // A Set keeps each spec once, in first-seen order (the root list first).
      value = [
        ...new Set([...base, ...excludes.map((entry: ReleaseAgeExclude): string => entry.spec)]),
      ];
      if (value.length === 0) continue;
    }
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value as readonly YamlScalar[]) lines.push(`  - ${JSON.stringify(item)}`);
    } else if (typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [name, flag] of Object.entries(value as Record<string, YamlScalar>)) {
        lines.push(`  ${JSON.stringify(name)}: ${JSON.stringify(flag)}`);
      }
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

// --- process helpers --------------------------------------------------------------------------

const ROOT: string = resolve(import.meta.dirname, '..');
const IS_WINDOWS: boolean = process.platform === 'win32';
const TAIL_LINES = 40;

/** A file to spawn and the arguments that come before the caller's own. */
interface PnpmEntry {
  readonly file: string;
  readonly leading: readonly string[];
}

/**
 * Where to spawn pnpm without a shell. A pnpm script (`pnpm test:templates`, `pnpm test:consumers`)
 * runs this file with npm_execpath naming pnpm's own entry: an executable (pnpm.exe from the standalone
 * installer on Windows) is spawned directly, and a JavaScript entry (.cjs, .mjs or .js) is spawned as
 * the first argument of this Node. On CI pnpm/action-setup installs the npm package under ~/setup-pnpm
 * (PNPM_HOME names its node_modules/.bin), whose bin/pnpm.mjs re-execs the native pnpm of its platform
 * package when that is present, so either branch may run there; the CI steps run `pnpm run
 * test:consumers` and `pnpm run test:templates`, never bare node, because outside pnpm npm_execpath is
 * absent, this returns undefined and the script exits 2 (SEC-72). Neither branch goes through a
 * shell, so no argument is ever re-parsed (CodeQL js/shell-command-injection-from-environment).
 * An .exe is spawnable because it is not a .cmd shim: .bat and .cmd files are not executable on their
 * own on Windows (Node 28.0.0-nightly20261107a43bfb5bb2 docs, read 2026-11-07,
 * https://nodejs.org/download/nightly/v28.0.0-nightly20261107a43bfb5bb2/docs/api/child_process.html,
 * "Spawning .bat and .cmd files on Windows"). Returns undefined outside pnpm: npm_execpath absent or
 * naming another tool (npm's entry is npm-cli.js).
 */
export function resolvePnpmEntry(
  env: Readonly<Record<string, string | undefined>>,
  nodePath: string = process.execPath,
): PnpmEntry | undefined {
  const entry = env.npm_execpath;
  if (entry === undefined || entry === '') return undefined;
  const name = entry.split(/[\\/]/).at(-1) ?? '';
  if (!/^pnpm(?:[-.].*)?$/i.test(name)) return undefined;
  return /\.(?:cjs|mjs|js)$/i.test(name)
    ? { file: nodePath, leading: [entry] }
    : { file: entry, leading: [] };
}

/** The usage line printed, with exit code 2, when a smoke script runs outside pnpm. */
export function pnpmUsage(script: string, pnpmScript: string): string {
  return `${script}: run it through pnpm, which names its own entry in npm_execpath (npm_execpath is absent or is not pnpm here): pnpm ${pnpmScript}\n`;
}

/** The file and arguments to spawn for run(): pnpm resolves through resolvePnpmEntry, anything else is spawned as given. */
export function spawnTarget(
  command: string,
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
): { readonly file: string; readonly args: readonly string[] } {
  if (command !== 'pnpm') return { file: command, args };
  const entry = resolvePnpmEntry(env);
  if (entry === undefined)
    throw new Error('pnpm is not available: npm_execpath does not name pnpm');
  return { file: entry.file, args: [...entry.leading, ...args] };
}

interface RunResult {
  readonly code: number | null;
  readonly timedOut: boolean;
  readonly output: string;
}

function tail(output: string): string {
  return output.split(/\r?\n/).slice(-TAIL_LINES).join('\n');
}

export function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      timeout: 30_000,
    });
    return;
  }
  // A detached child leads its own process group, so -pid reaches grandchildren holding the pipes.
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    // ESRCH means no such group: either the child is gone (nothing to kill) or it is alive but not
    // a group leader, and then only the direct child can be killed.
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
}

/** Spawns a long-lived served app with piped output; on POSIX it leads its own process group, so killTree reaches it. */
export function spawnServer(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env?: Readonly<Record<string, string | undefined>> },
): ChildProcessByStdio<null, Readable, Readable> {
  return spawn(command, [...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    windowsHide: true,
    detached: !IS_WINDOWS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Runs a command to completion with a hard timeout; output is captured, never streamed. */
export function run(
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly timeoutMs: number;
    readonly env?: Readonly<Record<string, string>>;
  },
): Promise<RunResult> {
  return new Promise<RunResult>((resolvePromise: (value: RunResult) => void): void => {
    // No shell: 'pnpm' becomes the entry npm_execpath names (see resolvePnpmEntry), spawned directly
    // or through this Node, so no argument is re-parsed by a shell.
    const target = spawnTarget(command, args);
    const child = spawn(target.file, [...target.args], {
      cwd: options.cwd,
      env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1', ...options.env },
      windowsHide: true,
      detached: !IS_WINDOWS,
    });
    let output = '';
    let timedOut = false;
    const collect = (chunk: Buffer): void => {
      output += chunk.toString('utf8');
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout((): void => {
      timedOut = true;
      killTree(child);
    }, options.timeoutMs);
    child.on('error', (error: Error): void => {
      clearTimeout(timer);
      resolvePromise({ code: null, timedOut, output: `${output}\n${error.message}` });
    });
    child.on('close', (code: number | null): void => {
      clearTimeout(timer);
      resolvePromise({ code, timedOut, output });
    });
  });
}

class StepError extends Error {}

async function runStep(
  label: string,
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly timeoutMs: number },
): Promise<number> {
  const started = performance.now();
  process.stdout.write(`  ${label} ...\n`);
  const result = await run(command, args, options);
  const seconds = (performance.now() - started) / 1000;
  if (result.timedOut) {
    throw new StepError(
      `${label} timed out after ${options.timeoutMs / 1000} s\n${tail(result.output)}`,
    );
  }
  if (result.code !== 0) {
    throw new StepError(`${label} exited with ${result.code}\n${tail(result.output)}`);
  }
  return seconds;
}

async function freePort(): Promise<number> {
  return await new Promise<number>(
    (resolvePromise: (value: number) => void, reject: (reason: Error) => void): void => {
      const probe = createNetServer();
      probe.on('error', reject);
      probe.listen(0, '127.0.0.1', (): void => {
        const { port } = probe.address() as AddressInfo;
        probe.close((): void => resolvePromise(port));
      });
    },
  );
}

async function listJs(directory: string): Promise<string[]> {
  const found: string[] = [];
  const entries: Dirent[] = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await listJs(path)));
    else if (entry.name.endsWith('.js')) found.push(path);
  }
  return found;
}

async function waitForOk(
  url: string,
  child: ChildProcess | undefined,
  capMs: number,
): Promise<void> {
  const deadline = Date.now() + capMs;
  let last = 'no response';
  while (Date.now() < deadline) {
    if (child !== undefined && child.exitCode !== null) {
      throw new StepError(`the server exited with ${child.exitCode} before answering ${url}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.status === 200) return;
      last = `status ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise<void>((done: () => void): void => {
      setTimeout(done, 500);
    });
  }
  throw new StepError(`${url} did not answer 200 within ${capMs / 1000} s (${last})`);
}

// --- next start on Node 27+ ------------------------------------------------------------------

// Node 27 and 28 create http.IncomingMessage#headers with a null prototype (verified on
// v27.0.0-alpha.0 and v28.0.0-nightly20261107a43bfb5bb2). Next 16.5.0-canary.40 through canary.45 (the pin; re-checked 2026-11-09) call
// `headers.hasOwnProperty(...)` on it in app-page-turbo.runtime.prod.js, so every request to
// `next start` answers 500 'TypeError: e.hasOwnProperty is not a function'. That is a Next-on-Node
// fault, not a modern-cmdk one, but it would end the Next variants before any modern-cmdk check
// runs. Only `next start` loads this shim (--require): it gives each request's headers
// Object.prototype back. It is printed and reported as a workaround for every Next variant; drop
// it when a Next release stops calling Object.prototype methods on headers.
const NODE_HEADERS_SHIM = `'use strict';
const http = require('node:http');
const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, request, ...rest) {
  if (event === 'request' && Object.getPrototypeOf(request.headers) === null) {
    Object.setPrototypeOf(request.headers, Object.prototype);
  }
  return emit.call(this, event, request, ...rest);
};
`;
const NODE_HEADERS_SHIM_NOTE =
  'a --require shim restoring Object.prototype on http request headers (Node 27+ null-prototype headers vs Next calling headers.hasOwnProperty)';

// --- the vite SSR server ----------------------------------------------------------------------

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

interface SsrModule {
  readonly render: () => string;
}

async function startViteServer(appDir: string, port: number): Promise<Server> {
  const clientDir = join(appDir, 'dist', 'client');
  const entry = (await import(
    pathToFileURL(join(appDir, 'dist', 'server', 'entry-server.js')).href
  )) as SsrModule;
  if (typeof entry.render !== 'function') {
    throw new StepError('dist/server/entry-server.js does not export render()');
  }
  const template = await readFile(join(clientDir, 'index.html'), 'utf8');
  if (!template.includes('<!--ssr-outlet-->')) {
    throw new StepError('dist/client/index.html lost the <!--ssr-outlet--> placeholder');
  }
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/' || pathname === '/index.html') {
      response.writeHead(200, { 'content-type': MIME['.html'] as string });
      response.end(template.replace('<!--ssr-outlet-->', entry.render()));
      return;
    }
    const file = resolve(clientDir, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(clientDir + sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  };
  const server = createServer((request: IncomingMessage, response: ServerResponse): void => {
    handle(request, response).catch((error: unknown): void => {
      response.writeHead(500).end(error instanceof Error ? error.message : String(error));
    });
  });
  await new Promise<void>((done: () => void, reject: (reason: Error) => void): void => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', done);
  });
  return server;
}

// --- one variant ------------------------------------------------------------------------------

export interface VariantResult {
  readonly variant: Variant;
  installSeconds: number | null;
  buildSeconds: number | null;
  coreCopies: number | null;
  ssr: boolean;
  ssrFirstItem: boolean;
  dialog: boolean;
  packageJsonResolves: boolean;
  workarounds: string[];
  hydrationCount: number | null;
  messages: ConsoleMessage[];
  failures: string[];
}

interface Baseline {
  readonly [variant: string]: unknown;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function prepareApp(variant: Variant, tarball: string, tempDirs: string[]): Promise<string> {
  const appName = variant === 'vite' ? 'vite-app' : 'next-app';
  const source = join(ROOT, 'tests', 'consumers', appName);
  const dir = await mkdtemp(join(tmpdir(), `modern-cmdk-consumer-${variant}-`));
  tempDirs.push(dir);
  await cp(source, dir, {
    recursive: true,
    filter: (path: string): boolean => !/[\\/](node_modules|\.next|dist)([\\/]|$)/.test(path),
  });

  const manifestPath = join(dir, 'package.json');
  const manifest = (await readJson(manifestPath)) as { dependencies: Record<string, string> };
  manifest.dependencies['modern-cmdk'] = `file:${tarball.split(sep).join('/')}`;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const rootYaml = parseWorkspaceYaml(await readFile(join(ROOT, 'pnpm-workspace.yaml'), 'utf8'));
  // Both app lists are empty: next is a root devDependency (D57), so a next spec younger than the 24 h
  // minimumReleaseAge goes in the root minimumReleaseAgeExclude; an entry here is for a spec only this app installs.
  const excludes = (await readJson(join(dir, 'release-age-exclude.json'))) as ReleaseAgeExclude[];
  await writeFile(join(dir, 'pnpm-workspace.yaml'), buildWorkspaceYaml(rootYaml, excludes));
  return dir;
}

const MACOS_PLATFORM = 'MacIntel';
const MACOS_SHORTCUT_TEXT = '⌘K';

/** Makes the page report macOS: navigator.userAgent, navigator.platform and navigator.userAgentData.platform (Chrome DevTools Protocol, before navigation). */
async function emulateMacOs(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setUserAgentOverride', {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    platform: MACOS_PLATFORM,
    userAgentMetadata: {
      platform: 'macOS',
      platformVersion: '15.0.0',
      architecture: 'arm',
      model: '',
      mobile: false,
    },
  });
}

async function checkPage(result: VariantResult, url: string): Promise<void> {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await emulateMacOs(page);
    const pageErrors: string[] = [];
    page.on('console', (message): void => {
      const type = message.type();
      if (type === 'error' || type === 'warning')
        result.messages.push({ type, text: message.text() });
    });
    page.on('pageerror', (error: Error): void => {
      pageErrors.push(error.message);
      result.messages.push({ type: 'pageerror', text: error.message });
    });
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForSelector('body[data-hydrated="true"]', { timeout: 30_000 });

    // The emulation must have taken effect before the hydration messages are counted: a host-platform
    // page would make the Shortcut check below vacuous.
    const platform = await page.evaluate((): string => navigator.platform);
    if (platform !== MACOS_PLATFORM) {
      result.failures.push(`navigator.platform is '${platform}', expected '${MACOS_PLATFORM}'`);
    }

    const palette = page.locator('[data-palette="client"]');
    const input = palette.locator('[data-command-input]');
    await input.fill('zz');
    await palette.locator('[data-command-empty]').waitFor({ state: 'visible', timeout: 10_000 });
    await input.fill('');
    await palette
      .locator('[data-command-item]')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
    // Command.Shortcut shows the macOS glyph text once the client has hydrated.
    await page.locator('[data-shortcut]').first().waitFor({ state: 'visible', timeout: 10_000 });
    for (const shortcut of await page.locator('[data-shortcut]').all()) {
      const text = await shortcut.textContent();
      if (text !== MACOS_SHORTCUT_TEXT) {
        result.failures.push(
          `a Command.Shortcut shows '${text}' under the macOS emulation, expected '${MACOS_SHORTCUT_TEXT}'`,
        );
      }
    }
    // Hydration reports surface asynchronously after the first render; let the page settle.
    await page.waitForLoadState('networkidle', { timeout: 10_000 });

    // The dialog subpath: closed by default (nothing in the DOM), opens on the button, Escape closes it.
    const dialog = page.locator('[data-command-dialog]');
    if ((await dialog.count()) !== 0) {
      result.failures.push('[data-command-dialog] is in the DOM before the button was clicked');
    }
    await page.getByRole('button', { name: 'Open palette' }).click({ timeout: 10_000 });
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    result.dialog = true;

    if (pageErrors.length > 0) {
      result.failures.push(`${pageErrors.length} pageerror(s): ${pageErrors[0]}`);
    }
  } finally {
    await browser.close();
  }
}

async function runVariant(
  variant: Variant,
  tarball: string,
  options: CliOptions,
  baseline: Baseline,
  tempDirs: string[],
): Promise<VariantResult> {
  const result: VariantResult = {
    variant,
    installSeconds: null,
    buildSeconds: null,
    coreCopies: null,
    ssr: false,
    ssrFirstItem: false,
    dialog: false,
    packageJsonResolves: false,
    workarounds: [],
    hydrationCount: null,
    messages: [],
    failures: [],
  };
  let server: ChildProcess | undefined;
  let serverOutput = '';
  let viteServer: Server | undefined;
  process.stdout.write(`\n[${variant}]\n`);
  try {
    const dir = await prepareApp(variant, tarball, tempDirs);
    result.installSeconds = await runStep('pnpm install', 'pnpm', ['install'], {
      cwd: dir,
      timeoutMs: 15 * 60_000,
    });

    const node = process.execPath;
    const nextBin = join(dir, 'node_modules', 'next', 'dist', 'bin', 'next');
    const viteBin = join(dir, 'node_modules', 'vite', 'bin', 'vite.js');

    // The './package.json' export, resolved the way a consumer's tooling does. A failure is recorded
    // and the variant goes on, so one run reports every broken surface.
    const resolved = await run(
      node,
      ['-e', "console.log(require.resolve('modern-cmdk/package.json'))"],
      { cwd: dir, timeoutMs: 60_000 },
    );
    if (resolved.code === 0 && !resolved.timedOut && isInstalledPackageJsonPath(resolved.output)) {
      result.packageJsonResolves = true;
      process.stdout.write(
        `  package.json resolves: ${resolved.output.trim().split(/\r?\n/).at(-1)}\n`,
      );
    } else {
      result.failures.push(
        `require.resolve('modern-cmdk/package.json') ${resolved.timedOut ? 'timed out' : `exited with ${resolved.code}`} or printed no path inside node_modules/modern-cmdk\n${tail(resolved.output)}`,
      );
    }

    if (variant === 'vite') {
      // The app's pinned TypeScript, before the builds (vite build never type-checks). Next
      // type-checks inside `next build`.
      try {
        await runStep(
          'tsc --noEmit -p .',
          node,
          [join(dir, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', '.'],
          { cwd: dir, timeoutMs: 5 * 60_000 },
        );
      } catch (error) {
        result.failures.push(error instanceof Error ? error.message : String(error));
      }
      const clientSeconds = await runStep(
        'vite build (client)',
        node,
        [viteBin, 'build', '--outDir', 'dist/client'],
        {
          cwd: dir,
          timeoutMs: 10 * 60_000,
        },
      );
      // Separate outDirs: emptyOutDir defaults to true, so a second build into dist/ would delete the client build.
      const serverSeconds = await runStep(
        'vite build (ssr)',
        node,
        [viteBin, 'build', '--ssr', 'src/entry-server.tsx', '--outDir', 'dist/server'],
        { cwd: dir, timeoutMs: 10 * 60_000 },
      );
      result.buildSeconds = clientSeconds + serverSeconds;
    } else {
      const flags = variant === 'next-webpack' ? ['build', '--webpack'] : ['build'];
      result.buildSeconds = await runStep(`next ${flags.join(' ')}`, node, [nextBin, ...flags], {
        cwd: dir,
        timeoutMs: 15 * 60_000,
      });
    }

    const clientRoot =
      variant === 'vite' ? join(dir, 'dist', 'client', 'assets') : join(dir, '.next', 'static');
    const files = await listJs(clientRoot);
    if (files.length === 0) throw new StepError(`no client JS found under ${clientRoot}`);
    const contents = await Promise.all(
      files.map((file: string): Promise<string> => readFile(file, 'utf8')),
    );
    result.coreCopies = countCoreCopies(contents, CORE_COPY_LITERAL);
    process.stdout.write(
      `  core copies: ${result.coreCopies} (expected ${options.expectCoreCopies}, ${files.length} client JS files)\n`,
    );
    if (result.coreCopies !== options.expectCoreCopies) {
      result.failures.push(
        `core copies ${result.coreCopies}, expected ${options.expectCoreCopies}`,
      );
    }

    const port = await freePort();
    const url = `http://127.0.0.1:${port}/`;
    if (variant === 'vite') {
      viteServer = await startViteServer(dir, port);
    } else {
      const shim = join(dir, 'node-headers-shim.cjs');
      await writeFile(shim, NODE_HEADERS_SHIM);
      process.stdout.write(`  next start runs with ${NODE_HEADERS_SHIM_NOTE}\n`);
      result.workarounds.push(NODE_HEADERS_SHIM_NOTE);
      const started = spawnServer(
        node,
        ['--require', shim, nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)],
        { cwd: dir, env: { NEXT_TELEMETRY_DISABLED: '1' } },
      );
      const collect = (chunk: Buffer): void => {
        serverOutput = (serverOutput + chunk.toString('utf8')).slice(-65_536);
      };
      started.stdout.on('data', collect);
      started.stderr.on('data', collect);
      server = started;
    }
    try {
      await waitForOk(url, server, 60_000);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new StepError(serverOutput === '' ? reason : `${reason}\n${tail(serverOutput)}`);
    }

    const html = await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).text();
    // The root, its label and the items are server-rendered: an item the registry does not hold yet renders
    // under an empty query, and the empty state and the result count wait for hydration.
    result.ssr =
      html.includes('data-command-root') && html.includes('aria-label="Consumer palette"');
    result.ssrFirstItem = />Item 1</.test(html);
    process.stdout.write(
      `  ssr: ${result.ssr ? 'data-command-root and the root label present' : 'MISSING'}; first item in the HTML: ${result.ssrFirstItem}\n`,
    );
    if (!result.ssr) {
      result.failures.push('the server HTML lacks data-command-root or the palette label');
    }
    if (!result.ssrFirstItem) {
      result.failures.push('the server HTML lacks the text of the first item ("Item 1")');
    }
    for (const empty of ['No results', '0 results available']) {
      if (html.includes(empty)) result.failures.push(`the server HTML contains "${empty}"`);
    }
    if (variant !== 'vite' && !html.includes('data-palette="server"')) {
      result.failures.push(
        'the RSC palette (data-palette="server") is missing from the server HTML',
      );
    }

    await checkPage(result, url);
    result.hydrationCount = countHydrationMessages(result.messages);
    const expected = baseline[variant];
    if (typeof expected !== 'number') {
      result.failures.push(`tests/consumers/hydration-baseline.json has no count for '${variant}'`);
    } else {
      const verdict = compareToBaseline(result.hydrationCount, expected);
      process.stdout.write(
        `  hydration messages: ${result.hydrationCount} (baseline ${expected}: ${verdict})\n`,
      );
      if (verdict !== 'pass') {
        result.failures.push(
          `hydration messages ${result.hydrationCount}, baseline ${expected}: ${verdict}`,
        );
      }
    }
  } catch (error) {
    result.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (server !== undefined) killTree(server);
    if (viteServer !== undefined) {
      const closing = viteServer;
      await new Promise<void>((done: () => void): void => {
        closing.close((): void => done());
        closing.closeAllConnections();
      });
    }
  }
  return result;
}

// --- main -------------------------------------------------------------------------------------

async function resolveTarball(options: CliOptions, tempDirs: string[]): Promise<string> {
  if (options.tarball !== undefined) {
    const path = resolve(options.tarball);
    await readFile(path).catch((): never => {
      throw new StepError(`--tarball ${path} cannot be read`);
    });
    return path;
  }
  try {
    await readFile(join(ROOT, 'packages', 'modern-cmdk', 'dist', 'react', 'index.mjs'));
  } catch {
    throw new StepError('packages/modern-cmdk/dist/react/index.mjs is missing: run pnpm build');
  }
  const destination = await mkdtemp(join(tmpdir(), 'modern-cmdk-consumer-pack-'));
  tempDirs.push(destination);
  await runStep(
    'pnpm pack',
    'pnpm',
    ['--filter', 'modern-cmdk', 'pack', '--pack-destination', destination],
    {
      cwd: ROOT,
      timeoutMs: 5 * 60_000,
    },
  );
  const packed = (await readdir(destination)).filter((name: string): boolean =>
    name.endsWith('.tgz'),
  );
  if (packed.length !== 1)
    throw new StepError(`pnpm pack produced ${packed.length} tarballs in ${destination}`);
  return join(destination, packed[0] as string);
}

async function main(argv: readonly string[]): Promise<number> {
  if (resolvePnpmEntry(process.env) === undefined) {
    process.stderr.write(pnpmUsage('consumer-smoke', 'test:consumers'));
    return 2;
  }
  const parsed = parseCli(argv);
  if (parsed.kind === 'usage') {
    process.stderr.write(
      `consumer-smoke: ${parsed.message}\nusage: pnpm test:consumers [--app next-turbopack|next-webpack|vite|all] [--tarball <tgz>] [--expect-core-copies <n>] [--report <file>] [--keep]\n`,
    );
    return parsed.exitCode;
  }
  const { options } = parsed;
  const tempDirs: string[] = [];
  const results: VariantResult[] = [];
  let tarball = '';
  try {
    tarball = await resolveTarball(options, tempDirs);
    process.stdout.write(`tarball: ${tarball}\n`);
    const baseline = (await readJson(
      join(ROOT, 'tests', 'consumers', 'hydration-baseline.json'),
    )) as Baseline;
    for (const variant of options.variants) {
      results.push(await runVariant(variant, tarball, options, baseline, tempDirs));
    }
  } catch (error) {
    process.stderr.write(
      `consumer-smoke: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  } finally {
    if (options.keep) {
      process.stdout.write(`kept: ${tempDirs.join(', ')}\n`);
    } else {
      for (const dir of tempDirs) {
        await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }).catch(
          (error: unknown): void => {
            process.stderr.write(`consumer-smoke: could not remove ${dir}: ${String(error)}\n`);
          },
        );
      }
    }
  }

  if (options.report !== undefined) {
    const path = resolve(options.report);
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(
      path,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          tarball,
          expectCoreCopies: options.expectCoreCopies,
          variants: results,
        },
        null,
        2,
      )}\n`,
    );
  }

  process.stdout.write('\nsummary:\n');
  let failed = false;
  for (const result of results) {
    const status = result.failures.length === 0 ? 'PASS' : 'FAIL';
    if (status === 'FAIL') failed = true;
    process.stdout.write(
      `  ${status} ${result.variant}: install ${result.installSeconds?.toFixed(1) ?? '-'} s, build ${result.buildSeconds?.toFixed(1) ?? '-'} s, core copies ${result.coreCopies ?? '-'}, ssr ${result.ssr}, dialog ${result.dialog}, package.json ${result.packageJsonResolves}, hydration ${result.hydrationCount ?? '-'}\n`,
    );
    for (const failure of result.failures) {
      process.stdout.write(`    ${failure.split('\n').join('\n    ')}\n`);
    }
  }
  return failed ? 1 : 0;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2));
}
