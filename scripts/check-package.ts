// scripts/check-package.ts
// Checks the packed tarballs as they would be published. Runs with Node's native type stripping:
//
//   node scripts/check-package.ts [--package modern-cmdk|create-modern-cmdk|modern-cmdk-codemod]
//        [--pack-dir <dir>] [--tarball <tgz>] [--update]
//
// Exit codes: 0 = every check passed, 1 = a check failed, 2 = usage error (including a --tarball path
// that does not exist). A relative --pack-dir is resolved against the current directory once, up front,
// so pnpm (which runs in the repository root) and the check agree on it. The default exit codes of
// the shipped CLIs are unaffected: this is a repository tool, not a shipped one.
//
// Per package (the default is all three, PACKAGES):
//   1. `pnpm --filter <name> pack --pack-destination <dir>` (never builds: run `pnpm build` first; --pack-dir keeps
//      the tarballs, the default is a fresh temporary directory), or --tarball for one given tarball
//      (of --package, modern-cmdk when --package is absent);
//   2. publint on the tarball in strict mode: every error and warning fails, suggestions are printed;
//   3. modern-cmdk only: @arethetypeswrong/cli on the tarball with --profile esm-only (modern-cmdk-codemod
//      is bin-only and create-modern-cmdk has no library entry, so neither goes through attw);
//   4. modern-cmdk and modern-cmdk-codemod: the sorted tarball file list must equal
//      tests/package/<name>.files.json (--update rewrites that file from the tarball instead of
//      comparing). The create-modern-cmdk file list is pinned by tests/dist/create-tarball.test.ts;
//   5. the packed package.json (never the one on disk: pnpm pack rewrites catalog: and workspace:) holds
//      no catalog: or workspace: value in dependencies, peerDependencies or optionalDependencies;
//   6. import allow-list: every bare import in modern-cmdk-codemod's dist/**/*.mjs is a Node builtin or
//      a dependency the packed manifest declares; every bare import in modern-cmdk's dist/codemod/**/*.mjs
//      is a Node builtin (the codemod is bundled there, so it needs nothing installed). Imports are found
//      after blankNonCode has blanked string and template contents and comments, so text that only
//      mentions an import never counts and a real call after such text always does;
//   7. every bin target exists in the tarball, starts with #!/usr/bin/env node and has the execute bits (0o111)
//      in its tar header. pnpm pack writes 0o755 for every bin target whatever its mode on disk (pnpm 12.18.0,
//      on Linux and win32), so this guards the published tarball, including a --tarball packed by another tool.
//      The extracted dist's own modes are checked by tests/dist/manifest.test.ts;
//   8. 'use client': every modern-cmdk dist/react/*.mjs starts with the directive, no modern-cmdk
//      dist/core or dist/codemod .mjs and no modern-cmdk-codemod dist .mjs does;
//   9. the packed README.md (the page npm prints, frozen at this version): every <img> and ![](...) has a non-empty
//      alt, and every image it shows from this repository (<img src>, <source srcset>) names a full 40-hex commit
//      (a placeholder such as ASSET_COMMIT_PLACEHOLDER fails by name, and so does a relative path, which npm resolves
//      to the HEAD of main) and that commit holds the file. The commit is looked up with git in this checkout and,
//      when it is not there, fetched once from origin (`git fetch --no-tags [--depth=1] origin <sha>`), so a shallow
//      CI checkout works; whether the commit is an ancestor of origin/main is check-repo-links.ts's rule.
// Every failure is printed, then the process exits.
//
// HOST TAR RULE: no host tar binary is ever run on a tarball. Git's GNU tar reads a drive-letter path
// ("C:") as a remote host, and the pre-push hook puts that tar first on PATH. The tarball is read
// in-process (listTarEntries: node:zlib plus the POSIX ustar/pax headers).

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, readdir } from 'node:fs/promises';
import { createRequire, isBuiltin } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { publint } from 'publint';
import { formatMessage } from 'publint/utils';
import { extractImageRefs, parseRepoFileUrl, pinProblem } from './readme-rules.ts';

const ROOT = resolve(import.meta.dirname, '..');
export const PACKAGES = ['modern-cmdk', 'create-modern-cmdk', 'modern-cmdk-codemod'] as const;
type PackageName = (typeof PACKAGES)[number];
/** The pinned tarball file lists (create-modern-cmdk's is pinned by tests/dist/create-tarball.test.ts). */
const FILE_LISTS: Partial<Record<PackageName, string>> = {
  'modern-cmdk': 'tests/package/modern-cmdk.files.json',
  'modern-cmdk-codemod': 'tests/package/modern-cmdk-codemod.files.json',
};
const PACK_TIMEOUT_MS = 120_000;
const ATTW_TIMEOUT_MS = 180_000;
const BLOCK = 512;

export interface TarEntry {
  readonly name: string;
  readonly data: Buffer;
  /** The permission bits of the tar header (0o755, 0o644). */
  readonly mode: number;
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
        mode: octal(header, 100, 108) & 0o7777,
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

/** The tarball file list against tests/package/<name>.files.json (or rewrites it). */
function checkFileList(name: PackageName, names: readonly string[], update: boolean): string[] {
  const relative = FILE_LISTS[name];
  if (relative === undefined) return [];
  const path = join(ROOT, relative);
  if (update) {
    writeFileSync(path, `${JSON.stringify(names, null, 2)}\n`);
    write(process.stdout, `[${name}] wrote ${names.length} names to ${relative}`);
    return [];
  }
  if (!existsSync(path)) return [`${relative} does not exist (run with --update)`];
  const expected = JSON.parse(readFileSync(path, 'utf8')) as string[];
  const { missing, extra } = diffFileList(expected, names);
  const failures = [
    ...missing.map((entry) => `file list: missing from the tarball: ${entry}`),
    ...extra.map((entry) => `file list: not in ${relative}: ${entry}`),
  ];
  if (failures.length === 0)
    write(process.stdout, `[${name}] file list: ${names.length} files match`);
  return failures;
}

const DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const;

interface PackedManifest {
  bin?: string | Record<string, string>;
  [field: string]: unknown;
}

/** Failure lines for every catalog: or workspace: value in the dependency fields of a packed package.json. */
export function packedManifestFailures(manifestText: string): string[] {
  const manifest = JSON.parse(manifestText) as PackedManifest;
  const failures: string[] = [];
  for (const field of DEPENDENCY_FIELDS) {
    const table = manifest[field];
    if (typeof table !== 'object' || table === null) continue;
    for (const [dependency, specifier] of Object.entries(table)) {
      if (typeof specifier === 'string' && /^(?:catalog|workspace):/.test(specifier))
        failures.push(`packed manifest: ${field}.${dependency} is "${specifier}"`);
    }
  }
  return failures;
}

/**
 * The source with everything that is not code blanked: the contents of string literals ('...', "..."),
 * of template literals (the text between the backticks and between substitutions) and the whole of line
 * and block comments become spaces. Quotes and backticks stay, newlines and carriage returns stay, so the
 * length, every offset and every line number are those of the input. A template substitution is code
 * again: a stack of brace depths, one entry per open substitution, returns to the template at the
 * matching `}`, so substitutions nest to any depth. A backslash escapes the next character in a string or
 * template; a string still open at a newline ends there, as an unterminated string does.
 *
 * Written for tsdown's output, unminified ESM: the token rules are the ECMAScript string, template and
 * comment productions, and a bare import can only be written as import/export-from, import() or
 * require()/__require(), none of which is valid inside a literal or comment. One blind spot: a regular
 * expression literal is not recognised (telling it from a division needs the previous token), so a quote,
 * a backtick or `//` inside one opens a literal or comment that is not there. A quote ends at the line's
 * end, a backtick can run to the next backtick, and either can hide a bare import after it: a false
 * negative is possible, accepted because the bundled chunks are not expected to hold such a literal (the
 * pack gate runs on the real dist), not because the case cannot occur.
 */
export function blankNonCode(source: string): string {
  const out = source.split('');
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  };
  const depths: number[] = []; // brace depth inside each open template substitution
  let i = 0;
  // i is just past an opening backtick or the closing brace of a substitution
  const template = (): void => {
    const from = i;
    while (i < source.length) {
      const ch = source[i];
      if (ch === '\\') {
        i += 2;
      } else if (ch === '`') {
        blank(from, i);
        i++;
        return;
      } else if (ch === '$' && source[i + 1] === '{') {
        blank(from, i);
        i += 2;
        depths.push(0);
        return;
      } else {
        i++;
      }
    }
    blank(from, source.length);
  };
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "'" || ch === '"') {
      const from = ++i;
      while (i < source.length && source[i] !== ch && source[i] !== '\n') {
        i += source[i] === '\\' ? 2 : 1;
      }
      blank(from, Math.min(i, source.length));
      if (source[i] === ch) i++;
    } else if (ch === '`') {
      i++;
      template();
    } else if (ch === '/' && next === '/') {
      const from = i;
      while (i < source.length && source[i] !== '\n') i++;
      blank(from, i);
    } else if (ch === '/' && next === '*') {
      const from = i;
      const close = source.indexOf('*/', i + 2);
      i = close === -1 ? source.length : close + 2;
      blank(from, i);
    } else if (ch === '{' && depths.length > 0) {
      depths[depths.length - 1] = (depths[depths.length - 1] ?? 0) + 1;
      i++;
    } else if (ch === '}' && depths.length > 0) {
      i++;
      if (depths[depths.length - 1] === 0) {
        depths.pop();
        template();
      } else {
        depths[depths.length - 1] = (depths[depths.length - 1] ?? 1) - 1;
      }
    } else {
      i++;
    }
  }
  return out.join('');
}

// Run over blankNonCode's output, where the quotes still delimit a specifier but its text is spaces:
// the specifier is read back from the original source at the offsets of capture group 2 (the d flag).
const IMPORT_SPECIFIERS: readonly RegExp[] = [
  /^[ \t]*(?:import|export)\b[^;'"`()=]*?\bfrom\s*(["'])([^"'\n]+)\1/dgm, // import x from 'a' / export * from 'a'
  /^[ \t]*import\s*(["'])([^"'\n]+)\1/dgm, // import 'a'
  /\bimport\s*\(\s*(["'])([^"'\n]+)\1\s*\)/dg, // import('a')
  /(?<![\w$.])(?:__require|require)\s*\(\s*(["'])([^"'\n]+)\1\s*\)/dg, // require('a') and rolldown's __require('a')
];

/**
 * The bare specifiers (neither relative, absolute nor a Node builtin: `node:x`, or a bare builtin name such as
 * `fs`, by `module.isBuiltin`) a code string imports. `require(...)` and rolldown's `__require(...)` both count.
 * A regex over unminified ESM (tsdown output) after `blankNonCode`: string and template contents and
 * comments are spaces, so a call or statement written inside one is never matched, wherever it sits on
 * its line and whatever else that line holds. A static import or re-export must still start its line.
 * A computed specifier is not seen at all.
 */
export function bareImports(code: string): string[] {
  const found = new Set<string>();
  const source = blankNonCode(code);
  for (const pattern of IMPORT_SPECIFIERS) {
    for (const match of source.matchAll(pattern)) {
      const range = match.indices?.[2];
      if (range === undefined) continue;
      const specifier = code.slice(range[0], range[1]);
      if (/^(?:\.|\/|node:)/.test(specifier) || isBuiltin(specifier)) continue;
      found.add(specifier);
    }
  }
  return [...found].sort();
}

/** The package a bare specifier names: 'a/b' is 'a', '@s/a/b' is '@s/a'. */
function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
}

/**
 * The import allow-list: modern-cmdk-codemod's dist .mjs files may import node: builtins and the
 * declared `dependencies`; modern-cmdk's dist/codemod .mjs files may import node: builtins only.
 * Other packages are not checked.
 */
export function importAllowListFailures(
  name: string,
  entries: readonly TarEntry[],
  dependencies: readonly string[],
): string[] {
  let scope: RegExp;
  let allowed: ReadonlySet<string>;
  if (name === 'modern-cmdk-codemod') {
    scope = /^dist\/.+\.mjs$/;
    allowed = new Set(dependencies);
  } else if (name === 'modern-cmdk') {
    scope = /^dist\/codemod\/.+\.mjs$/;
    allowed = new Set();
  } else return [];
  const rule =
    name === 'modern-cmdk-codemod'
      ? 'a node: builtin nor a declared dependency'
      : 'a node: builtin';
  const failures: string[] = [];
  for (const { name: path, data } of entries) {
    if (!scope.test(path)) continue;
    for (const specifier of bareImports(data.toString('utf8'))) {
      if (!allowed.has(packageOf(specifier)))
        failures.push(`imports: ${path} imports "${specifier}", which is not ${rule}`);
    }
  }
  return failures;
}

/**
 * Every bin target of the packed manifest exists in the tarball and starts with the node shebang.
 * Each target's tar header mode also carries the execute bits (0o111).
 */
export function binFailures(entries: readonly TarEntry[], manifestText: string): string[] {
  const { bin } = JSON.parse(manifestText) as PackedManifest;
  const targets = typeof bin === 'string' ? [bin] : Object.values(bin ?? {});
  if (targets.length === 0) return ['bin: the packed manifest declares no bin'];
  const failures: string[] = [];
  for (const target of targets) {
    const path = target.replace(/^\.\//, '');
    const entry = entries.find((candidate) => candidate.name === path);
    if (entry === undefined) {
      failures.push(`bin: ${path} is not in the tarball`);
      continue;
    }
    if (!entry.data.toString('utf8').startsWith('#!/usr/bin/env node\n'))
      failures.push(`bin: ${path} does not start with #!/usr/bin/env node`);
    if ((entry.mode & 0o111) !== 0o111)
      failures.push(`bin: ${path} has mode ${entry.mode.toString(8)}, the execute bits are lost`);
  }
  return failures;
}

/** 'use client' on every modern-cmdk dist/react/*.mjs and on no other .mjs of the published packages. */
export function clientDirectiveFailures(name: string, entries: readonly TarEntry[]): string[] {
  const failures: string[] = [];
  let checked = 0;
  for (const { name: path, data } of entries) {
    if (!path.endsWith('.mjs')) continue;
    const react = name === 'modern-cmdk' && /^dist\/react\/[^/]+\.mjs$/.test(path);
    const other =
      name === 'modern-cmdk'
        ? /^dist\/(?:core|codemod)\//.test(path)
        : name === 'modern-cmdk-codemod' && path.startsWith('dist/');
    if (!react && !other) continue;
    checked += 1;
    const has = startsWithUseClient(data.toString('utf8'));
    if (react && !has) failures.push(`use client: ${path} does not start with the directive`);
    if (other && has) failures.push(`use client: ${path} must not start with the directive`);
  }
  if (failures.length === 0)
    write(process.stdout, `[${name}] use client: ${checked} .mjs files as expected`);
  return failures;
}

/** Where a commit stands in this checkout: the path is there, the commit lacks it, or the commit itself is unknown. */
export type CommitPath = 'present' | 'missing-path' | 'missing-commit';

/**
 * Failure lines for the images of a packed README: an <img> or ![](...) without alt text, an image with no src, a
 * relative path, and an image from this repository whose ref is not a full 40-hex commit or whose commit does not
 * hold the file. `where` answers the last question (git, in main()). Images from other hosts are not checked.
 */
export function readmeImageFailures(
  readme: string,
  where: (sha: string, path: string) => CommitPath,
): string[] {
  const failures: string[] = [];
  for (const image of extractImageRefs(readme)) {
    const at = `README.md:${image.line}`;
    if (image.tag !== 'source' && (image.alt ?? '').trim() === '') {
      failures.push(`README images: ${at}: the image has no alt text`);
    }
    if (image.url === '') {
      failures.push(`README images: ${at}: the image has no src`);
      continue;
    }
    const file = parseRepoFileUrl(image.url);
    if (file === undefined) {
      if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(image.url)) {
        failures.push(
          `README images: ${at}: ${image.url} is a relative path, which npm resolves to the HEAD of main (name a 40-hex commit in a raw.githubusercontent.com URL)`,
        );
      }
      continue;
    }
    const problem: string | undefined = pinProblem(file.ref);
    if (problem !== undefined) {
      failures.push(`README images: ${at}: ${image.url} — ${problem}`);
      continue;
    }
    const state: CommitPath = where(file.ref, file.path);
    if (state === 'missing-commit') {
      failures.push(
        `README images: ${at}: commit ${file.ref} is not in this checkout and could not be fetched from origin`,
      );
    } else if (state === 'missing-path') {
      failures.push(
        `README images: ${at}: ${file.path || '(no path)'} does not exist at commit ${file.ref}`,
      );
    }
  }
  return failures;
}

const fetchedCommits = new Set<string>();

/** Whether `git` in the repository root reaches the object (exit 0 of `git cat-file -e`). */
function gitHas(spec: string): boolean {
  return spawnSync('git', ['cat-file', '-e', spec], { cwd: ROOT, stdio: 'ignore' }).status === 0;
}

/** The README image lookup main() hands to readmeImageFailures: git in this checkout, with one fetch of a commit it lacks. */
export function commitHasPath(sha: string, path: string): CommitPath {
  if (!gitHas(`${sha}^{commit}`) && !fetchedCommits.has(sha)) {
    fetchedCommits.add(sha);
    const shallow = spawnSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).stdout.trim();
    write(
      process.stdout,
      `check-package: commit ${sha} is not in this checkout; fetching it from origin`,
    );
    spawnSync(
      'git',
      ['fetch', '--no-tags', ...(shallow === 'true' ? ['--depth=1'] : []), 'origin', sha],
      { cwd: ROOT, stdio: 'ignore', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
    );
  }
  if (!gitHas(`${sha}^{commit}`)) return 'missing-commit';
  return gitHas(`${sha}:${path}`) ? 'present' : 'missing-path';
}

function usage(message: string): never {
  write(process.stderr, `check-package: ${message}`);
  write(
    process.stderr,
    `usage: node scripts/check-package.ts [--package ${PACKAGES.join('|')}] [--pack-dir <dir>] [--tarball <tgz>] [--update]`,
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
  if (values.update === true && !names.some((name) => FILE_LISTS[name] !== undefined))
    usage('--update needs modern-cmdk or modern-cmdk-codemod');
  if (values.tarball !== undefined && !existsSync(values.tarball))
    usage(`--tarball ${values.tarball} does not exist`);
  // A given tarball belongs to one package: --package, or modern-cmdk when there is none.
  const checked: readonly PackageName[] =
    values.tarball === undefined ? names : [(selected as PackageName | undefined) ?? 'modern-cmdk'];

  if (/["`$%&|<>^]/.test(values['pack-dir'] ?? '')) usage('--pack-dir holds a shell metacharacter');
  const packDir =
    absolutePackDir(values['pack-dir'], process.cwd()) ??
    (await mkdtemp(join(tmpdir(), 'check-package-')));
  const failures: string[] = [];
  for (const name of checked) {
    const tarball =
      values.tarball === undefined ? await pack(name, packDir) : resolve(values.tarball);
    write(process.stdout, `[${name}] tarball: ${tarball}`);
    const found: string[] = [...(await checkPublint(name, tarball))];
    if (name === 'modern-cmdk') found.push(...checkAttw(name, tarball));
    const entries = listTarEntries(readFileSync(tarball)).map((entry) => ({
      ...entry,
      name: entry.name.replace(/^[^/]+\//, ''),
    }));
    found.push(
      ...checkFileList(name, entries.map((entry) => entry.name).sort(), values.update === true),
    );
    const packed = entries.find((entry) => entry.name === 'package.json');
    if (packed === undefined) found.push('the tarball has no package.json');
    else {
      const text = packed.data.toString('utf8');
      const manifest = JSON.parse(text) as PackedManifest;
      const declared = DEPENDENCY_FIELDS.flatMap((field) =>
        Object.keys((manifest[field] as object | undefined) ?? {}),
      );
      found.push(
        ...packedManifestFailures(text),
        ...importAllowListFailures(name, entries, declared),
        ...binFailures(entries, text),
      );
    }
    found.push(...clientDirectiveFailures(name, entries));
    const readme = entries.find((entry) => entry.name === 'README.md');
    found.push(
      ...(readme === undefined
        ? ['README images: the tarball has no README.md']
        : readmeImageFailures(readme.data.toString('utf8'), commitHasPath)),
    );
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
