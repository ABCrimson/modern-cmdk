// scripts/check-package.ts
// Checks the packed tarballs as they would be published. Runs with Node's native type stripping:
//
//   node scripts/check-package.ts [--package modern-cmdk|create-modern-cmdk] [--pack-dir <dir>]
//        [--tarball <tgz>] [--update]
//
// Exit codes: 0 = every check passed, 1 = a check failed, 2 = usage error (including a --tarball path
// that does not exist). A relative --pack-dir is resolved against the current directory once, up front,
// so pnpm (which runs in the repository root) and the check agree on it. The default exit codes of
// the shipped CLIs are unaffected: this is a repository tool, not a shipped one.
//
// Per package (the default is both):
//   1. `pnpm --filter <name> pack --pack-destination <dir>` (never builds: run `pnpm build` first; --pack-dir keeps
//      the tarballs, the default is a fresh temporary directory), or --tarball for a given modern-cmdk tarball;
//   2. publint on the tarball in strict mode: every error and warning fails, suggestions are printed;
//   3. modern-cmdk only: @arethetypeswrong/cli on the tarball with --profile esm-only;
//   4. modern-cmdk only: the sorted tarball file list must equal tests/package/modern-cmdk.files.json
//      (--update rewrites that file from the tarball instead of comparing). The create-modern-cmdk file
//      list is pinned by tests/dist/create-tarball.test.ts;
//   5. modern-cmdk only: every dist/react/*.mjs starts with the 'use client' directive, no dist/core or
//      dist/codemod .mjs does.
// Every failure is printed, then the process exits.
//
// HOST TAR RULE: no host tar binary is ever run on a tarball. Git's GNU tar reads a drive-letter path
// ("C:") as a remote host, and the pre-push hook puts that tar first on PATH. The tarball is read
// in-process (listTarEntries: node:zlib plus the POSIX ustar/pax headers).

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { publint } from 'publint';
import { formatMessage } from 'publint/utils';

const ROOT = resolve(import.meta.dirname, '..');
const FILE_LIST = join(ROOT, 'tests/package/modern-cmdk.files.json');
const PACKAGES = ['modern-cmdk', 'create-modern-cmdk'] as const;
type PackageName = (typeof PACKAGES)[number];
const PACK_TIMEOUT_MS = 120_000;
const ATTW_TIMEOUT_MS = 180_000;
const BLOCK = 512;

export interface TarEntry {
  readonly name: string;
  readonly data: Buffer;
}

export interface FileListDiff {
  readonly missing: string[];
  readonly extra: string[];
}

/** Numeric octal header field (NUL or space padded). */
function octal(header: Buffer, start: number, end: number): number {
  const text = header.toString('utf8', start, end).replace(/[\0 ]+/g, '');
  return text === '' ? 0 : Number.parseInt(text, 8);
}

/** NUL-terminated string header field. */
function cString(header: Buffer, start: number, end: number): string {
  const nul = header.indexOf(0, start);
  return header.toString('utf8', start, nul === -1 || nul > end ? end : nul);
}

/** The `path` record of a pax extended header ("<len> <key>=<value>\n" records), if there is one. */
function paxPath(data: Buffer): string | undefined {
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    const length = Number.parseInt(data.toString('utf8', offset, space), 10);
    if (space === -1 || !(length > 0)) throw new Error('malformed pax record');
    const record = data.toString('utf8', space + 1, offset + length - 1);
    if (record.startsWith('path=')) return record.slice('path='.length);
    offset += length;
  }
  return undefined;
}

/**
 * Regular-file entries (full name, content) of a gzip-compressed POSIX ustar/pax archive, in archive
 * order. Directories and other entry types are skipped; a pax `path` record (or a GNU long-name
 * entry) renames the next entry.
 */
export function listTarEntries(gzipBuffer: Uint8Array): TarEntry[] {
  const archive = gunzipSync(gzipBuffer);
  const entries: TarEntry[] = [];
  let nextName: string | undefined;
  let offset = 0;
  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = octal(header, 124, 136);
    const type = String.fromCharCode(header[156] ?? 0);
    const data = archive.subarray(offset + BLOCK, offset + BLOCK + size);
    offset += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (type === 'x') {
      nextName = paxPath(data) ?? nextName;
    } else if (type === 'L') {
      nextName = cString(data, 0, data.length);
    } else if (type === '0' || type === '\0') {
      const prefix = cString(header, 345, 500);
      const name = cString(header, 0, 100);
      entries.push({
        name: nextName ?? (prefix === '' ? name : `${prefix}/${name}`),
        data: Buffer.from(data),
      });
      nextName = undefined;
    }
  }
  return entries;
}

/** Names only in `expected` (missing) and only in `actual` (extra), each sorted. */
export function diffFileList(expected: readonly string[], actual: readonly string[]): FileListDiff {
  const have = new Set(actual);
  const want = new Set(expected);
  return {
    missing: expected.filter((name) => !have.has(name)).sort(),
    extra: actual.filter((name) => !want.has(name)).sort(),
  };
}

const USE_CLIENT = /^(["'])use client\1[ \t]*(?:;|\r?\n|$|\/\/|\/\*)/;
const LEADING_TRIVIA = /^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)+/;

/** True only when the first statement of `code` is the 'use client' directive (either quote style). */
export function startsWithUseClient(code: string): boolean {
  return USE_CLIENT.test(code.replace(LEADING_TRIVIA, ''));
}

/**
 * The --pack-dir value as an absolute path (undefined stays undefined). `pnpm pack` runs with the
 * repository root as its cwd while readdir runs in the caller's cwd, so a relative path would name
 * two different directories.
 */
export function absolutePackDir(value: string | undefined, cwd: string): string | undefined {
  return value === undefined ? undefined : resolve(cwd, value);
}

function write(stream: NodeJS.WriteStream, text: string): void {
  stream.write(`${text}\n`);
}

/** Packs `name` into `dir` with pnpm (no build) and returns the tarball path. */
async function pack(name: PackageName, dir: string): Promise<string> {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'packages', name, 'package.json'), 'utf8'),
  ) as {
    version: string;
  };
  // One command string: pnpm is a .cmd shim on Windows. `dir` is mkdtemp output or the absolute --pack-dir, quoted.
  execSync(`pnpm --filter ${name} pack --pack-destination "${dir}"`, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: PACK_TIMEOUT_MS,
  });
  const expected = `${name}-${manifest.version}.tgz`;
  if (!(await readdir(dir)).includes(expected))
    throw new Error(`pnpm pack produced no ${expected} in ${dir}`);
  return join(dir, expected);
}

/** publint (strict) on the tarball; returns the failure lines. */
async function checkPublint(name: string, tarball: string): Promise<string[]> {
  const bytes = readFileSync(tarball);
  const { messages, pkg } = await publint({
    pack: { tarball: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) },
    strict: true,
    level: 'suggestion',
  });
  const failures: string[] = [];
  for (const message of messages) {
    const line = `publint ${message.type}: ${formatMessage(message, pkg, { color: false }) ?? message.code}`;
    write(message.type === 'suggestion' ? process.stdout : process.stderr, `[${name}] ${line}`);
    if (message.type !== 'suggestion') failures.push(line);
  }
  if (messages.length === 0) write(process.stdout, `[${name}] publint: no messages`);
  return failures;
}

/** attw (esm-only profile) on the tarball; returns the failure lines. */
function checkAttw(name: string, tarball: string): string[] {
  const attwPackage = createRequire(import.meta.url).resolve('@arethetypeswrong/cli/package.json');
  const { bin } = JSON.parse(readFileSync(attwPackage, 'utf8')) as { bin: { attw: string } };
  const result = spawnSync(
    process.execPath,
    [
      resolve(attwPackage, '..', bin.attw),
      tarball,
      '--profile',
      'esm-only',
      '--format',
      'ascii',
      '--no-emoji',
      '--no-color',
      // styles.css is a stylesheet export: attw only models JS and declaration entrypoints, so it reports
      // 'Resolution failed' for it. Exactly that entrypoint is excluded; ./package.json resolves as JSON.
      '--exclude-entrypoints',
      './styles.css',
    ],
    { encoding: 'utf8', timeout: ATTW_TIMEOUT_MS },
  );
  write(process.stdout, `[${name}] attw (esm-only):\n${result.stdout.trimEnd()}`);
  if (result.stderr.trim() !== '') write(process.stderr, result.stderr.trimEnd());
  return result.status === 0 && result.error === undefined
    ? []
    : [`attw exited ${result.status ?? result.error?.message ?? 'without a status'}`];
}

/** The tarball file list against tests/package/modern-cmdk.files.json (or rewrites it). */
function checkFileList(names: readonly string[], update: boolean): string[] {
  if (update) {
    writeFileSync(FILE_LIST, `${JSON.stringify(names, null, 2)}\n`);
    write(
      process.stdout,
      `[modern-cmdk] wrote ${names.length} names to tests/package/modern-cmdk.files.json`,
    );
    return [];
  }
  if (!existsSync(FILE_LIST))
    return ['tests/package/modern-cmdk.files.json does not exist (run with --update)'];
  const expected = JSON.parse(readFileSync(FILE_LIST, 'utf8')) as string[];
  const { missing, extra } = diffFileList(expected, names);
  const failures = [
    ...missing.map((name) => `file list: missing from the tarball: ${name}`),
    ...extra.map((name) => `file list: not in tests/package/modern-cmdk.files.json: ${name}`),
  ];
  if (failures.length === 0)
    write(process.stdout, `[modern-cmdk] file list: ${names.length} files match`);
  return failures;
}

/** 'use client' on every dist/react/*.mjs and on no dist/core or dist/codemod .mjs. */
function checkUseClient(entries: readonly TarEntry[]): string[] {
  const failures: string[] = [];
  let checked = 0;
  for (const { name, data } of entries) {
    if (!name.endsWith('.mjs')) continue;
    const react = /^dist\/react\/[^/]+\.mjs$/.test(name);
    const other = /^dist\/(?:core|codemod)\//.test(name);
    if (!react && !other) continue;
    checked += 1;
    const has = startsWithUseClient(data.toString('utf8'));
    if (react && !has) failures.push(`use client: ${name} does not start with the directive`);
    if (other && has) failures.push(`use client: ${name} must not start with the directive`);
  }
  if (failures.length === 0)
    write(process.stdout, `[modern-cmdk] use client: ${checked} .mjs files as expected`);
  return failures;
}

function usage(message: string): never {
  write(process.stderr, `check-package: ${message}`);
  write(
    process.stderr,
    'usage: node scripts/check-package.ts [--package modern-cmdk|create-modern-cmdk] [--pack-dir <dir>] [--tarball <tgz>] [--update]',
  );
  process.exit(2);
}

async function main(): Promise<void> {
  let values: { package?: string; 'pack-dir'?: string; tarball?: string; update?: boolean };
  try {
    ({ values } = parseArgs({
      options: {
        package: { type: 'string' },
        'pack-dir': { type: 'string' },
        tarball: { type: 'string' },
        update: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error));
  }
  const selected = values.package;
  if (selected !== undefined && !PACKAGES.includes(selected as PackageName)) {
    usage(`--package must be one of ${PACKAGES.join(', ')}`);
  }
  const names: readonly PackageName[] =
    selected === undefined ? PACKAGES : [selected as PackageName];
  if (values.tarball !== undefined && !names.includes('modern-cmdk'))
    usage('--tarball needs modern-cmdk');
  if (values.update === true && !names.includes('modern-cmdk')) usage('--update needs modern-cmdk');
  if (values.tarball !== undefined && !existsSync(values.tarball))
    usage(`--tarball ${values.tarball} does not exist`);
  const checked: readonly PackageName[] = values.tarball === undefined ? names : ['modern-cmdk'];

  if (/["`$%&|<>^]/.test(values['pack-dir'] ?? '')) usage('--pack-dir holds a shell metacharacter');
  const packDir =
    absolutePackDir(values['pack-dir'], process.cwd()) ??
    (await mkdtemp(join(tmpdir(), 'check-package-')));
  const failures: string[] = [];
  for (const name of checked) {
    const tarball =
      name === 'modern-cmdk' && values.tarball !== undefined
        ? resolve(values.tarball)
        : await pack(name, packDir);
    write(process.stdout, `[${name}] tarball: ${tarball}`);
    const found: string[] = [...(await checkPublint(name, tarball))];
    if (name === 'modern-cmdk') {
      found.push(...checkAttw(name, tarball));
      const entries = listTarEntries(readFileSync(tarball)).map((entry) => ({
        name: entry.name.replace(/^[^/]+\//, ''),
        data: entry.data,
      }));
      found.push(
        ...checkFileList(entries.map((entry) => entry.name).sort(), values.update === true),
      );
      found.push(...checkUseClient(entries));
    }
    for (const line of found) write(process.stderr, `[${name}] FAIL ${line}`);
    failures.push(...found);
  }
  if (failures.length > 0) {
    write(process.stderr, `check-package: ${failures.length} failure(s)`);
    process.exit(1);
  }
  write(process.stdout, 'check-package: all checks passed');
}

if (import.meta.main) await main();
