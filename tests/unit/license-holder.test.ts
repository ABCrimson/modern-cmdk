import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(repoRoot, path), 'utf8');

const COPYRIGHT_LINE = /^Copyright \(c\) \d{4} .+$/m;

const packageLicenses = [
  'packages/modern-cmdk/LICENSE',
  'packages/create-modern-cmdk/LICENSE',
  'packages/vscode-modern-cmdk/LICENSE',
  'packages/command-search-wasm/LICENSE',
] as const;

const readmes = [
  'README.md',
  'packages/modern-cmdk/README.md',
  'packages/create-modern-cmdk/README.md',
] as const;

describe('licence holder', () => {
  const rootLine = COPYRIGHT_LINE.exec(read('LICENSE'))?.[0];

  it('the root LICENSE carries a copyright line', () => {
    expect(rootLine).toBeDefined();
  });

  it('every package LICENSE carries the root copyright line', () => {
    for (const file of packageLicenses) {
      expect.soft(COPYRIGHT_LINE.exec(read(file))?.[0], file).toBe(rootLine);
    }
  });

  it.each(readmes)('%s names no "Crimson Dev" copyright', (file) => {
    expect(read(file)).not.toMatch(/Crimson Dev/);
  });
});
