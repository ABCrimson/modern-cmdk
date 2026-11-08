// tests/unit/template-smoke.test.ts
// W4-04: the pure helpers of scripts/template-smoke.ts (each template scaffolded by the packed create
// bin, installed against the packed modern-cmdk, type-checked and built). The harness itself
// (unpack, scaffold, install, tsc, build) is exercised by running it, not here.

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as setTimeout_ } from 'node:timers/promises';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { parseWorkspaceYaml, pnpmUsage } from '../../scripts/consumer-smoke.ts';
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

  it('DT-72: the temp workspace copies the root minimumReleaseAgeExclude list and adds none of its own', () => {
    const twoEntries = [
      'packages:',
      '  - "."',
      'minimumReleaseAge: 1440',
      'minimumReleaseAgeExclude:',
      '  - "vite@8.3.6"',
      '  - "typescript@7.1.0-dev.20261108.1"',
      '',
    ].join('\n');
    const copied = parseWorkspaceYaml(buildTempWorkspaceYaml(twoEntries));
    expect(copied.minimumReleaseAgeExclude).toEqual([
      'vite@8.3.6',
      'typescript@7.1.0-dev.20261108.1',
    ]);
    // The assertion bites: a one-entry list is not what a two-entry root yields.
    expect(copied.minimumReleaseAgeExclude).not.toEqual(['vite@8.3.6']);
    // A root without the key yields none: the script has no list of its own.
    const withoutList = parseWorkspaceYaml(
      buildTempWorkspaceYaml('packages:\n  - "."\nminimumReleaseAge: 1440\n'),
    );
    expect('minimumReleaseAgeExclude' in withoutList).toBe(false);
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

// SEC-70: pnpm is spawned without a shell (CodeQL js/shell-command-injection-from-environment).
// resolvePnpmEntry and spawnTarget (scripts/consumer-smoke.ts) are unit-tested in consumer-smoke.test.ts.
describe('run() spawning pnpm', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'template-smoke-pnpm-'));
  const dump = 'console.log(JSON.stringify(process.argv.slice(1)))';

  afterAll((): void => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('passes the arguments unchanged to an executable npm_execpath', async () => {
    // A copy of this Node named like pnpm's standalone executable: an executable, not a script.
    const exe = join(scratch, process.platform === 'win32' ? 'pnpm.exe' : 'pnpm');
    copyFileSync(process.execPath, exe);
    vi.stubEnv('npm_execpath', exe);
    try {
      const args = ['x y', '&calc', '"q"', 'C:/a b/c'];
      const result = await run('pnpm', ['-e', dump, ...args], { cwd: scratch, timeoutMs: 20_000 });
      expect(result.code).toBe(0);
      expect(JSON.parse(result.output.trim())).toEqual(args);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('runs a .cjs npm_execpath through process.execPath with the entry first', async () => {
    const entry = join(scratch, 'pnpm.cjs');
    writeFileSync(entry, 'console.log(JSON.stringify(process.argv.slice(2)))\n');
    vi.stubEnv('npm_execpath', entry);
    try {
      const result = await run('pnpm', ['install', '--x'], { cwd: scratch, timeoutMs: 20_000 });
      expect(result.code).toBe(0);
      expect(JSON.parse(result.output.trim())).toEqual(['install', '--x']);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('template-smoke outside pnpm', () => {
  const script = join(root, 'scripts', 'template-smoke.ts');

  it('exits 2 and names the pnpm script when npm_execpath is absent', () => {
    // Windows keeps the variable's original casing in a copy of process.env, so filter by lowercase name.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'npm_execpath'),
    );
    const result = spawnSync(process.execPath, [script, '--pack-dir', tmpdir()], {
      env,
      encoding: 'utf8',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toBe(pnpmUsage('template-smoke', 'test:templates'));
    expect(result.stderr).toContain('pnpm test:templates');
  });

  it('has no shell spawn left in the source', () => {
    const source = readFileSync(script, 'utf8');
    expect(source).not.toMatch(/cmd\.exe/i);
    expect(source).not.toMatch(/['"]\/d['"]\s*,\s*['"]\/c['"]/);
  });
});
