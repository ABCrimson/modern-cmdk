import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import type { API, FileInfo } from 'jscodeshift';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CliDeps, run } from '../../packages/modern-cmdk/src/codemod/cli.js';
import importRewrite from '../../packages/modern-cmdk/src/codemod/transforms/import-rewrite.js';

type TransformFn = (fileInfo: FileInfo, api: API) => string;

// The bundled bin imports ./transforms/<name>.mjs next to itself; from source there is no such
// file, so the tests inject the real transform (dist/codemod is covered by tests/dist/cli-smoke).
const deps: CliDeps = {
  loadTransform: async (name: string): Promise<TransformFn> => {
    if (name === 'should-filter') {
      return (): string => {
        throw new Error('boom');
      };
    }
    return importRewrite;
  },
};

const SOURCE = `import { Command } from 'cmdk';\n`;

interface Captured {
  readonly io: { stdout: NodeJS.WritableStream; stderr: NodeJS.WritableStream };
  readonly out: () => string;
  readonly err: () => string;
}

function capture(): Captured {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const writer = (sink: string[]): NodeJS.WritableStream =>
    new Writable({
      write(chunk: Buffer, _enc: BufferEncoding, done: (error?: Error | null) => void): void {
        sink.push(chunk.toString());
        done();
      },
    });
  return {
    io: { stdout: writer(stdout), stderr: writer(stderr) },
    out: () => stripVTControlCharacters(stdout.join('')),
    err: () => stripVTControlCharacters(stderr.join('')),
  };
}

let dir: string;
let glob: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'modern-cmdk-cli-'));
  await mkdir(join(dir, 'src'));
  file = join(dir, 'src', 'a.tsx');
  await writeFile(file, SOURCE);
  await writeFile(join(dir, 'src', 'b.tsx'), `export const b = 1;\n`);
  glob = `${dir.replaceAll('\\', '/')}/src/*.tsx`;
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe('codemod CLI: help and usage', () => {
  it.each(['--help', '-h'])('%s writes usage to stdout and resolves 0', async (flag) => {
    const c = capture();
    expect(await run([flag], c.io, deps)).toBe(0);
    for (const name of ['import-rewrite', 'data-attrs', 'forward-ref', 'should-filter']) {
      expect(c.out()).toContain(name);
    }
    expect(c.out()).toContain('Rewrites cmdk imports to modern-cmdk/react');
    expect(c.out()).toContain('--strict');
    expect(c.out()).toMatch(/--concurrency=N {2,}Files processed/);
    expect(c.err()).toBe('');
  });

  it('no arguments writes usage to stderr and resolves 0 (strict: 2)', async () => {
    const c = capture();
    expect(await run([], c.io, deps)).toBe(0);
    expect(c.err()).toContain('Usage:');
    expect(c.err()).toContain('import-rewrite');
    expect(c.out()).toBe('');

    expect(await run(['--strict'], capture().io, deps)).toBe(2);
  });

  it('an unknown option is a usage error: exit 0, strict 2', async () => {
    const c = capture();
    expect(await run(['--bogus'], c.io, deps)).toBe(0);
    expect(c.err()).toContain('unknown option --bogus');
    expect(c.err()).toContain('Usage:');
    expect(await run(['--strict', '--bogus'], capture().io, deps)).toBe(2);
  });

  it('an unknown option with no matching files still exits 1 and says so on stderr', async () => {
    const missing = `${dir.replaceAll('\\', '/')}/nothing/*.tsx`;
    const c = capture();
    expect(await run(['import-rewrite', missing, '--verbose'], c.io, deps)).toBe(1);
    expect(c.err()).toContain('unknown option --verbose');
    expect(c.err()).toContain(`no files matched "${missing}"`);
  });

  it('an unknown option with the positionals present warns, is ignored, and the run goes on', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--verbose'], c.io, deps)).toBe(0);
    expect(c.err()).toContain('warning: unknown option --verbose ignored');
    expect(c.err()).toContain('--strict makes this exit 2');
    expect(await readFile(file, 'utf-8')).toContain('modern-cmdk/react');
  });

  it('an unknown option with --strict exits 2 and touches nothing', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--verbose', '--strict'], c.io, deps)).toBe(2);
    expect(c.err()).toContain('unknown option --verbose');
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('an unknown option does not hide an unknown transform (exit 1)', async () => {
    expect(await run(['nope', glob, '--verbose'], capture().io, deps)).toBe(1);
  });

  it('a boolean option given a value (--dry-run=yes) is a usage error and writes nothing', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--dry-run=yes'], c.io, deps)).toBe(0);
    expect(c.err()).toContain("Option '--dry-run' does not take an argument");
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('a lone -- ends option parsing and the run goes on', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--'], c.io, deps)).toBe(0);
    expect(c.err()).toBe('');
    expect(c.out()).toContain('1 changed, 1 unchanged, 0 errors');
    expect(await readFile(file, 'utf-8')).toContain('modern-cmdk/react');
  });

  it('an unknown option does not let --dry-run=yes slip through (nothing written)', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--verbose', '--dry-run=yes'], c.io, deps)).toBe(0);
    expect(c.err()).toContain("Option '--dry-run' does not take an argument");
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('an unknown option does not let --strict=yes slip through (nothing written)', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--verbose', '--strict=yes'], c.io, deps)).toBe(0);
    expect(c.err()).toContain("Option '--strict' does not take an argument");
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('an unknown option does not let a valueless --concurrency slip through (nothing written)', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--verbose', '--concurrency'], c.io, deps)).toBe(0);
    expect(c.err()).toContain("Option '--concurrency <value>' argument missing");
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
    expect(
      await run(
        ['import-rewrite', glob, '--verbose', '--concurrency', '--strict'],
        capture().io,
        deps,
      ),
    ).toBe(2);
  });

  it('a dash-led space-form --concurrency value is ambiguous beside an unknown option (nothing written)', async () => {
    const c = capture();
    expect(
      await run(['import-rewrite', glob, '--verbose', '--concurrency', '--dry-run'], c.io, deps),
    ).toBe(0);
    expect(c.err()).toContain("Option '--concurrency' argument is ambiguous.");
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('an empty --concurrency= is rejected by the positive-integer check', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--concurrency='], c.io, deps)).toBe(0);
    expect(c.err()).toContain('--concurrency must be a positive integer');
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('a bad --concurrency is a usage error: exit 0, strict 2', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--concurrency=abc'], c.io, deps)).toBe(0);
    expect(c.err()).toContain('--concurrency');
    expect(
      await run(['import-rewrite', glob, '--concurrency=abc', '--strict'], capture().io, deps),
    ).toBe(2);
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });
});

describe('codemod CLI: errors', () => {
  it('an unknown transform names it and the valid list, exit 1 (strict 2)', async () => {
    const c = capture();
    expect(await run(['nope', glob], c.io, deps)).toBe(1);
    expect(c.err()).toContain('unknown transform "nope"');
    expect(c.err()).toContain('import-rewrite, data-attrs, forward-ref, should-filter');
    expect(await run(['nope', glob, '--strict'], capture().io, deps)).toBe(2);
  });

  it('no matched files names the glob and exits 1', async () => {
    const c = capture();
    const missing = `${dir.replaceAll('\\', '/')}/nothing/*.tsx`;
    expect(await run(['import-rewrite', missing], c.io, deps)).toBe(1);
    expect(c.err()).toContain(`no files matched "${missing}"`);
  });

  it('a transform that throws on a file reports "path: message", exit 0, strict 1', async () => {
    const c = capture();
    expect(await run(['should-filter', glob], c.io, deps)).toBe(0);
    expect(c.err()).toContain('src/a.tsx: boom');
    expect(c.err()).toContain('src/b.tsx: boom');
    expect(c.out()).toContain('0 changed, 0 unchanged, 2 errors');

    expect(await run(['should-filter', glob, '--strict'], capture().io, deps)).toBe(1);
  });
});

describe('codemod CLI: runs', () => {
  it('--dry-run lists would-change files and leaves the bytes alone', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--dry-run'], c.io, deps)).toBe(0);
    expect(c.out()).toMatch(/would change src\/a\.tsx\n/);
    expect(c.out()).not.toContain('b.tsx');
    expect(c.out()).toContain('1 changed, 1 unchanged, 0 errors');
    expect(await readFile(file, 'utf-8')).toBe(SOURCE);
  });

  it('a real run rewrites, lists changed files and prints the summary line', async () => {
    const c = capture();
    expect(await run(['import-rewrite', glob, '--strict'], c.io, deps)).toBe(0);
    expect(c.out()).toMatch(/changed src\/a\.tsx\n/);
    expect(c.out()).toContain('1 changed, 1 unchanged, 0 errors');
    expect(c.err()).toBe('');
    expect(await readFile(file, 'utf-8')).toContain('modern-cmdk/react');
  });
});
