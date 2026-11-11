// tests/unit/codemod-tarball-smoke.test.ts
// The pure helpers of scripts/codemod-tarball-smoke.ts (the tarball exit gate). The script's checks themselves
// need packed tarballs and the npm registry; CI runs them (W5-01), this file pins the decisions around them.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  countDeprecationLines,
  diffTrees,
  findTarballs,
  main,
  minReleaseAgeDays,
  npmExecArgs,
  npmInstallArgs,
  npmPolicyArgs,
  parseSmokeArgs,
  resolveBin,
  sameOutput,
  snapshotTree,
  UsageError,
} from '../../scripts/codemod-tarball-smoke.ts';

describe('findTarballs', () => {
  it('counts exactly one modern-cmdk and one modern-cmdk-codemod tarball', () => {
    expect(
      findTarballs([
        'modern-cmdk-1.2.3.tgz',
        'modern-cmdk-codemod-1.0.0.tgz',
        'notes.txt',
        'create-modern-cmdk-1.2.2.tgz',
      ]),
    ).toEqual({ modernCmdk: 'modern-cmdk-1.2.3.tgz', codemod: 'modern-cmdk-codemod-1.0.0.tgz' });
  });

  it('modern-cmdk-1.2.3.tgz never counts as the codemod tarball', () => {
    expect(findTarballs(['modern-cmdk-1.2.3.tgz'])).toEqual({
      modernCmdk: 'modern-cmdk-1.2.3.tgz',
      codemod: undefined,
    });
  });

  it('the codemod tarball never counts as the modern-cmdk tarball', () => {
    expect(findTarballs(['modern-cmdk-codemod-1.0.0.tgz'])).toEqual({
      modernCmdk: undefined,
      codemod: 'modern-cmdk-codemod-1.0.0.tgz',
    });
  });

  it('two modern-cmdk-[0-9]* matches is a usage error', () => {
    expect(() => findTarballs(['modern-cmdk-1.2.3.tgz', 'modern-cmdk-1.5.0.tgz'])).toThrow(
      UsageError,
    );
  });

  it('two modern-cmdk-codemod-[0-9]* matches is a usage error', () => {
    expect(() =>
      findTarballs(['modern-cmdk-codemod-1.0.0.tgz', 'modern-cmdk-codemod-1.1.0.tgz']),
    ).toThrow(UsageError);
  });

  it('no tarball is a usage error', () => {
    expect(() => findTarballs([])).toThrow(UsageError);
    expect(() => findTarballs(['create-modern-cmdk-1.2.2.tgz', 'readme.md'])).toThrow(UsageError);
  });
});

describe('sameOutput', () => {
  it('normalises nothing: the outputs must be byte-identical', () => {
    expect(sameOutput('a\nb\n', 'a\nb\n')).toBe(true);
    expect(sameOutput('a\nb\n', 'a\r\nb\r\n')).toBe(false);
    expect(sameOutput('a\n', 'a')).toBe(false);
    expect(sameOutput('a ', 'a')).toBe(false);
    expect(sameOutput('', '')).toBe(true);
  });
});

describe('countDeprecationLines', () => {
  const warning =
    'warning: the modern-cmdk bin is deprecated; use npx modern-cmdk-codemod (strict by default).';

  it('counts only lines starting with the deprecated-bin warning', () => {
    expect(countDeprecationLines(`${warning}\nchanged src/a.tsx\n`)).toBe(1);
    expect(countDeprecationLines(`${warning}\n${warning}\n`)).toBe(2);
    expect(countDeprecationLines('')).toBe(0);
  });

  it('a usage text that names npx modern-cmdk-codemod does not count', () => {
    expect(
      countDeprecationLines(
        'modern-cmdk (this bin) is deprecated. It runs with --lenient unless --strict is given.\nUse: npx modern-cmdk-codemod <transform> <glob|dir>\n',
      ),
    ).toBe(0);
    expect(countDeprecationLines(`  ${warning}\n`)).toBe(0);
  });

  it('counts CRLF-terminated lines', () => {
    expect(countDeprecationLines(`${warning}\r\nx\r\n`)).toBe(1);
  });
});

describe('parseSmokeArgs', () => {
  it('no arguments is a usage error', () => {
    expect(() => parseSmokeArgs([])).toThrow(UsageError);
  });

  it('an unknown option is a usage error', () => {
    expect(() => parseSmokeArgs(['--bogus'])).toThrow(UsageError);
  });

  it('a missing --pack-dir directory is a usage error', () => {
    expect(() =>
      parseSmokeArgs(['--pack-dir', join(tmpdir(), 'codemod-smoke-no-such-dir')]),
    ).toThrow(UsageError);
  });

  it('--pack-dir cannot be combined with an explicit tarball', () => {
    expect(() => parseSmokeArgs(['--pack-dir', tmpdir(), '--codemod', 'x.tgz'])).toThrow(
      UsageError,
    );
  });

  it('an empty --pack-dir is a usage error and main exits 2', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'codemod-smoke-empty-'));
    try {
      expect(() => parseSmokeArgs(['--pack-dir', dir])).toThrow(UsageError);
      expect(await main(['--pack-dir', dir])).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--pack-dir picks the two tarballs and --keep is read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codemod-smoke-pack-'));
    try {
      writeFileSync(join(dir, 'modern-cmdk-1.2.3.tgz'), '');
      writeFileSync(join(dir, 'modern-cmdk-codemod-1.0.0.tgz'), '');
      expect(parseSmokeArgs(['--pack-dir', dir, '--keep'])).toEqual({
        modernCmdk: join(dir, 'modern-cmdk-1.2.3.tgz'),
        codemod: join(dir, 'modern-cmdk-codemod-1.0.0.tgz'),
        keep: true,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveBin', () => {
  it('reads the bin from a map or a string and refuses a missing one', () => {
    expect(resolveBin({ bin: { 'modern-cmdk': './dist/codemod/bin.mjs' } }, 'modern-cmdk')).toBe(
      './dist/codemod/bin.mjs',
    );
    expect(resolveBin({ bin: './cli.mjs' }, 'x')).toBe('./cli.mjs');
    expect(() => resolveBin({ bin: { other: './x.mjs' } }, 'modern-cmdk')).toThrow();
    expect(() => resolveBin({}, 'modern-cmdk')).toThrow();
  });
});

describe('snapshotTree and diffTrees', () => {
  it('report a missing, a changed and an extra file, and nothing for identical trees', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codemod-smoke-tree-'));
    try {
      mkdirSync(join(dir, 'src'));
      writeFileSync(join(dir, 'src/a.ts'), 'a');
      writeFileSync(join(dir, 'b.css'), 'b');
      const before = snapshotTree(dir);
      expect([...before.keys()].sort()).toEqual(['b.css', 'src/a.ts']);
      expect(diffTrees(before, snapshotTree(dir))).toEqual([]);
      writeFileSync(join(dir, 'src/a.ts'), 'changed');
      writeFileSync(join(dir, 'new.ts'), 'n');
      rmSync(join(dir, 'b.css'));
      expect(diffTrees(before, snapshotTree(dir)).sort()).toEqual([
        'differs src/a.ts',
        'extra new.ts',
        'missing b.css',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('npm release-age policy', () => {
  it('SEC-64: minReleaseAgeDays reads minimumReleaseAge from pnpm-workspace.yaml and rounds minutes up to days', () => {
    expect(minReleaseAgeDays('minimumReleaseAge: 1440\n')).toBe(1);
    expect(minReleaseAgeDays('minimumReleaseAge: 1441\n')).toBe(2);
    expect(minReleaseAgeDays('minimumReleaseAge: 10\n')).toBe(1);
    expect(() => minReleaseAgeDays('minimumReleaseAgeStrict: true\n')).toThrow(UsageError);
    expect(() => minReleaseAgeDays('minimumReleaseAge: soon\n')).toThrow(UsageError);
    expect(
      minReleaseAgeDays(
        readFileSync(resolve(import.meta.dirname, '../../pnpm-workspace.yaml'), 'utf8'),
      ),
    ).toBe(1);
    expect(npmPolicyArgs(2)).toEqual(['--min-release-age=2']);
  });

  it('SEC-67: a pnpm-workspace.yaml without a numeric minimumReleaseAge makes main exit 2 with the usage message, not an unhandled rejection', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'codemod-smoke-sec67-'));
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      // An empty tarball satisfies the existence check of parseSmokeArgs; main then reads the workspace file and throws the
      // UsageError before any tarball or npm use.
      const tarball = join(dir, 'modern-cmdk-codemod-1.0.0.tgz');
      writeFileSync(tarball, '');
      const workspace = join(dir, 'pnpm-workspace.yaml');
      writeFileSync(workspace, 'minimumReleaseAgeStrict: true\n');
      expect(await main(['--codemod', tarball], workspace)).toBe(2);
      const written = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(written).toContain('minimumReleaseAge');
      expect(written).toContain('usage: node scripts/codemod-tarball-smoke.ts');
    } finally {
      stderr.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('SEC-67: a missing workspace file and an unsupported pnpm-workspace.yaml line make main exit 2 with the usage message too', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'codemod-smoke-sec67b-'));
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const tarball = join(dir, 'modern-cmdk-codemod-1.0.0.tgz');
      writeFileSync(tarball, '');
      const missing = join(dir, 'missing.yaml');
      expect(await main(['--codemod', tarball], missing)).toBe(2);
      let written = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(written).toContain(`cannot read ${missing}`);
      expect(written).toContain('usage: node scripts/codemod-tarball-smoke.ts');
      stderr.mockClear();
      const unsupported = join(dir, 'pnpm-workspace.yaml');
      writeFileSync(unsupported, 'some-key: 1\n');
      expect(await main(['--codemod', tarball], unsupported)).toBe(2);
      written = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(written).toContain("unsupported line 'some-key: 1'");
      expect(written).toContain('usage: node scripts/codemod-tarball-smoke.ts');
    } finally {
      stderr.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('SEC-64: every npm argv the smoke builds carries --min-release-age', () => {
    expect(npmInstallArgs(1, 'x.tgz')).toEqual([
      'install',
      '--no-audit',
      '--no-fund',
      '--ignore-scripts',
      '--omit=peer',
      '--min-release-age=1',
      'x.tgz',
    ]);
    expect(npmExecArgs(1, 'x.tgz', ['--dry-run'])).toEqual([
      'exec',
      '--yes',
      '--min-release-age=1',
      '--package',
      'x.tgz',
      '--',
      'modern-cmdk-codemod',
      'data-attrs',
      'src',
      '--dry-run',
    ]);
    // Every runNpm call site takes its argv from one of the two builders, and there are exactly three.
    const source = readFileSync(
      resolve(import.meta.dirname, '../../scripts/codemod-tarball-smoke.ts'),
      'utf8',
    );
    const sites = [...source.matchAll(/runNpm\(\s*(npm\w+)/g)].map((match) => match[1]);
    expect([...source.matchAll(/\brunNpm\(/g)]).toHaveLength(4); // the definition and three calls
    expect(sites).toHaveLength(3);
    for (const site of sites) expect(['npmInstallArgs', 'npmExecArgs']).toContain(site);
  });
});
