// modern-cmdk — Codemod file discovery, parser choice and git checks.
//
// Discovery runs on `fs.promises.glob` (added in Node 22.0.0, stable since Node 24.0.0 and 22.17.0;
// the bin's floor is Node >= 26.4.0) with `withFileTypes` and an `exclude` function. The
// deprecated `modern-cmdk` bin keeps 1.4's four ignores and no .gitignore; the `modern-cmdk-codemod`
// profile excludes more directories, applies .gitignore through `git check-ignore`, and refuses to
// write into a dirty or untracked tree (see findDirtyFiles). Git is spawned by an absolute path that
// resolveGit finds on PATH outside the work tree being migrated (trustBoundary, computed once per
// operation): a bare `git` is searched for by libuv, and a git planted in a cloned repository (a
// relative or empty PATH entry, an entry or a link inside the tree) would run with the user's rights
// (CWE-426, the reviews of 1223dc5 and cd9d415).

import { execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { access, constants, glob, lstat, realpath, stat } from 'node:fs/promises';
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from 'node:path';

/** Which bin is running. `modern-cmdk` is the deprecated bundled bin that the modern-cmdk shim runs; `modern-cmdk-codemod` is the default of run(). */
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
 * The trust boundary of one operation: the realpath of the nearest directory, from `realpath(cwd)`
 * upward, that holds a `.git` entry (a directory, or the file a worktree or submodule has), else
 * `realpath(cwd)` when no ancestor holds one. It is the work tree `git rev-parse --show-toplevel`
 * reports, computed without spawning git, and realpath'd so that a linked cwd (macOS's `/var` ->
 * `/private/var`) or a short Windows path (`RUNNER~1`) compares equal to what git prints. Not the
 * cwd, which may be a subdirectory of the tree whose other directories a planted git can sit in.
 * Not the outermost work tree either: a dotfiles repository at the home directory would exclude
 * every PATH entry under the home (shims, `~/.local/bin`) and leave the user with no git.
 */
export async function trustBoundary(cwd: string): Promise<string> {
  const start = await realpath(cwd);
  for (let at = start; ; at = dirname(at)) {
    if (
      await lstat(join(at, '.git')).then(
        () => true,
        () => false,
      )
    ) {
      return at;
    }
    if (dirname(at) === at) return start;
  }
}

/** True when `path` is `boundary` or lies under it. Written once, for gitSearchDirs and resolveGit. */
function inside(boundary: string, path: string): boolean {
  const rel = relative(boundary, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * The directories of a PATH value that may hold git: absolute entries outside `boundary`, the work
 * tree being migrated. Empty and relative entries are dropped (they name the working directory), and
 * so is any entry equal to or under `boundary`, which may carry a planted executable. Order is kept.
 * This is the syntactic filter; resolveGit also compares real paths.
 */
export function gitSearchDirs(pathValue: string | undefined, boundary: string): readonly string[] {
  return (pathValue ?? '')
    .split(delimiter)
    .filter((entry) => entry !== '' && isAbsolute(entry) && !inside(boundary, entry));
}

/**
 * True when `candidate` is a regular file (a directory named git is not git) that the process may
 * execute (`access` with X_OK is a plain existence check on Windows) and whose own realpath lies
 * outside `boundary`, so a link into the tree is refused.
 */
async function isGitOutside(candidate: string, boundary: string): Promise<boolean> {
  try {
    if (!(await stat(candidate)).isFile()) return false;
    await access(candidate, constants.X_OK);
    return !inside(boundary, await realpath(candidate));
  } catch {
    // Not here, not executable or a dangling link: the next candidate.
    return false;
  }
}

const resolvedGit = new Map<string, Promise<string>>();

/**
 * The absolute path of the first git executable in PATH's `gitSearchDirs`, so the spawn does no
 * search of its own. A kept entry is skipped when its realpath is inside `boundary` (a link or an
 * alias into the tree) or does not resolve. Looks for `git.exe` then `git.com` on win32 (the names
 * libuv tries) and `git` elsewhere; isGitOutside says what a candidate must be. `boundary` comes
 * from trustBoundary and is the same for every spawn of one operation, so a submodule's directory
 * or a subdirectory cwd never narrows it. The answer is kept per boundary and PATH value for the
 * life of the process. Rejects with ENOENT, naming `boundary`, when there is none.
 */
export function resolveGit(boundary: string): Promise<string> {
  const pathValue = process.env.PATH;
  const cacheKey = JSON.stringify([boundary, pathValue]);
  const cached = resolvedGit.get(cacheKey);
  if (cached !== undefined) return cached;
  const names = process.platform === 'win32' ? ['git.exe', 'git.com'] : ['git'];
  const found = (async (): Promise<string> => {
    for (const searchDir of gitSearchDirs(pathValue, boundary)) {
      const realDir = await realpath(searchDir).catch(() => undefined);
      if (realDir === undefined || inside(boundary, realDir)) continue;
      for (const name of names) {
        const candidate = join(searchDir, name);
        if (await isGitOutside(candidate, boundary)) return candidate;
      }
    }
    throw Object.assign(new Error(`git was not found on PATH outside ${boundary}`), {
      code: 'ENOENT',
    });
  })();
  resolvedGit.set(cacheKey, found);
  found.catch(() => resolvedGit.delete(cacheKey));
  return found;
}

/**
 * Run git in `cwd` with execFile on the absolute path resolveGit finds outside `boundary`. The two
 * differ on purpose: `cwd` is where git runs (the repository root, a submodule's directory or a
 * subdirectory); `boundary` is the operation's trustBoundary, what PATH is filtered against. Resolves
 * on any exit code; rejects on a spawn failure, and with ENOENT when git is missing. Reads
 * process.env.PATH at each call, so tests steer it with vi.stubEnv.
 */
async function runGit(
  args: readonly string[],
  cwd: string,
  boundary: string,
  input = '',
): Promise<GitResult> {
  const executable = await resolveGit(boundary);
  const { promise, resolve: done, reject } = Promise.withResolvers<GitResult>();
  const child = execFile(
    executable,
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

async function locateRepo(cwd: string, boundary: string): Promise<Repo> {
  try {
    const { code, stdout } = await runGit(['rev-parse', '--show-toplevel'], cwd, boundary);
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

/**
 * Root-relative paths of the gitlinks (mode 160000: submodules) in the repository at `root`. One
 * level is enough: a submodule nested inside a submodule is not looked for.
 */
async function gitlinksOf(root: string, boundary: string): Promise<string[]> {
  const { code, stdout, stderr } = await runGit(['ls-files', '-s', '-z'], root, boundary);
  if (code !== 0) throw new Error(`git ls-files failed (exit ${code}): ${stderr.trim()}`);
  // Entries are `<mode> <object> <stage>\t<path>`.
  return stdout
    .split('\0')
    .filter((entry) => entry.startsWith('160000 '))
    .map((entry) => entry.slice(entry.indexOf('\t') + 1));
}

/** The paths of `rels` that `git check-ignore` run in `owner` reports as ignored. */
async function ignoredIn(
  owner: string,
  rels: readonly string[],
  boundary: string,
): Promise<Set<string>> {
  const { code, stdout, stderr } = await runGit(
    ['check-ignore', '-z', '--stdin'],
    owner,
    boundary,
    rels.join('\0'),
  );
  // Exit 0: some paths are ignored; 1: none are. Anything else is a failure, never "nothing ignored".
  if (code !== 0 && code !== 1) {
    throw new Error(`git check-ignore failed (exit ${code}): ${stderr.trim()}`);
  }
  return new Set(stdout.split('\0').filter((p) => p !== ''));
}

async function dropGitIgnored(
  files: string[],
  cwd: string,
  boundary: string,
  warn: (message: string) => void,
): Promise<string[]> {
  const repo = await locateRepo(cwd, boundary);
  if (repo.kind === 'missing') {
    warn('warning: git not found; .gitignore is not applied');
    return files;
  }
  if (repo.kind === 'none') return files;

  const rels = await relativeToRoot(files, cwd, repo.root);
  if (!rels.some((rel) => rel !== undefined)) return files;
  // git refuses a path inside a submodule (exit 128), so each file is checked by the repository
  // that owns it: the deepest gitlink above it, else the parent. Paths go in relative to the owner.
  const gitlinks = (await gitlinksOf(repo.root, boundary)).map(key);
  const groups = new Map<string, { root: string; indexes: number[]; paths: string[] }>();
  rels.forEach((rel, index) => {
    if (rel === undefined) return;
    const link = gitlinks
      .filter((g) => key(rel).startsWith(`${g}/`))
      .reduce<string>((deepest, g) => (g.length > deepest.length ? g : deepest), '');
    const group = groups.get(link) ?? {
      root: link === '' ? repo.root : join(repo.root, rel.slice(0, link.length)),
      indexes: [],
      paths: [],
    };
    group.indexes.push(index);
    group.paths.push(link === '' ? rel : rel.slice(link.length + 1));
    groups.set(link, group);
  });
  const drop = new Set<number>();
  for (const group of groups.values()) {
    const ignored = await ignoredIn(group.root, group.paths, boundary);
    group.paths.forEach((path, i) => {
      if (ignored.has(path)) drop.add(group.indexes[i] as number);
    });
  }
  return files.filter((_, index) => !drop.has(index));
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
 * (a codemod write to one cannot be undone); ignored files were already dropped by discovery. A
 * modified submodule (status runs with `--ignore-submodules=none`, so modified or untracked files in
 * it count) or an untracked directory entry (a nested repository, which git never descends into, or
 * any untracked directory) makes every matched file under it dirty.
 */
export async function findDirtyFiles(files: readonly string[], cwd: string): Promise<DirtyResult> {
  const boundary = await trustBoundary(cwd);
  const repo = await locateRepo(cwd, boundary);
  if (repo.kind === 'missing') return { kind: 'no-git' };
  if (repo.kind === 'none') return { kind: 'no-repo' };

  const { code, stdout, stderr } = await runGit(
    [
      '--no-optional-locks',
      'status',
      '--porcelain',
      '-z',
      '--untracked-files=all',
      '--ignore-submodules=none',
    ],
    cwd,
    boundary,
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
    else {
      dirty.add(key(path));
      // A modified submodule prints as ` M sub`, no trailing '/': a directory on disk is a gitlink
      // (or a path replaced by one), and every file under it is dirty.
      const stats = await lstat(join(repo.root, path)).catch(() => undefined);
      if (stats?.isDirectory()) dirtyDirs.push(`${key(path)}/`);
    }
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
  // fs.glob's followSymlinks (v26.1.0) already defaults to false and governs only `**`: the same four
  // symlink tests pass with it set, but an explicit pattern through a link and the strict drop below
  // still need the manual handling, so it is not passed.
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
    await trustBoundary(cwd),
    warn,
  );
}
