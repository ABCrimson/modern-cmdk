// tests/unit/codemod-tarball-smoke.test.ts
// The pure helpers of scripts/codemod-tarball-smoke.ts (the tarball exit gate). The script's checks themselves
// need packed tarballs and the npm registry; CI runs them (W5-01), this file pins the decisions around them.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  countDeprecationLines,
  diffTrees,
  findTarballs,
  main,
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
    'warning: the modern-cmdk bin is deprecated and leaves in modern-cmdk 2.0; use npx modern-cmdk-codemod (strict by default).';

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
