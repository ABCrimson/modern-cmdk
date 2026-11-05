// tests/dist/one-core.test.ts
// 1.4.0 one-core invariant: dist/react imports the core from the package name 'modern-cmdk'
// and carries no second copy of it. Reads the BUILT files (packages/modern-cmdk/dist), so it
// needs `pnpm build` first — CI builds before `vitest run`.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const distRoot: string = resolve(import.meta.dirname, '../../packages/modern-cmdk/dist');
const reactDir: string = join(distRoot, 'react');
const coreEntry: string = join(distRoot, 'core/index.mjs');
const distBuilt: boolean = existsSync(coreEntry) && existsSync(join(reactDir, 'index.mjs'));

if (!distBuilt && process.env.CI) {
  // A silent pass would hide a missing build — fail the whole file loudly in CI.
  throw new Error(
    `${distRoot} is missing its core or react build — run pnpm build first (tests/dist needs the built package)`,
  );
}
if (!distBuilt) {
  // biome-ignore lint/suspicious/noConsole: tells the developer why this file is skipped
  console.warn(`[tests/dist] skipped: ${distRoot} is not built — run pnpm build first`);
}

function distFiles(dir: string, suffix: string): readonly string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .map((name) => join(dir, name));
}

const read = (file: string): string => readFileSync(file, 'utf8');

describe.skipIf(!distBuilt)('built package: one core', () => {
  it('dist/react imports the core from modern-cmdk', () => {
    const importsCore = distFiles(reactDir, '.mjs').some((file) =>
      /^(?:import|export)\b[^;]*?\bfrom\s*["']modern-cmdk["']/mu.test(read(file)),
    );
    expect(importsCore).toBe(true);
  });

  it('dist/react defines no core export', async () => {
    const names = Object.keys(await import(pathToFileURL(coreEntry).href));
    expect(names.length).toBeGreaterThan(0);
    const declared: string[] = [];
    for (const file of distFiles(reactDir, '.mjs')) {
      const source = read(file);
      for (const name of names) {
        const declaration = new RegExp(
          String.raw`^(?:export\s+)?(?:(?:async\s+)?function\*?\s+|class\s+|const\s+|let\s+|var\s+)${name}\b`,
          'mu',
        );
        if (declaration.test(source)) declared.push(`${file}: ${name}`);
      }
    }
    expect(declared).toEqual([]);
  });

  it('ARCH-54: dist/react carries no src/core region', () => {
    const regions: string[] = [];
    for (const file of distFiles(reactDir, '.mjs')) {
      for (const match of read(file).matchAll(/^\/\/ (src\/core\/\S+)$/gmu)) {
        if (match[1] !== undefined) regions.push(match[1]);
      }
    }
    expect(regions).toEqual([]);
  });

  it('TEB-94, ARCH-55: every dist/react/*.mjs starts with exactly one use client directive', () => {
    const reactFiles = distFiles(reactDir, '.mjs');
    expect(reactFiles.length).toBeGreaterThan(0);
    for (const file of reactFiles) {
      const directives = read(file).match(/^['"]use client['"];?\s*$/gmu) ?? [];
      expect(directives, file).toHaveLength(1);
      expect(read(file).startsWith("'use client';"), file).toBe(true);
    }
    for (const file of distFiles(join(distRoot, 'core'), '.mjs')) {
      expect(read(file)).not.toMatch(/['"]use client['"]/u);
    }
  });

  it('dist/react declarations import the core types from modern-cmdk', () => {
    const declarations = distFiles(reactDir, '.d.mts');
    expect(declarations.some((file) => /\bfrom\s*["']modern-cmdk["']/u.test(read(file)))).toBe(
      true,
    );
    expect(declarations.filter((file) => read(file).includes('__itemIdBrand'))).toEqual([]);
  });
});
