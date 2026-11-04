// tests/dist/manifest.test.ts
// 1.4.0 package integrity: the library manifest and the built dist tell the truth.
// Reads packages/modern-cmdk/package.json and the BUILT dist, so it needs `pnpm build` first.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageDir: string = resolve(import.meta.dirname, '../../packages/modern-cmdk');
const packageJsonPath: string = join(packageDir, 'package.json');
const distBuilt: boolean = existsSync(join(packageDir, 'dist/core/index.mjs'));

if (!distBuilt && process.env.CI) {
  // A silent pass would hide a missing build — fail the whole file loudly in CI.
  throw new Error(`${packageDir}/dist is missing — run pnpm build first`);
}

interface Manifest {
  readonly engines?: { readonly node?: string };
  readonly exports: Record<string, string | Record<string, string>>;
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
    expect.hasAssertions();
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
    expect.hasAssertions();
    const repeats: string[] = [];
    for (const [key, value] of Object.entries(readManifest(packageJsonPath).exports)) {
      if (typeof value === 'string') continue;
      for (const [condition, target] of Object.entries(value)) {
        if (condition !== 'default' && target === value.default)
          repeats.push(`${key}: ${condition}`);
      }
    }
    expect(repeats).toEqual([]);
  });

  it('exports keys', () => {
    expect.hasAssertions();
    expect(Object.keys(readManifest(packageJsonPath).exports)).toEqual([
      '.',
      './react',
      './react/dialog',
      './styles.css',
      './package.json',
    ]);
  });

  it('sideEffects lists only the stylesheet', () => {
    expect.hasAssertions();
    expect(readManifest(packageJsonPath).sideEffects).toEqual(['./dist/react/styles.css']);
  });

  it('engines: none on modern-cmdk, >=26.4.0 on create-modern-cmdk (D14)', () => {
    expect.hasAssertions();
    expect(readManifest(packageJsonPath).engines).toBeUndefined();
    const create = readManifest(join(packageDir, '../create-modern-cmdk/package.json'));
    expect(create.engines?.node).toBe('>=26.4.0');
  });

  it.skipIf(!distBuilt)('dist/codemod ships no declaration files', () => {
    expect.hasAssertions();
    const declarations = codemodFiles(join(packageDir, 'dist/codemod')).filter((file) =>
      /\.d\.[cm]?ts$/u.test(file),
    );
    expect(declarations).toEqual([]);
  });

  it.skipIf(!distBuilt)(
    'radix-ui is a required peer while modern-cmdk/react imports it (RP-02)',
    () => {
      expect.hasAssertions();
      const manifest = readManifest(packageJsonPath);
      expect(manifest.peerDependencies?.['radix-ui']).toBe('>=1.4.0 <2.0.0');
      expect(manifest.peerDependenciesMeta?.['radix-ui']).toBeUndefined();
      const dialogChunk = readFileSync(join(packageDir, 'dist/react/chunk-dialog.mjs'), 'utf8');
      expect(dialogChunk).toContain('from "radix-ui"');
    },
  );
});
