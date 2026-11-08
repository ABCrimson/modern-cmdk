import { existsSync } from 'node:fs';
import {
  appendFile,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  discoverFiles,
  findDirtyFiles,
  gitSearchDirs,
  normalizePattern,
  parserFor,
  resolveGit,
  routeFor,
  trustBoundary,
} from '../../packages/modern-cmdk-codemod/src/files.js';
import { git, gitEnv } from './git-fixture.js';

let dir: string;
let configDir: string;
let warnings: string[];

const touch = async (rel: string, text = 'export const x = 1;\n'): Promise<void> => {
  await mkdir(dirname(join(dir, rel)), { recursive: true });
  await writeFile(join(dir, rel), text);
};
/** Absolute paths discovery returned, as cwd-relative forward-slash strings. */
const rel = (paths: readonly string[]): string[] =>
  paths.map((p) => p.slice(dir.length + 1).replaceAll('\\', '/'));
const find = async (
  patterns: string[],
  program: 'modern-cmdk' | 'modern-cmdk-codemod',
): Promise<string[]> =>
  rel(
    await discoverFiles(patterns, {
      program,
      cwd: dir,
      warn: (m: string) => void warnings.push(m),
    }),
  );

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'modern-cmdk-files-'));
  configDir = await mkdtemp(join(tmpdir(), 'modern-cmdk-files-git-'));
  warnings = [];
  for (const [name, value] of Object.entries(gitEnv(configDir))) vi.stubEnv(name, value);
  // Without a work tree above `dir` the git steps see "not a repository" whatever the host has.
  vi.stubEnv('GIT_CEILING_DIRECTORIES', dirname(dir));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
  await rm(configDir, { recursive: true, force: true });
});

describe('codemod files: parserFor and routeFor', () => {
  it.each([
    ['a.ts', 'ts'],
    ['a.mts', 'ts'],
    ['a.cts', 'ts'],
    ['a.d.ts', 'ts'],
    ['a.tsx', 'tsx'],
    ['a.js', 'babel'],
    ['a.jsx', 'babel'],
    ['a.mjs', 'babel'],
    ['a.cjs', 'babel'],
    ['dir.x/a.JS', 'babel'],
  ] as const)('CLI-3, RP-16: parserFor(%s) is %s', (path, parser) => {
    expect(parserFor(path)).toBe(parser);
    expect(routeFor(path)).toBe('script');
  });

  it.each(['a.css', 'a.scss', 'a.json', 'a.md', 'Makefile', 'dir.ts/readme'])(
    'CLI-4: %s is not a script',
    (path) => {
      expect(parserFor(path)).toBeUndefined();
    },
  );

  it('CLI-4: routeFor sends .css and .scss to the stylesheet transform and skips the rest', () => {
    expect(routeFor('a.css')).toBe('stylesheet');
    expect(routeFor('a.SCSS')).toBe('stylesheet');
    expect(routeFor('a.json')).toBe('skip');
    expect(routeFor('LICENSE')).toBe('skip');
  });
});

describe('codemod files: normalizePattern', () => {
  it('RP-20: on win32 every backslash becomes a forward slash', () => {
    expect(normalizePattern(String.raw`src\components\**\*.tsx`, 'win32')).toBe(
      'src/components/**/*.tsx',
    );
    expect(normalizePattern(String.raw`C:\repo\src`, 'win32')).toBe('C:/repo/src');
  });

  it('RP-20: braces survive (globby convertPathToPattern would escape them)', () => {
    expect(normalizePattern(String.raw`src\**\*.{ts,tsx}`, 'win32')).toBe('src/**/*.{ts,tsx}');
  });

  it('RP-20: elsewhere a backslash is an escape and stays', () => {
    expect(normalizePattern(String.raw`src/a\*b.tsx`, 'linux')).toBe(String.raw`src/a\*b.tsx`);
    expect(normalizePattern(String.raw`src/a\*b.tsx`, 'darwin')).toBe(String.raw`src/a\*b.tsx`);
  });

  it.skipIf(process.platform !== 'win32')(
    'RP-20: a backslash pattern matches its files on this win32 host',
    async () => {
      await touch('src/a.tsx');
      expect(await find([String.raw`src\*.tsx`], 'modern-cmdk-codemod')).toEqual(['src/a.tsx']);
      expect(await find([String.raw`${dir}\src\*.tsx`], 'modern-cmdk')).toEqual(['src/a.tsx']);
    },
  );
});

describe('codemod files: discovery', () => {
  it('CLI-4: a directory named x.ts and the pattern src/** never reach a transform', async () => {
    await touch('src/x.ts/inner.ts');
    await touch('src/a.tsx');
    for (const program of ['modern-cmdk', 'modern-cmdk-codemod'] as const) {
      expect(await find(['src/**'], program)).toEqual(['src/a.tsx', 'src/x.ts/inner.ts']);
    }
  });

  it('CLI-4: a directory argument expands to its script and stylesheet files in both programs', async () => {
    for (const name of [
      'a.ts',
      'b.tsx',
      'c.mts',
      'd.cts',
      'e.js',
      'f.jsx',
      'g.mjs',
      'h.cjs',
      'i.css',
      'j.scss',
      'sub/deep.ts',
      'k.json',
      'l.md',
      'm.png',
    ]) {
      await touch(`src/${name}`);
    }
    const expected = [
      'a.ts',
      'b.tsx',
      'c.mts',
      'd.cts',
      'e.js',
      'f.jsx',
      'g.mjs',
      'h.cjs',
      'i.css',
      'j.scss',
      'sub/deep.ts',
    ].map((n) => `src/${n}`);
    for (const program of ['modern-cmdk', 'modern-cmdk-codemod'] as const) {
      expect(await find(['src'], program)).toEqual(expected);
      expect(await find(['./src/'], program)).toEqual(expected);
      expect(await find([join(dir, 'src')], program)).toEqual(expected);
    }
  });

  it('CLI-4: results are absolute, de-duplicated and sorted', async () => {
    await touch('src/b.ts');
    await touch('src/a.ts');
    const found = await discoverFiles(['src/b.ts', 'src/*.ts', 'src'], {
      program: 'modern-cmdk',
      cwd: dir,
      warn: () => {},
    });
    expect(found).toEqual([resolve(dir, 'src/a.ts'), resolve(dir, 'src/b.ts')]);
  });

  it('CLI-4: brace patterns, absolute patterns and a literal file all match', async () => {
    await touch('src/a.ts');
    await touch('src/b.tsx');
    await touch('src/c.js');
    for (const program of ['modern-cmdk', 'modern-cmdk-codemod'] as const) {
      expect(await find(['src/*.{ts,tsx}'], program)).toEqual(['src/a.ts', 'src/b.tsx']);
      expect(await find([`${dir.replaceAll('\\', '/')}/src/*.js`], program)).toEqual(['src/c.js']);
      expect(await find(['src/a.ts'], program)).toEqual(['src/a.ts']);
      expect(await find(['./src/a.ts'], program)).toEqual(['src/a.ts']);
    }
  });

  it('CLI-4: a pattern that matches nothing resolves to an empty list', async () => {
    expect(await find(['nothing/*.ts'], 'modern-cmdk')).toEqual([]);
  });

  it("CLI-10, SEC-29: modern-cmdk keeps 1.4's excludes: node_modules, dist, build and .next only, no .gitignore", async () => {
    await touch('src/a.ts');
    for (const name of ['node_modules', 'dist', 'build', '.next', 'coverage', 'out']) {
      await touch(`src/${name}/z.ts`);
    }
    await touch('.gitignore', 'coverage/\nout/\n');
    await git(dir, ['init', '-q']);
    expect(await find(['src/**/*.ts'], 'modern-cmdk')).toEqual([
      'src/a.ts',
      'src/coverage/z.ts',
      'src/out/z.ts',
    ]);
    expect(warnings).toEqual([]);
  });

  it('CLI-10, SEC-29, RP-20: modern-cmdk-codemod also excludes .git, coverage, .turbo, out, storybook-static and .vercel', async () => {
    await touch('src/a.ts');
    const names = [
      'node_modules',
      'dist',
      'build',
      '.next',
      '.git',
      'coverage',
      '.turbo',
      'out',
      'storybook-static',
      '.vercel',
    ];
    for (const name of names) await touch(`src/${name}/z.ts`);
    // Dot directories are out of reach of `**`; the `src/.*` wildcard reaches them, so it proves their exclude.
    const dotted = names.filter((n) => n.startsWith('.'));
    expect(await find(['src/**/*.ts', 'src/.*/*.ts'], 'modern-cmdk-codemod')).toEqual(['src/a.ts']);
    // The same wildcard reaches the dot directories 1.4's four ignores do not name.
    expect(await find(['src/.*/*.ts'], 'modern-cmdk')).toEqual(
      dotted
        .filter((n) => n !== '.next')
        .map((n) => `src/${n}/z.ts`)
        .sort(),
    );
  });

  it('CLI-10, SEC-29: roadmap call :236 - dot files and dot directories are left out of ** in both programs, as in globby 16', async () => {
    await touch('src/a.ts');
    await touch('src/.dot.ts');
    await touch('src/.hidden/c.ts');
    for (const program of ['modern-cmdk', 'modern-cmdk-codemod'] as const) {
      expect(await find(['src/**/*.ts'], program)).toEqual(['src/a.ts']);
      expect(await find(['src/.*'], program)).toEqual(['src/.dot.ts']);
      expect(await find(['src/.hidden/*.ts'], program)).toEqual(['src/.hidden/c.ts']);
    }
  });

  it('CLI-10, SEC-29: roadmap call :236 - a symlinked directory is not descended by ** (globby 16 followed it) in both programs', async () => {
    await touch('real/r.ts');
    await touch('src/a.ts');
    await symlink(join(dir, 'real'), join(dir, 'src', 'link'), 'junction');
    for (const program of ['modern-cmdk', 'modern-cmdk-codemod'] as const) {
      expect(await find(['src/**/*.ts'], program)).toEqual(['src/a.ts']);
      expect(await find(['src'], program)).toEqual(['src/a.ts']);
    }
  });

  it('SEC-29: modern-cmdk-codemod never follows a symlinked directory named in the pattern', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'modern-cmdk-files-out-'));
    try {
      await writeFile(join(outside, 'r.ts'), 'export const r = 1;\n');
      await touch('src/a.ts');
      await symlink(outside, join(dir, 'src', 'link'), 'junction');
      expect(await find(['src/link'], 'modern-cmdk-codemod')).toEqual([]);
      expect(await find(['src/link/*.ts'], 'modern-cmdk-codemod')).toEqual([]);
      expect(await find(['src/**/*.ts'], 'modern-cmdk-codemod')).toEqual(['src/a.ts']);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('CLI-10, SEC-29: roadmap call :236 - an explicit pattern through a symlinked directory still reaches it under modern-cmdk, as in globby 16', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'modern-cmdk-files-out-'));
    try {
      await writeFile(join(outside, 'r.ts'), 'export const r = 1;\n');
      await touch('src/a.ts');
      await symlink(outside, join(dir, 'src', 'link'), 'junction');
      expect(await find(['src/link/*.ts'], 'modern-cmdk')).toEqual(['src/link/r.ts']);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('CLI-4: a directory argument whose name holds glob syntax (app/[slug], app/(group), app/{a,b}) expands to its files in both programs', async () => {
    for (const d of ['app/[slug]', 'app/(group)', 'app/{a,b}']) await touch(`${d}/page.tsx`);
    for (const program of ['modern-cmdk', 'modern-cmdk-codemod'] as const) {
      for (const d of ['app/[slug]', 'app/(group)', 'app/{a,b}']) {
        expect(await find([d], program)).toEqual([`${d}/page.tsx`]);
      }
    }
  });

  it('CLI-10, SEC-29: roadmap call :236 - a symlinked file is not a file for discovery (globby 16 matched it) in both programs', async () => {
    await touch('real/r.ts');
    await touch('src/a.ts');
    try {
      await symlink(join(dir, 'real', 'r.ts'), join(dir, 'src', 'flink.ts'), 'file');
    } catch (error) {
      // Creating a file symlink needs a privilege on Windows; the directory case above covers it.
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    for (const program of ['modern-cmdk', 'modern-cmdk-codemod'] as const) {
      expect(await find(['src/*.ts'], program)).toEqual(['src/a.ts']);
    }
  });

  it.skipIf(process.platform !== 'win32')(
    'CLI-10, SEC-29: roadmap call :236 - on win32 a pattern matches file names case-insensitively (globby 16 matched case-sensitively) in both programs',
    async () => {
      await touch('src/a.tsx');
      for (const program of ['modern-cmdk', 'modern-cmdk-codemod'] as const) {
        expect(await find(['src/*.TSX'], program)).toEqual(['src/a.tsx']);
      }
    },
  );

  it('CLI-10, SEC-29: inside a git work tree modern-cmdk-codemod drops what .gitignore covers', async () => {
    await touch('src/a.ts');
    await touch('src/gen/g.ts');
    await touch('src/keep.generated.ts');
    await touch('src/nested/b.ts');
    await touch('src/nested/.gitignore', 'b.ts\n');
    await touch('.gitignore', 'gen/\n*.generated.ts\n');
    await git(dir, ['init', '-q']);
    expect(await find(['src/**/*.ts'], 'modern-cmdk-codemod')).toEqual(['src/a.ts']);
    expect(warnings).toEqual([]);
  });

  it('CLI-10, SEC-29: a tracked file stays even when .gitignore would match it', async () => {
    await touch('src/a.ts');
    await touch('src/tracked.ts');
    await git(dir, ['init', '-q']);
    await git(dir, ['add', 'src/tracked.ts']);
    await touch('.gitignore', 'src/tracked.ts\n');
    expect(await find(['src/**/*.ts'], 'modern-cmdk-codemod')).toEqual([
      'src/a.ts',
      'src/tracked.ts',
    ]);
  });

  it('CLI-10, SEC-29: outside a git work tree nothing is dropped and nothing is said', async () => {
    await touch('src/a.ts');
    await touch('.gitignore', 'src/\n');
    expect(await find(['src/**/*.ts'], 'modern-cmdk-codemod')).toEqual(['src/a.ts']);
    expect(warnings).toEqual([]);
  });

  it('CLI-10, SEC-29: git missing prints one warning line and keeps every file', async () => {
    await touch('src/a.ts');
    await touch('src/b.ts');
    vi.stubEnv('PATH', configDir);
    expect(await find(['src/**/*.ts'], 'modern-cmdk-codemod')).toEqual(['src/a.ts', 'src/b.ts']);
    expect(warnings).toEqual(['warning: git not found; .gitignore is not applied']);
  });

  it('CLI-10, SEC-29: a git failure other than "none ignored" throws with the git stderr', async () => {
    await touch('a.ts');
    await touch('sub/x.ts');
    await git(join(dir, 'sub'), ['init', '-q']);
    await git(join(dir, 'sub'), ['add', '-A']);
    await git(join(dir, 'sub'), ['commit', '-q', '-m', 'inner']);
    await git(dir, ['init', '-q']);
    await git(dir, ['add', 'sub']);
    // The submodule's own git calls fail on a broken config (exit 128). `ls-files` runs in `sub` before `check-ignore` since SEC-56 (it lists the gitlinks below `sub`), so it is the call that fails first and must not be swallowed; the check-ignore exit-code guard alone is not exercised here.
    await appendFile(join(dir, 'sub', '.git', 'config'), '[broken\n');
    await expect(find(['sub/*.ts'], 'modern-cmdk-codemod')).rejects.toThrow(
      /^git ls-files failed \(exit 128\): .*config/is,
    );
    expect(await find(['sub/*.ts'], 'modern-cmdk')).toEqual(['sub/x.ts']);
  });
});

describe('codemod files: findDirtyFiles', () => {
  it('SEC-07: clean, modified, staged, deleted, renamed and untracked files', async () => {
    await touch('src/clean.ts');
    await touch('src/mod.ts');
    await touch('src/del.ts');
    await touch('src/old.ts', 'export const renamed = 1;\n');
    await git(dir, ['init', '-q']);
    await git(dir, ['add', '-A']);
    await git(dir, ['commit', '-q', '-m', 'base']);

    const all = ['clean', 'mod', 'del', 'new', 'staged', 'untracked', 'moved'].map((n) =>
      resolve(dir, `src/${n}.ts`),
    );
    expect(await findDirtyFiles([resolve(dir, 'src/clean.ts')], dir)).toEqual({ kind: 'clean' });

    await touch('src/mod.ts', 'export const x = 2;\n');
    await git(dir, ['rm', '-q', 'src/del.ts']);
    await touch('src/staged.ts');
    await git(dir, ['add', 'src/staged.ts']);
    await touch('src/untracked.ts');
    await git(dir, ['mv', 'src/old.ts', 'src/moved.ts']);
    const result = await findDirtyFiles(all, dir);
    expect(result.kind).toBe('dirty');
    expect(rel(result.kind === 'dirty' ? result.paths : [])).toEqual([
      'src/mod.ts',
      'src/del.ts',
      'src/staged.ts',
      'src/untracked.ts',
      'src/moved.ts',
    ]);
  });

  it('SEC-07: reports no-repo outside a work tree and no-git when git is missing', async () => {
    await touch('src/a.ts');
    expect(await findDirtyFiles([resolve(dir, 'src/a.ts')], dir)).toEqual({ kind: 'no-repo' });
    vi.stubEnv('PATH', configDir);
    expect(await findDirtyFiles([resolve(dir, 'src/a.ts')], dir)).toEqual({ kind: 'no-git' });
  });

  it('SEC-07: run from a subdirectory of the work tree', async () => {
    await touch('pkg/src/a.ts');
    await git(dir, ['init', '-q']);
    await git(dir, ['add', '-A']);
    await git(dir, ['commit', '-q', '-m', 'base']);
    const sub = join(dir, 'pkg');
    expect(await findDirtyFiles([resolve(sub, 'src/a.ts')], sub)).toEqual({ kind: 'clean' });
    await touch('pkg/src/a.ts', 'export const x = 2;\n');
    const result = await findDirtyFiles([resolve(sub, 'src/a.ts')], sub);
    expect(result.kind).toBe('dirty');
  });
});

describe('codemod files: git submodules (SEC-55)', () => {
  let origin: string;

  /** A parent repository with src/a.tsx and a submodule at inner/ (n.tsx tracked, skip.tsx ignored). */
  const makeParent = async (): Promise<void> => {
    origin = await mkdtemp(join(tmpdir(), 'modern-cmdk-files-sub-'));
    await git(origin, ['init', '-q']);
    await writeFile(join(origin, 'n.tsx'), 'export const n = 1;\n');
    await writeFile(join(origin, '.gitignore'), 'skip.tsx\n');
    await git(origin, ['add', '.']);
    await git(origin, ['commit', '-q', '-m', 'inner']);
    await git(dir, ['init', '-q']);
    await touch('src/a.tsx');
    await git(dir, ['add', '.']);
    await git(dir, ['commit', '-q', '-m', 'parent']);
    await git(dir, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', origin, 'inner']);
    await git(dir, ['commit', '-q', '-m', 'submodule']);
    await touch('inner/skip.tsx');
  };

  afterEach(async () => {
    await rm(origin, { recursive: true, force: true });
  });

  it('SEC-55: findDirtyFiles treats a modified submodule as a dirty directory', async () => {
    await makeParent();
    expect(await findDirtyFiles([resolve(dir, 'inner/n.tsx')], dir)).toEqual({ kind: 'clean' });
    await touch('inner/n.tsx', 'export const n = 2;\n');
    expect(await findDirtyFiles([resolve(dir, 'inner/n.tsx')], dir)).toEqual({
      kind: 'dirty',
      paths: [resolve(dir, 'inner/n.tsx')],
    });
  });

  it("SEC-55: strict discovery of a submodule directory honours the submodule's own .gitignore and never fails on check-ignore", async () => {
    await makeParent();
    expect(await find(['inner'], 'modern-cmdk-codemod')).toEqual(['inner/n.tsx']);
    expect(await find(['inner', 'src'], 'modern-cmdk-codemod')).toEqual([
      'inner/n.tsx',
      'src/a.tsx',
    ]);
  });
});

describe('codemod files: the git search path (SEC-57)', () => {
  const repoRoot = join(tmpdir(), 'sec57-repo');
  const outside = join(tmpdir(), 'sec57-elsewhere');
  const outsideToo = join(tmpdir(), 'sec57-elsewhere-two');

  it.each([
    ['an empty value', '', []],
    ['an undefined PATH', undefined, []],
    ['empty entries', ['', outside, ''], [outside]],
    ['relative entries', ['.', 'bin', outside, join('..', 'bin')], [outside]],
    ['an entry equal to the root', [repoRoot, outside], [outside]],
    ['an entry under the root', [join(repoRoot, 'node_modules', '.bin'), outside], [outside]],
    ['the root spelled with a dot segment', [join(repoRoot, '.'), outside], [outside]],
    [
      'a sibling whose name starts with the root name',
      [`${repoRoot}-tools`],
      [`${repoRoot}-tools`],
    ],
    ['absolute entries outside the root, in order', [outsideToo, outside], [outsideToo, outside]],
  ] as const)(
    'SEC-57: gitSearchDirs keeps absolute entries outside the root: %s',
    (_name, entries, kept) => {
      const value = typeof entries === 'string' ? entries : entries?.join(delimiter);
      expect(gitSearchDirs(value, repoRoot)).toEqual(kept);
    },
  );

  /** Copy this Node binary where git would be looked up: `git.exe` on win32, an executable `git` elsewhere. */
  const plantFakeGit = async (folder: string): Promise<void> => {
    await mkdir(folder, { recursive: true });
    const target = join(folder, process.platform === 'win32' ? 'git.exe' : 'git');
    await copyFile(process.execPath, target);
    await chmod(target, 0o755);
  };

  const commitSources = async (): Promise<void> => {
    await touch('src/a.ts');
    await touch('src/skip.ts');
    await touch('.gitignore', 'skip.ts\n');
    await git(dir, ['init', '-q']);
    await git(dir, ['add', '-A']);
    await git(dir, ['commit', '-q', '-m', 'base']);
  };

  it('SEC-57: a git planted at the repository root does not answer discovery or the dirty check', async () => {
    await commitSources();
    await plantFakeGit(dir);
    expect(await find(['src'], 'modern-cmdk-codemod')).toEqual(['src/a.ts']);
    expect(await findDirtyFiles([resolve(dir, 'src/a.ts')], dir)).toEqual({ kind: 'clean' });
  });

  it('SEC-57: a relative PATH entry does not run a git planted in the repository', async () => {
    await commitSources();
    await plantFakeGit(dir);
    vi.stubEnv('PATH', `.${delimiter}${process.env.PATH}`);
    expect(await findDirtyFiles([resolve(dir, 'src/a.ts')], dir)).toEqual({ kind: 'clean' });
    expect(await find(['src'], 'modern-cmdk-codemod')).toEqual(['src/a.ts']);
  });

  it('SEC-57: a PATH entry inside the repository is skipped and the real git answers', async () => {
    await commitSources();
    const planted = join(dir, 'bin');
    await plantFakeGit(planted);
    vi.stubEnv('PATH', `${planted}${delimiter}${process.env.PATH}`);
    const resolved = await resolveGit(await trustBoundary(dir));
    expect(isAbsolute(resolved)).toBe(true);
    expect(relative(planted, resolved).startsWith('..')).toBe(true);
    expect(await findDirtyFiles([resolve(dir, 'src/a.ts')], dir)).toEqual({ kind: 'clean' });
    expect(await find(['src'], 'modern-cmdk-codemod')).toEqual(['src/a.ts']);
  });

  it('SEC-57: resolveGit names the root when no PATH entry outside it holds git', async () => {
    vi.stubEnv('PATH', `${join(dir, 'bin')}${delimiter}`);
    await expect(resolveGit(dir)).rejects.toThrow(`git was not found on PATH outside ${dir}`);
  });
});

describe('codemod files: one trust boundary per operation (SEC-58)', () => {
  /** The nearest directory from `start` upward that holds a `.git` entry, written without the module under test. */
  const nearestWorkTree = (start: string): string => {
    for (let at = start; ; at = dirname(at)) {
      if (existsSync(join(at, '.git'))) return at;
      if (dirname(at) === at) return start;
    }
  };

  /** Copy this Node binary where git would be looked up: `git.exe` on win32, an executable `git` elsewhere. */
  const plantFakeGit = async (folder: string): Promise<void> => {
    await mkdir(folder, { recursive: true });
    const target = join(folder, process.platform === 'win32' ? 'git.exe' : 'git');
    await copyFile(process.execPath, target);
    await chmod(target, 0o755);
  };

  const commitSources = async (): Promise<void> => {
    await touch('src/a.ts');
    await touch('src/skip.ts');
    await touch('.gitignore', 'skip.ts\n');
    await git(dir, ['init', '-q']);
    await git(dir, ['add', '-A']);
    await git(dir, ['commit', '-q', '-m', 'base']);
  };

  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  const scratch: string[] = [];
  const scratchDir = async (prefix: string): Promise<string> => {
    const made = await mkdtemp(join(tmpdir(), prefix));
    scratch.push(made);
    return made;
  };

  afterEach(async () => {
    for (const made of scratch.splice(0)) await rm(made, { recursive: true, force: true });
  });

  it('SEC-58: trustBoundary is the realpath of the nearest work tree above a subdirectory', async () => {
    await commitSources();
    await mkdir(join(dir, 'src', 'deep'), { recursive: true });
    expect(await trustBoundary(join(dir, 'src', 'deep'))).toBe(await realpath(dir));
  });

  it('SEC-58: trustBoundary is the directory itself when no work tree is above it', async () => {
    const bare = await scratchDir('modern-cmdk-files-bare-');
    const real = await realpath(bare);
    expect(await trustBoundary(bare)).toBe(nearestWorkTree(real));
  });

  it('SEC-58: trustBoundary resolves a symlink alias of the repository to its realpath', async () => {
    await commitSources();
    const aliasHome = await scratchDir('modern-cmdk-files-alias-');
    const alias = join(aliasHome, 'alias');
    await symlink(dir, alias, linkType);
    expect(await trustBoundary(join(alias, 'src'))).toBe(await realpath(dir));
  });

  it('SEC-58: a PATH entry elsewhere in the repository is skipped when cwd is a subdirectory', async () => {
    await commitSources();
    const planted = join(dir, 'bin');
    await plantFakeGit(planted);
    vi.stubEnv('PATH', `${planted}${delimiter}${process.env.PATH}`);
    const src = join(dir, 'src');
    expect(await findDirtyFiles([join(src, 'a.ts')], src)).toEqual({ kind: 'clean' });
    expect(
      await discoverFiles(['.'], {
        program: 'modern-cmdk-codemod',
        cwd: src,
        warn: (m: string) => void warnings.push(m),
      }),
    ).toEqual([join(src, 'a.ts')]);
  });

  it('SEC-58: a PATH entry reached through a symlink alias of the repository is skipped', async () => {
    await commitSources();
    const aliasHome = await scratchDir('modern-cmdk-files-alias-');
    const alias = join(aliasHome, 'alias');
    await symlink(dir, alias, linkType);
    await plantFakeGit(join(dir, 'bin'));
    vi.stubEnv('PATH', `${join(alias, 'bin')}${delimiter}${process.env.PATH}`);
    expect(await findDirtyFiles([join(dir, 'src', 'a.ts')], dir)).toEqual({ kind: 'clean' });
    expect(await find(['src'], 'modern-cmdk-codemod')).toEqual(['src/a.ts']);
  });

  it('SEC-58: a cwd that is a symlink alias of the repository does not move the boundary off the toplevel git prints', async () => {
    await commitSources();
    const aliasHome = await scratchDir('modern-cmdk-files-alias-');
    const alias = join(aliasHome, 'alias');
    await symlink(dir, alias, linkType);
    await plantFakeGit(join(dir, 'bin'));
    vi.stubEnv('PATH', `${join(dir, 'bin')}${delimiter}${process.env.PATH}`);
    expect(await findDirtyFiles([join(alias, 'src', 'a.ts')], alias)).toEqual({ kind: 'clean' });
    expect(
      await discoverFiles(['src'], {
        program: 'modern-cmdk-codemod',
        cwd: alias,
        warn: (m: string) => void warnings.push(m),
      }),
    ).toEqual([join(alias, 'src', 'a.ts')]);
  });

  it('SEC-58: a directory named git on an outside PATH entry is not taken for the executable', async () => {
    await commitSources();
    const decoy = await scratchDir('modern-cmdk-files-decoy-');
    await mkdir(join(decoy, process.platform === 'win32' ? 'git.exe' : 'git'));
    vi.stubEnv('PATH', `${decoy}${delimiter}${process.env.PATH}`);
    expect(await findDirtyFiles([resolve(dir, 'src/a.ts')], dir)).toEqual({ kind: 'clean' });
    expect(await find(['src'], 'modern-cmdk-codemod')).toEqual(['src/a.ts']);
  });
});
