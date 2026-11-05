import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CliDeps,
  run,
  type TransformModule,
} from '../../packages/modern-cmdk-codemod/src/cli.js';
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

beforeEach(async () => {
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
  for (const d of [dir, origin, configDir]) await rm(d, { recursive: true, force: true });
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
});
