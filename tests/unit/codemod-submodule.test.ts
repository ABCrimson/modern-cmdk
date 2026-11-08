import {
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

let dir: string;
let origin: string;
let configDir: string;
let inner: string;
let scratch: string[];

beforeEach(async () => {
  scratch = [];
  dir = await mkdtemp(join(tmpdir(), 'modern-cmdk-sub-'));
  origin = await mkdtemp(join(tmpdir(), 'modern-cmdk-sub-origin-'));
  configDir = await mkdtemp(join(tmpdir(), 'modern-cmdk-sub-git-'));
  for (const [name, value] of Object.entries(gitEnv(configDir))) vi.stubEnv(name, value);
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
  await git(origin, ['init', '-q']);
  await writeFile(join(origin, 'n.tsx'), SOURCE);
  await writeFile(join(origin, '.gitignore'), 'skip.tsx\n');
  await git(origin, ['add', '.']);
  await git(origin, ['commit', '-q', '-m', 'inner']);
  await git(dir, ['init', '-q']);
  await writeFile(join(dir, 'a.tsx'), SOURCE);
  await git(dir, ['add', '.']);
  await git(dir, ['commit', '-q', '-m', 'parent']);
  await git(dir, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', origin, 'inner']);
  await git(dir, ['commit', '-q', '-m', 'submodule']);
  await writeFile(join(dir, 'inner', 'skip.tsx'), SOURCE);
  inner = join(dir, 'inner', 'n.tsx');
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const d of [dir, origin, configDir, ...scratch])
    await rm(d, { recursive: true, force: true });
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
    await mkdir(planted);
    const target = join(planted, process.platform === 'win32' ? 'git.exe' : 'git');
    await copyFile(process.execPath, target);
    await chmod(target, 0o755);
    vi.stubEnv('PATH', `${planted}${delimiter}${process.env.PATH}`);
    expect(await run(['import-rewrite', 'inner'], capture().io, codemodDeps)).toBe(0);
    expect(await readFile(inner, 'utf-8')).toMatch(
      /^import \{ Command \} from ['"]modern-cmdk\/react['"];\r?\n$/,
    );
    expect(await readFile(join(dir, 'inner', 'skip.tsx'), 'utf-8')).toBe(SOURCE);
  });
});

describe('codemod CLI: git submodules nested in a submodule', () => {
  // The submodule `inner` of the superproject holds a submodule `leaf` of its own, with a
  // .gitignore that ignores skip.tsx.
  let leaf: string;

  beforeEach(async () => {
    leaf = await mkdtemp(join(tmpdir(), 'modern-cmdk-sub-leaf-'));
    scratch.push(leaf);
    await git(leaf, ['init', '-q']);
    await writeFile(join(leaf, 'f.tsx'), SOURCE);
    await writeFile(join(leaf, '.gitignore'), 'skip.tsx\n');
    await git(leaf, ['add', '.']);
    await git(leaf, ['commit', '-q', '-m', 'leaf']);
    const allowFile = ['-c', 'protocol.file.allow=always'];
    await git(join(dir, 'inner'), [...allowFile, 'submodule', 'add', '-q', leaf, 'leaf']);
    await git(join(dir, 'inner'), ['commit', '-q', '-m', 'leaf']);
    await git(dir, ['add', 'inner']);
    await git(dir, ['commit', '-q', '-m', 'inner with leaf']);
    await writeFile(join(dir, 'inner', 'leaf', 'skip.tsx'), SOURCE);
  });

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

/** A planted git: a copy of this process's executable named as the platform's git, in `where`. */
async function plantGit(where: string): Promise<void> {
  await mkdir(where, { recursive: true });
  const target = join(where, process.platform === 'win32' ? 'git.exe' : 'git');
  await copyFile(process.execPath, target);
  await chmod(target, 0o755);
}

/** A new committed repository in a scratch directory that afterEach removes. */
async function scratchRepo(prefix: string): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), prefix));
  scratch.push(repo);
  await git(repo, ['init', '-q']);
  await writeFile(join(repo, 'f.tsx'), SOURCE);
  await git(repo, ['add', '.']);
  await git(repo, ['commit', '-q', '-m', 'first']);
  return repo;
}

describe('codemod files: the trust boundary of a submodule, a worktree and a nested repository', () => {
  it('SEC-59: inside a submodule the boundary is the superproject', async () => {
    const real = await realpath(dir);
    await mkdir(join(dir, 'inner', 'deep'));
    expect(await trustBoundary(join(dir, 'inner'))).toBe(real);
    expect(await trustBoundary(join(dir, 'inner', 'deep'))).toBe(real);
  });

  it('SEC-59: a submodule of a submodule climbs to the outermost superproject', async () => {
    const leafOrigin = await scratchRepo('modern-cmdk-sub-leaf-');
    const midOrigin = await scratchRepo('modern-cmdk-sub-mid-');
    const allowFile = ['-c', 'protocol.file.allow=always'];
    await git(midOrigin, [...allowFile, 'submodule', 'add', '-q', leafOrigin, 'leaf']);
    await git(midOrigin, ['commit', '-q', '-m', 'leaf']);
    await git(dir, [...allowFile, 'submodule', 'add', '-q', midOrigin, 'mid']);
    await git(join(dir, 'mid'), [...allowFile, 'submodule', 'update', '--init', '-q']);
    expect(await trustBoundary(join(dir, 'mid', 'leaf'))).toBe(await realpath(dir));
  });

  it('SEC-59: a planted git beside the superproject is skipped when cwd is the submodule', async () => {
    await plantGit(join(dir, 'bin'));
    vi.stubEnv('PATH', `${join(dir, 'bin')}${delimiter}${process.env.PATH}`);
    expect(await findDirtyFiles([inner], join(dir, 'inner'))).toEqual({ kind: 'clean' });
  });

  it('SEC-59: a linked worktree is its own boundary, not the repository it was added from', async () => {
    const main = await scratchRepo('modern-cmdk-wt-main-');
    const wt = await mkdtemp(join(tmpdir(), 'modern-cmdk-wt-'));
    scratch.push(wt);
    await git(main, ['worktree', 'add', '-q', '-b', 'linked', wt]);
    expect(await trustBoundary(wt)).toBe(await realpath(wt));
  });

  it('SEC-59: an ordinary nested repository is its own boundary', async () => {
    const outer = await scratchRepo('modern-cmdk-nest-');
    const nested = join(outer, 'nested');
    await mkdir(nested);
    await git(nested, ['init', '-q']);
    expect(await trustBoundary(nested)).toBe(await realpath(nested));
  });
});
