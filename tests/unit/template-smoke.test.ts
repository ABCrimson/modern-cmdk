// tests/unit/template-smoke.test.ts
// W4-04: the pure helpers of scripts/template-smoke.ts (each template scaffolded by the packed create
// bin, installed against the packed modern-cmdk, type-checked and built). The harness itself
// (unpack, scaffold, install, tsc, build) is exercised by running it, not here.

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as setTimeout_ } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { parseWorkspaceYaml } from '../../scripts/consumer-smoke.ts';
import {
  buildTempWorkspaceYaml,
  discoverTarballs,
  killTree,
  parseCli,
  rewriteDependency,
  run,
  TEMPLATES,
} from '../../scripts/template-smoke.ts';

const root = resolve(import.meta.dirname, '../..');

/** Whether a process still exists: signal 0 throws ESRCH on POSIX, tasklist filters by pid on Windows. */
function isAlive(pid: number): boolean {
  if (process.platform === 'win32') {
    const listing = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' });
    return listing.stdout.includes(String(pid));
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

function packDir(...names: readonly string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'template-smoke-test-'));
  for (const name of names) writeFileSync(join(dir, name), '');
  return dir;
}

describe('discoverTarballs', () => {
  it('finds exactly one create-modern-cmdk and one modern-cmdk tarball', () => {
    const dir = packDir('create-modern-cmdk-1.2.2.tgz', 'modern-cmdk-1.2.3.tgz', 'notes.txt');
    try {
      const found = discoverTarballs(dir);
      expect(found).toEqual({
        create: join(dir, 'create-modern-cmdk-1.2.2.tgz'),
        cmdk: join(dir, 'modern-cmdk-1.2.3.tgz'),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not take modern-cmdk-codemod for modern-cmdk', () => {
    const dir = packDir(
      'create-modern-cmdk-1.2.2.tgz',
      'modern-cmdk-1.2.3.tgz',
      'modern-cmdk-codemod-1.0.0.tgz',
    );
    try {
      expect(discoverTarballs(dir).cmdk).toBe(join(dir, 'modern-cmdk-1.2.3.tgz'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ['no tarball', []],
    ['only create', ['create-modern-cmdk-1.2.2.tgz']],
    ['only modern-cmdk', ['modern-cmdk-1.2.3.tgz']],
    [
      'two create tarballs',
      ['create-modern-cmdk-1.2.2.tgz', 'create-modern-cmdk-1.2.3.tgz', 'modern-cmdk-1.2.3.tgz'],
    ],
    [
      'two modern-cmdk tarballs',
      ['create-modern-cmdk-1.2.2.tgz', 'modern-cmdk-1.2.3.tgz', 'modern-cmdk-1.2.4.tgz'],
    ],
  ] as const)('throws a usage error for %s', (_label, names) => {
    const dir = packDir(...names);
    try {
      expect(() => discoverTarballs(dir)).toThrow(/exactly one/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws for a missing directory', () => {
    const dir = join(tmpdir(), 'template-smoke-test-missing-dir');
    mkdirSync(dir, { recursive: true });
    rmSync(dir, { recursive: true });
    expect(() => discoverTarballs(dir)).toThrow();
  });
});

describe('rewriteDependency', () => {
  it('sets dependencies.modern-cmdk to file:<abs> and changes nothing else', () => {
    const pkg = {
      name: 'app',
      version: '0.1.0',
      scripts: { build: 'vite build' },
      dependencies: { 'modern-cmdk': '1.2.3', react: '19.0.0' },
      devDependencies: { vite: '8.3.6' },
    };
    const before = structuredClone(pkg);
    const out = rewriteDependency(pkg, '/tmp/packs/modern-cmdk-1.2.3.tgz');
    expect(out.dependencies['modern-cmdk']).toMatch(/^file:.*modern-cmdk-1\.2\.3\.tgz$/);
    expect(out.dependencies['modern-cmdk']).toBe(
      `file:${resolve('/tmp/packs/modern-cmdk-1.2.3.tgz')}`,
    );
    expect({ ...out, dependencies: { ...out.dependencies, 'modern-cmdk': '1.2.3' } }).toEqual(
      before,
    );
    expect(pkg).toEqual(before);
  });
});

describe('buildTempWorkspaceYaml', () => {
  const rootText = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  const rootYaml = parseWorkspaceYaml(rootText);
  const temp = parseWorkspaceYaml(buildTempWorkspaceYaml(rootText));

  it('has packages exactly ["."] and no overrides key', () => {
    expect(temp.packages).toEqual(['.']);
    expect('overrides' in temp).toBe(false);
    expect('catalog' in temp).toBe(false);
  });

  it('names template-smoke.ts in its header, not consumer-smoke.ts', () => {
    expect(buildTempWorkspaceYaml(rootText).split('\n')[0]).toMatch(
      /^# Written by scripts\/template-smoke\.ts/,
    );
  });

  it.each([
    'minimumReleaseAge',
    'minimumReleaseAgeStrict',
    'trustPolicy',
    'trustPolicyExclude',
    'minimumReleaseAgeExclude',
    'allowBuilds',
  ])('carries the root %s', (key) => {
    expect(rootYaml[key]).toBeDefined();
    expect(temp[key]).toEqual(rootYaml[key]);
  });
});

describe('parseCli', () => {
  it('defaults to all templates', () => {
    expect(parseCli(['--pack-dir', '/x'])).toMatchObject({
      kind: 'run',
      options: { templates: TEMPLATES },
    });
  });

  it.each([
    [[]],
    [['--pack-dir', '/x', '--template', 'nope']],
    [['--pack-dir', '/x', '--bogus']],
    [['--pack-dir']],
  ])('exits 2 for %j', (argv) => {
    expect(parseCli(argv)).toMatchObject({ kind: 'usage', exitCode: 2 });
  });
});

describe('run', () => {
  it('a timeout ends the step even when a grandchild holds the pipes, and the grandchild dies', async () => {
    const script = [
      "const { spawn } = require('node:child_process');",
      "const grandchild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'inherit' });",
      'console.log("GRANDCHILD=" + grandchild.pid);',
      'setTimeout(() => {}, 30000);',
    ].join(' ');
    const started = performance.now();
    const result = await run(process.execPath, ['-e', script], { cwd: tmpdir(), timeoutMs: 1000 });
    expect(result.timedOut).toBe(true);
    expect(performance.now() - started).toBeLessThan(10_000);
    const pid = Number(/GRANDCHILD=(\d+)/.exec(result.output)?.[1]);
    expect(Number.isInteger(pid) && pid > 0).toBe(true);
    // The kill is delivered before 'close' resolves; allow the OS a moment to reap the process.
    const deadline = performance.now() + 5000;
    while (isAlive(pid) && performance.now() < deadline) await setTimeout_(50);
    expect(isAlive(pid)).toBe(false);
  }, 15_000);
});

describe('killTree()', () => {
  it('ends a child that is not a process group leader (the POSIX ESRCH fallback)', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
      cwd: tmpdir(),
      stdio: 'ignore',
      windowsHide: true,
    });
    const pid = child.pid as number;
    expect(Number.isInteger(pid) && pid > 0).toBe(true);
    killTree(child);
    // A survivor is killed so it cannot outlive the test.
    const deadline = performance.now() + 5000;
    while (isAlive(pid) && performance.now() < deadline) await setTimeout_(50);
    const gone = !isAlive(pid);
    if (!gone) child.kill('SIGKILL');
    expect(gone).toBe(true);
  }, 20_000);
});
