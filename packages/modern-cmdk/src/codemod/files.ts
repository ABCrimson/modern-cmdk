// modern-cmdk — Codemod file discovery, parser choice and git checks.
//
// Discovery runs on `fs.promises.glob` (stable since Node 22.0.0) with `withFileTypes` and an
// `exclude` function. The deprecated `modern-cmdk` bin keeps 1.4's four ignores and no .gitignore;
// the `modern-cmdk-codemod` profile excludes more directories, applies .gitignore through
// `git check-ignore`, and refuses to write into a dirty or untracked tree (see findDirtyFiles).

import { execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { glob, lstat, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

/** Which bin is running. `modern-cmdk` is the deprecated bundled bin; the default until W3-01. */
export type Program = 'modern-cmdk' | 'modern-cmdk-codemod';

/** The jscodeshift parser names the CLI uses. */
export type ParserName = 'ts' | 'tsx' | 'babel';

const PARSERS: ReadonlyMap<string, ParserName> = new Map<string, ParserName>([
  ['.ts', 'ts'],
  ['.mts', 'ts'],
  ['.cts', 'ts'],
  ['.tsx', 'tsx'],
  ['.js', 'babel'],
  ['.jsx', 'babel'],
  ['.mjs', 'babel'],
  ['.cjs', 'babel'],
]);

const STYLESHEETS: ReadonlySet<string> = new Set(['.css', '.scss']);

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return dot > slash ? path.slice(dot).toLowerCase() : '';
}

/**
 * The jscodeshift parser for a script file: `ts` for .ts/.mts/.cts, `tsx` for .tsx, `babel` (which
 * parses JSX) for .js/.jsx/.mjs/.cjs. `undefined` for anything that is not a script.
 */
export function parserFor(path: string): ParserName | undefined {
  return PARSERS.get(extensionOf(path));
}

/** How the CLI handles a file: through the default export, through `transformStylesheet`, or not at all. */
export type Route = 'script' | 'stylesheet' | 'skip';

export function routeFor(path: string): Route {
  if (PARSERS.has(extensionOf(path))) return 'script';
  return STYLESHEETS.has(extensionOf(path)) ? 'stylesheet' : 'skip';
}

/** What a directory argument expands to, relative to that directory. */
const DIRECTORY_GLOB = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,css,scss}';

/**
 * On win32 every backslash of a command-line pattern becomes '/' (glob syntax has no other use for
 * it there). Elsewhere a backslash is an escape and stays. Braces are never escaped: the directory
 * form needs them.
 */
export function normalizePattern(
  arg: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === 'win32' ? arg.replaceAll('\\', '/') : arg;
}

const LEGACY_EXCLUDES: ReadonlySet<string> = new Set(['node_modules', 'dist', 'build', '.next']);
const CODEMOD_EXCLUDES: ReadonlySet<string> = new Set([
  ...LEGACY_EXCLUDES,
  '.git',
  'coverage',
  '.turbo',
  'out',
  'storybook-static',
  '.vercel',
]);

// --- git -------------------------------------------------------------------

interface GitResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Run git with execFile. Resolves on any exit code; rejects on a spawn failure (ENOENT when git is
 * missing). Inherits process.env, so tests steer it with vi.stubEnv.
 */
function runGit(args: readonly string[], cwd: string, input = ''): Promise<GitResult> {
  const { promise, resolve: done, reject } = Promise.withResolvers<GitResult>();
  const child = execFile(
    'git',
    [...args],
    { cwd, encoding: 'utf8', maxBuffer: 1024 ** 3, windowsHide: true },
    (error, stdout, stderr) => {
      if (error === null) return done({ code: 0, stdout, stderr });
      const code = (error as NodeJS.ErrnoException).code;
      if (typeof code === 'number') return done({ code, stdout, stderr });
      reject(error);
    },
  );
  child.stdin?.on('error', () => {});
  child.stdin?.end(input);
  return promise;
}

type Repo =
  | { readonly kind: 'repo'; readonly root: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'missing' };

async function locateRepo(cwd: string): Promise<Repo> {
  try {
    const { code, stdout } = await runGit(['rev-parse', '--show-toplevel'], cwd);
    return code === 0 ? { kind: 'repo', root: resolve(stdout.trim()) } : { kind: 'none' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
    throw error;
  }
}

/** Paths of `files` relative to the repo root (forward slashes), `undefined` for those outside it. */
async function relativeToRoot(
  files: readonly string[],
  cwd: string,
  root: string,
): Promise<(string | undefined)[]> {
  // realpath on both ends: git prints the long, resolved root; cwd may be a short or linked path.
  const prefix = relative(await realpath(root), await realpath(cwd));
  return files.map((file) => {
    const rel = normalize(join(prefix, relative(cwd, file)));
    return rel.startsWith('..') || isAbsolute(rel) ? undefined : rel.replaceAll('\\', '/');
  });
}

const key = (path: string): string => (process.platform === 'win32' ? path.toLowerCase() : path);

async function dropGitIgnored(
  files: string[],
  cwd: string,
  warn: (message: string) => void,
): Promise<string[]> {
  const repo = await locateRepo(cwd);
  if (repo.kind === 'missing') {
    warn('warning: git not found; .gitignore is not applied');
    return files;
  }
  if (repo.kind === 'none') return files;

  const rels = await relativeToRoot(files, cwd, repo.root);
  const inside = rels.filter((rel): rel is string => rel !== undefined);
  if (inside.length === 0) return files;
  const { code, stdout, stderr } = await runGit(
    ['check-ignore', '-z', '--stdin'],
    repo.root,
    inside.join('\0'),
  );
  // Exit 0: some paths are ignored; 1: none are. Anything else is a failure, never "nothing ignored".
  if (code !== 0 && code !== 1) {
    throw new Error(`git check-ignore failed (exit ${code}): ${stderr.trim()}`);
  }
  const ignored = new Set(stdout.split('\0').filter((p) => p !== ''));
  return files.filter((_, index) => {
    const rel = rels[index];
    return rel === undefined || !ignored.has(rel);
  });
}

/** realpath of a file; for one deleted since discovery, its parent's realpath plus its name. */
async function realpathOrParent(file: string): Promise<string> {
  try {
    return await realpath(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return join(await realpath(dirname(file)), basename(file));
  }
}

/** What `git status` says about the matched files. */
export type DirtyResult =
  | { readonly kind: 'clean' }
  /** Absolute paths of matched files that are modified, staged, deleted or untracked. */
  | { readonly kind: 'dirty'; readonly paths: readonly string[] }
  /** Absolute paths of matched files that lie outside the work tree `cwd` belongs to. */
  | { readonly kind: 'outside'; readonly paths: readonly string[] }
  | { readonly kind: 'no-repo' }
  | { readonly kind: 'no-git' };

/**
 * `git status --porcelain -z` in `cwd`, intersected with `files`. Untracked files count as dirty
 * (a codemod write to one cannot be undone); ignored files were already dropped by discovery. An
 * untracked directory entry (a nested repository, which git never descends into, or any untracked
 * directory) makes every matched file under it dirty.
 */
export async function findDirtyFiles(files: readonly string[], cwd: string): Promise<DirtyResult> {
  const repo = await locateRepo(cwd);
  if (repo.kind === 'missing') return { kind: 'no-git' };
  if (repo.kind === 'none') return { kind: 'no-repo' };

  const { code, stdout, stderr } = await runGit(
    ['--no-optional-locks', 'status', '--porcelain', '-z', '--untracked-files=all'],
    cwd,
  );
  if (code !== 0) throw new Error(`git status failed (exit ${code}): ${stderr.trim()}`);

  // Entries are `XY path`; a rename or copy is followed by its origin path as a bare entry.
  const dirty = new Set<string>();
  const dirtyDirs: string[] = [];
  const entries = stdout.split('\0');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as string;
    if (entry.length < 4) continue;
    const path = entry.slice(3);
    if (path.endsWith('/')) dirtyDirs.push(key(path));
    else dirty.add(key(path));
    if (/[RC]/.test(entry.slice(0, 2))) {
      const origin = entries[++i];
      if (origin !== undefined) dirty.add(key(origin));
    }
  }
  const realRoot = await realpath(repo.root);
  const outside: string[] = [];
  for (const file of files) {
    const r = relative(realRoot, await realpathOrParent(file));
    if (r.startsWith('..') || isAbsolute(r)) outside.push(file);
  }
  if (outside.length > 0) return { kind: 'outside', paths: outside };
  const rels = await relativeToRoot(files, cwd, repo.root);
  const paths = files.filter((_, index) => {
    const rel = rels[index];
    return (
      rel !== undefined && (dirty.has(key(rel)) || dirtyDirs.some((d) => key(rel).startsWith(d)))
    );
  });
  return paths.length === 0 ? { kind: 'clean' } : { kind: 'dirty', paths };
}

// --- discovery ---------------------------------------------------------------

/** True when a directory between cwd and `file` is a symbolic link (or junction). */
async function reachedThroughSymlink(file: string, cwd: string): Promise<boolean> {
  const rel = relative(cwd, file);
  if (rel.startsWith('..') || isAbsolute(rel)) return false;
  let at = cwd;
  for (const part of rel.split(sep).slice(0, -1)) {
    at = join(at, part);
    if ((await lstat(at)).isSymbolicLink()) return true;
  }
  return false;
}

/** Where discovery runs and where it reports git trouble. */
export interface DiscoverOptions {
  readonly program: Program;
  readonly cwd: string;
  readonly warn: (message: string) => void;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    // Not a path at all (a glob pattern, or a miss): the pattern goes to glob unchanged.
    return false;
  }
}

/**
 * Resolve command-line patterns to absolute, de-duplicated, sorted file paths. A directory argument
 * expands to its script and stylesheet files. `modern-cmdk-codemod` also skips more build
 * directories and the paths .gitignore covers. `**` descends no symlinked directory in either program;
 * modern-cmdk-codemod also drops every file reached through a symlinked directory below cwd.
 */
export async function discoverFiles(
  patterns: readonly string[],
  { program, cwd, warn }: DiscoverOptions,
): Promise<string[]> {
  const dirs: string[] = [];
  const globs: string[] = [];
  for (const arg of patterns) {
    const pattern = normalizePattern(arg);
    const abs = resolve(cwd, pattern);
    if (await isDirectory(abs)) dirs.push(abs);
    else globs.push(pattern);
  }
  const excluded = program === 'modern-cmdk-codemod' ? CODEMOD_EXCLUDES : LEGACY_EXCLUDES;
  // `exclude` prunes the walk under `**` only: a wildcard or literal segment (`src/*/x.ts`,
  // `dist/x.ts`) still reaches an excluded directory, so the paths are checked again below.
  const exclude = (d: Dirent): boolean => excluded.has(d.name);
  // A directory argument globs from inside that directory, so glob syntax in its own name
  // (app/[slug], app/{a,b}) is a literal path, as 1.4's directory expansion treated it.
  const entries = [
    ...(globs.length > 0
      ? await Array.fromAsync(glob(globs, { cwd, withFileTypes: true, exclude }))
      : []),
    ...(
      await Promise.all(
        dirs.map((d) =>
          Array.fromAsync(glob(DIRECTORY_GLOB, { cwd: d, withFileTypes: true, exclude })),
        ),
      )
    ).flat(),
  ];
  const files = [
    ...new Set(entries.filter((d) => d.isFile()).map((d) => resolve(d.parentPath, d.name))),
  ]
    .filter(
      (file) =>
        !relative(cwd, file)
          .split(sep)
          .some((segment) => excluded.has(segment)),
    )
    .sort();
  if (program !== 'modern-cmdk-codemod') return files;
  const through = await Promise.all(files.map((file) => reachedThroughSymlink(file, cwd)));
  return dropGitIgnored(
    files.filter((_, index) => !through[index]),
    cwd,
    warn,
  );
}
