import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

// Needs: pnpm --filter modern-cmdk --filter create-modern-cmdk run build
const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, '../..');

const BINS = {
  'modern-cmdk (codemod)': resolve(root, 'packages/modern-cmdk/dist/codemod/cli.mjs'),
  'create-modern-cmdk': resolve(root, 'packages/create-modern-cmdk/dist/index.mjs'),
} as const;

async function runBin(
  bin: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [bin, ...args]);
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code: number; stdout: string; stderr: string };
    return { code: e.code, stdout: e.stdout, stderr: e.stderr };
  }
}

describe.each(Object.entries(BINS))('built bin: %s', (_name, bin) => {
  it('--help prints usage to stdout and exits 0', async () => {
    const r = await runBin(bin, ['--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Usage:');
    expect(r.stdout.trim().length).toBeGreaterThan(0);
  });

  it('--strict --bogus exits 2 with the error on stderr', async () => {
    const r = await runBin(bin, ['--strict', '--bogus']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('unknown option --bogus');
  });

  it('--bogus keeps the 1.2 exit code 0', async () => {
    const r = await runBin(bin, ['--bogus']);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('unknown option --bogus');
  });
});

describe('built bins: unknown options keep the 1.2.2 behaviour', () => {
  it('codemod: an unknown option with a transform and a glob warns and still reports no files (exit 1)', async () => {
    const r = await runBin(BINS['modern-cmdk (codemod)'], [
      'import-rewrite',
      'nomatch-smoke/*.tsx',
      '--verbose',
    ]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('warning: unknown option --verbose ignored');
    expect(r.stderr).toContain('no files matched');
  });

  it('create: an unknown option with a project name warns and still scaffolds', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'cmdk-smoke-'));
    try {
      const target = join(tmp, 'app');
      const r = await runBin(BINS['create-modern-cmdk'], [target, '--typescript']);
      expect(r.code).toBe(0);
      expect(r.stderr).toContain('warning: unknown option --typescript ignored');
      expect(JSON.parse(await readFile(join(target, 'package.json'), 'utf-8')).type).toBe('module');
      const strictTarget = join(tmp, 'strict');
      const s = await runBin(BINS['create-modern-cmdk'], [
        strictTarget,
        '--typescript',
        '--strict',
      ]);
      expect(s.code).toBe(2);
      await expect(readFile(join(strictTarget, 'package.json'))).rejects.toThrow();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
