import { existsSync } from 'node:fs';
import {
  appendFile,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CliDeps,
  run,
  type TransformModule,
} from '../../packages/modern-cmdk-codemod/src/cli.js';
import { findDirtyFiles, trustBoundary } from '../../packages/modern-cmdk-codemod/src/files.js';
import importRewrite from '../../packages/modern-cmdk-codemod/src/transforms/import-rewrite.js';
import { git, gitEnv } from './git-fixture.js';

const deps: CliDeps = {
  loadTransform: async (): Promise<TransformModule> => ({ default: importRewrite }),
};
const codemodDeps: CliDeps = { ...deps, program: 'modern-cmdk-codemod' };

const SOURCE = `import { Command } from 'cmdk';\n`;

function capture(): {
  io: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream };
  err: () => string;
} {
  const stderr: string[] = [];
  const writer = (sink: string[]): NodeJS.WritableStream =>
    new Writable({
      write(chunk: Buffer, _enc: BufferEncoding, done: (error?: Error | null) => void): void {
        sink.push(chunk.toString());
        done();
      },
    });
  return {
    io: { stdout: writer([]), stderr: writer(stderr) },
    err: () => stripVTControlCharacters(stderr.join('')),
  };
}

// One fixture root per file. Building a superproject with a submodule and a nested submodule, a
// linked worktree and a nested repository takes many git subprocesses, so it is built once in
// beforeAll and no test changes its git state (no commit, index or ref change); afterEach puts back
// the files a test can change, and removes `inner/deep`, with plain fs calls (no git), and afterAll
// removes the root and asserts that it is gone.
let root: string;
let configDir: string;
let dir: string;
let inner: string;
let leafDir: string;
let wtMain: string;
let wt: string;
let nestedOuter: string;

const allowFile = ['-c', 'protocol.file.allow=always'];
// The build is about 25 git commands (the submodule adds clone internally) and one 100 MB copy of
// node. Measured on 2026-11-08 on this Windows 11 host while other suites ran (9 runs): 5.1 s at
// best, 14.9 s at worst. 60 s is four times the worst and applies to this hook only; every test
// keeps the 30 s default.
const BUILD_TIMEOUT_MS = 60_000;
const RM_OPTIONS = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 } as const;

/** A planted git: a copy of this process's executable named as the platform's git, in `where`. */
async function plantGit(where: string): Promise<void> {
  await mkdir(where, { recursive: true });
  const target = join(where, process.platform === 'win32' ? 'git.exe' : 'git');
  await copyFile(process.execPath, target);
  await chmod(target, 0o755);
}

/** A new committed repository with one file, f.tsx, at `repo`. */
async function committedRepo(repo: string): Promise<void> {
  await mkdir(repo, { recursive: true });
  await git(repo, ['init', '-q']);
  await writeFile(join(repo, 'f.tsx'), SOURCE);
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-q', '-m', 'first']);
}

/** An origin repository holding the given files, committed. */
async function origin(repo: string, files: Record<string, string>): Promise<void> {
  await mkdir(repo, { recursive: true });
  await git(repo, ['init', '-q']);
  for (const [name, content] of Object.entries(files)) await writeFile(join(repo, name), content);
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-q', '-m', 'origin']);
}

beforeAll(async () => {
  // The root is assigned first so that afterAll removes it even when the build below throws.
  root = await mkdtemp(join(tmpdir(), 'modern-cmdk-sub-'));
  configDir = join(root, 'git-config');
  await mkdir(configDir);
  dir = join(root, 'super');
  inner = join(dir, 'inner', 'n.tsx');
  leafDir = join(dir, 'inner', 'leaf');
  wtMain = join(root, 'wt-main');
  wt = join(root, 'wt');
  nestedOuter = join(root, 'nest-outer');
  for (const [name, value] of Object.entries(gitEnv(configDir))) vi.stubEnv(name, value);
  try {
    const innerOrigin = join(root, 'inner-origin');
    const leafOrigin = join(root, 'leaf-origin');
    await Promise.all([
      (async () => {
        // The superproject: its submodule `inner` holds a submodule `leaf` of its own; both
        // .gitignore files ignore skip.tsx.
        await Promise.all([
          origin(innerOrigin, { 'n.tsx': SOURCE, '.gitignore': 'skip.tsx\n' }),
          origin(leafOrigin, { 'f.tsx': SOURCE, '.gitignore': 'skip.tsx\n' }),
          mkdir(dir, { recursive: true }).then(async () => {
            await git(dir, ['init', '-q']);
            await writeFile(join(dir, 'a.tsx'), SOURCE);
            await git(dir, ['add', '.']);
            await git(dir, ['commit', '-q', '-m', 'parent']);
          }),
        ]);
        await git(dir, [...allowFile, 'submodule', 'add', '-q', innerOrigin, 'inner']);
        await git(join(dir, 'inner'), [...allowFile, 'submodule', 'add', '-q', leafOrigin, 'leaf']);
        await git(join(dir, 'inner'), ['commit', '-q', '-m', 'leaf']);
        await git(dir, ['add', 'inner']);
        await git(dir, ['commit', '-q', '-m', 'submodule with leaf']);
        // The planted git sits in the superproject without making it dirty.
        await plantGit(join(dir, 'bin'));
        await appendFile(join(dir, '.git', 'info', 'exclude'), 'bin/\n');
      })(),
      (async () => {
        await committedRepo(wtMain);
        await git(wtMain, ['worktree', 'add', '-q', '-b', 'linked', wt]);
      })(),
      (async () => {
        await committedRepo(nestedOuter);
        await mkdir(join(nestedOuter, 'nested'));
        await git(join(nestedOuter, 'nested'), ['init', '-q']);
      })(),
    ]);
    await resetSources();
  } finally {
    vi.unstubAllEnvs();
  }
}, BUILD_TIMEOUT_MS);

/** Put back every file a test can change: a migration rewrites files, a dirty test edits one. */
async function resetSources(): Promise<void> {
  await Promise.all([
    writeFile(inner, SOURCE),
    writeFile(join(leafDir, 'f.tsx'), SOURCE),
    writeFile(join(dir, 'inner', 'skip.tsx'), SOURCE),
    writeFile(join(leafDir, 'skip.tsx'), SOURCE),
    rm(join(dir, 'inner', 'deep'), RM_OPTIONS),
  ]);
}

beforeEach(() => {
  for (const [name, value] of Object.entries(gitEnv(configDir))) vi.stubEnv(name, value);
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await resetSources();
});

afterAll(async () => {
  await rm(root, RM_OPTIONS);
  expect(existsSync(root)).toBe(false);
});

describe('codemod CLI: git submodules', () => {
  it('SEC-55: a dirty submodule refuses under modern-cmdk-codemod with exit 2, lists the file, names --force and writes nothing', async () => {
    await writeFile(inner, `${SOURCE}// edited\n`);
    const c = capture();
    expect(await run(['import-rewrite', 'inner'], c.io, codemodDeps)).toBe(2);
    expect(c.err()).toContain('  inner/n.tsx');
    expect(c.err()).toContain('--force');
    expect(await readFile(inner, 'utf-8')).toBe(`${SOURCE}// edited\n`);
  });

  it('SEC-55: a clean submodule migrates under modern-cmdk-codemod', async () => {
    expect(await run(['import-rewrite', 'inner'], capture().io, codemodDeps)).toBe(0);
    expect(await readFile(inner, 'utf-8')).toMatch(
      /^import \{ Command \} from ['"]modern-cmdk\/react['"];\r?\n$/,
    );
    expect(await readFile(join(dir, 'inner', 'skip.tsx'), 'utf-8')).toBe(SOURCE);
  });

  it('SEC-55: the deprecated profile processes submodule files as 1.4 did', async () => {
    expect(await run(['import-rewrite', 'inner'], capture().io, deps)).toBe(0);
    expect(await readFile(inner, 'utf-8')).toMatch(
      /^import \{ Command \} from ['"]modern-cmdk\/react['"];\r?\n$/,
    );
  });

  it('SEC-58: a PATH entry in the superproject is skipped when check-ignore runs in the submodule', async () => {
    const planted = join(dir, 'bin');
    vi.stubEnv('PATH', `${planted}${delimiter}${process.env.PATH}`);
    expect(await run(['import-rewrite', 'inner'], capture().io, codemodDeps)).toBe(0);
    expect(await readFile(inner, 'utf-8')).toMatch(
      /^import \{ Command \} from ['"]modern-cmdk\/react['"];\r?\n$/,
    );
    expect(await readFile(join(dir, 'inner', 'skip.tsx'), 'utf-8')).toBe(SOURCE);
  });
});

describe('codemod CLI: git submodules nested in a submodule', () => {
  // The shared fixture's submodule `inner` holds a submodule `leaf` of its own, with a .gitignore
  // that ignores skip.tsx (and an ignored skip.tsx in each of the two).
  it('SEC-56: strict discovery over a file in a submodule nested in a submodule runs check-ignore in the innermost repository, applies its .gitignore and migrates', async () => {
    const c = capture();
    expect(await run(['import-rewrite', 'inner'], c.io, codemodDeps)).toBe(0);
    expect(c.err()).not.toContain('check-ignore');
    const migrated = /^import \{ Command \} from ['"]modern-cmdk\/react['"];\r?\n$/;
    expect(await readFile(join(dir, 'inner', 'leaf', 'f.tsx'), 'utf-8')).toMatch(migrated);
    expect(await readFile(inner, 'utf-8')).toMatch(migrated);
    expect(await readFile(join(dir, 'inner', 'leaf', 'skip.tsx'), 'utf-8')).toBe(SOURCE);
  });

  it('SEC-56: a dirty file in the nested submodule refuses with exit 2 and is listed', async () => {
    const f = join(dir, 'inner', 'leaf', 'f.tsx');
    await writeFile(f, `${SOURCE}// edited\n`);
    const c = capture();
    expect(await run(['import-rewrite', 'inner'], c.io, codemodDeps)).toBe(2);
    expect(c.err()).toContain('  inner/leaf/f.tsx');
    expect(await readFile(f, 'utf-8')).toBe(`${SOURCE}// edited\n`);
  });
});

describe('codemod files: the trust boundary of a submodule, a worktree and a nested repository', () => {
  it('SEC-59: inside a submodule the boundary is the superproject', async () => {
    const real = await realpath(dir);
    await mkdir(join(dir, 'inner', 'deep'));
    expect(await trustBoundary(join(dir, 'inner'))).toBe(real);
    expect(await trustBoundary(join(dir, 'inner', 'deep'))).toBe(real);
  });

  it('SEC-59: a submodule of a submodule climbs to the outermost superproject', async () => {
    expect(await trustBoundary(leafDir)).toBe(await realpath(dir));
  });

  it('SEC-59: a planted git beside the superproject is skipped when cwd is the submodule', async () => {
    vi.stubEnv('PATH', `${join(dir, 'bin')}${delimiter}${process.env.PATH}`);
    expect(await findDirtyFiles([inner], join(dir, 'inner'))).toEqual({ kind: 'clean' });
  });

  it('SEC-59: a linked worktree is its own boundary, not the repository it was added from', async () => {
    expect(await trustBoundary(wt)).toBe(await realpath(wt));
  });

  it('SEC-59: an ordinary nested repository is its own boundary', async () => {
    const nested = join(nestedOuter, 'nested');
    expect(await trustBoundary(nested)).toBe(await realpath(nested));
  });
});
