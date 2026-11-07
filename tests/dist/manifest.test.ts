// tests/dist/manifest.test.ts
// 1.4.0 package integrity: the library manifest and the built dist tell the truth.
// Reads packages/modern-cmdk/package.json, packages/modern-cmdk-codemod/package.json and the BUILT dist, so it needs `pnpm build` first.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageDir: string = resolve(import.meta.dirname, '../../packages/modern-cmdk');
const packageJsonPath: string = join(packageDir, 'package.json');
const codemodDir: string = resolve(import.meta.dirname, '../../packages/modern-cmdk-codemod');
const distBuilt: boolean = existsSync(join(packageDir, 'dist/core/index.mjs'));

if (!distBuilt && process.env.CI) {
  // A silent pass would hide a missing build — fail the whole file loudly in CI.
  throw new Error(`${packageDir}/dist is missing — run pnpm build first`);
}

interface Manifest {
  readonly name?: string;
  readonly version?: string;
  readonly bin?: Record<string, string>;
  readonly files?: readonly string[];
  readonly exports?: Record<string, string | Record<string, string>>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly publishConfig?: Record<string, string>;
  readonly engines?: { readonly node?: string };
  readonly sideEffects: readonly string[];
  readonly peerDependencies?: Record<string, string>;
  readonly peerDependenciesMeta?: Record<string, { readonly optional?: boolean }>;
}

const readManifest = (file: string): Manifest => JSON.parse(readFileSync(file, 'utf8'));

function codemodFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? codemodFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

describe('modern-cmdk manifest', () => {
  it('modern-cmdk/package.json resolves through the exports map', () => {
    const printed = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', "console.log(import.meta.resolve('modern-cmdk/package.json'))"],
      { cwd: packageDir, encoding: 'utf8' },
    ).trim();
    expect(printed).toBe(pathToFileURL(packageJsonPath).href);
    expect(createRequire(packageJsonPath).resolve('modern-cmdk/package.json')).toBe(
      packageJsonPath,
    );
  });

  it('no export condition repeats default', () => {
    const repeats: string[] = [];
    for (const [key, value] of Object.entries(readManifest(packageJsonPath).exports ?? {})) {
      if (typeof value === 'string') continue;
      for (const [condition, target] of Object.entries(value)) {
        if (condition !== 'default' && target === value.default)
          repeats.push(`${key}: ${condition}`);
      }
    }
    expect(repeats).toEqual([]);
  });

  it('exports keys', () => {
    expect(Object.keys(readManifest(packageJsonPath).exports ?? {})).toEqual([
      '.',
      './react',
      './react/dialog',
      './styles.css',
      './package.json',
    ]);
  });

  it('sideEffects lists only the stylesheet', () => {
    expect(readManifest(packageJsonPath).sideEffects).toEqual(['./dist/react/styles.css']);
  });

  it('engines: none on modern-cmdk, >=26.4.0 on create-modern-cmdk (D14)', () => {
    expect(readManifest(packageJsonPath).engines).toBeUndefined();
    const create = readManifest(join(packageDir, '../create-modern-cmdk/package.json'));
    expect(create.engines?.node).toBe('>=26.4.0');
  });

  it.skipIf(!distBuilt)('dist/codemod ships no declaration files', () => {
    const declarations = codemodFiles(join(packageDir, 'dist/codemod')).filter((file) =>
      /\.d\.[cm]?ts$/u.test(file),
    );
    expect(declarations).toEqual([]);
  });

  it.skipIf(!distBuilt)(
    'radix-ui is a required peer while modern-cmdk/react imports it (RP-02)',
    () => {
      const manifest = readManifest(packageJsonPath);
      expect(manifest.peerDependencies?.['radix-ui']).toBe('>=1.4.0 <2.0.0');
      expect(manifest.peerDependenciesMeta?.['radix-ui']).toBeUndefined();
      const dialogChunk = readFileSync(join(packageDir, 'dist/react/chunk-dialog.mjs'), 'utf8');
      expect(dialogChunk).toContain('from "radix-ui"');
    },
  );
});

describe('modern-cmdk bin (PKG-1)', () => {
  it('PKG-1: the modern-cmdk bin is the shim dist/codemod/bin.mjs', () => {
    expect(readManifest(packageJsonPath).bin).toEqual({ 'modern-cmdk': './dist/codemod/bin.mjs' });
  });

  it.skipIf(!distBuilt)(
    'PKG-1: the bin path exists, starts with a node shebang and is executable',
    () => {
      const bin = join(packageDir, 'dist/codemod/bin.mjs');
      expect(readFileSync(bin, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true);
      // Windows has no execute bit; elsewhere tsdown's ShebangPlugin grants it to a shebang entry at build time, and CI's
      // dist artifact is a tar (upload-artifact resets file modes to 644), so the bit reaches this job and the packed tarballs.
      expect(process.platform === 'win32' || (statSync(bin).mode & 0o111) !== 0).toBe(true);
    },
  );

  it('PKG-1: modern-cmdk has no runtime dependency on jscodeshift or on modern-cmdk-codemod, and no jscodeshift devDependency', () => {
    const manifest = readManifest(packageJsonPath);
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(['idb-keyval']);
    for (const name of ['jscodeshift', '@types/jscodeshift', 'globby', 'modern-cmdk-codemod']) {
      expect(manifest.devDependencies?.[name], name).toBeUndefined();
    }
  });
});

describe('modern-cmdk-codemod manifest (PKG-1, D17)', () => {
  const manifest = readManifest(join(codemodDir, 'package.json'));

  it('PKG-1: name, version, type and publish settings', () => {
    expect(manifest.name).toBe('modern-cmdk-codemod');
    // changesets bumps it: 0.0.0 plus a major changeset gives 1.0.0 (D62)
    expect(manifest.version).toBe('0.0.0');
    expect((manifest as { type?: string }).type).toBe('module');
    expect((manifest as { license?: string }).license).toBe('MIT');
    expect(manifest.publishConfig).toEqual({ access: 'public' });
  });

  it('PKG-1: a bin-only package: bin is dist/cli.mjs, there are no exports', () => {
    expect(manifest.bin).toEqual({ 'modern-cmdk-codemod': './dist/cli.mjs' });
    expect(manifest.exports).toBeUndefined();
  });

  it('PKG-1: engines.node >=26.4.0 (D14) and files dist and LICENSE', () => {
    expect(manifest.engines).toEqual({ node: '>=26.4.0' });
    expect(manifest.files).toEqual(['dist', 'LICENSE']);
  });

  it('PKG-1: jscodeshift is the one runtime dependency, taken from the catalog; globby is not used', () => {
    expect(manifest.dependencies).toEqual({ jscodeshift: 'catalog:' });
    expect(manifest.devDependencies?.globby).toBeUndefined();
    expect(Object.keys(manifest.devDependencies ?? {}).sort()).toEqual([
      '@types/jscodeshift',
      '@types/node',
      'tsdown',
      'typescript',
    ]);
  });

  it.skipIf(!existsSync(join(codemodDir, 'dist/cli.mjs')))(
    'PKG-1: the bin path exists, starts with a node shebang and the dist ships no declaration files',
    () => {
      const bin = join(codemodDir, 'dist/cli.mjs');
      expect(readFileSync(bin, 'utf8').startsWith('#!/usr/bin/env node\n')).toBe(true);
      expect(
        codemodFiles(join(codemodDir, 'dist')).filter((f) => /\.d\.[cm]?ts$/u.test(f)),
      ).toEqual([]);
    },
  );
});
