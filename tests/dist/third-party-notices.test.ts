// tests/dist/third-party-notices.test.ts
// PKG-5, F16: the notices file names every package the built dist/codemod bundles. Needs `pnpm build` first.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bundledPackages, main } from '../../scripts/third-party-notices.ts';

const packageDir: string = resolve(import.meta.dirname, '../../packages/modern-cmdk');
const codemodDist: string = join(packageDir, 'dist/codemod');
const built: boolean = existsSync(join(codemodDist, 'cli.mjs'));

if (!built && process.env.CI) {
  throw new Error(`${codemodDist} is missing — run pnpm build first`);
}

describe.skipIf(!built)('THIRD-PARTY-NOTICES.md', () => {
  it('PKG-5, F16: THIRD-PARTY-NOTICES.md names every package bundled into dist/codemod', () => {
    const sources: string[] = readdirSync(codemodDist, { withFileTypes: true, recursive: true })
      .filter((e) => e.isFile() && e.name.endsWith('.mjs'))
      .map((e) => readFileSync(join(e.parentPath, e.name), 'utf8'));
    const names: string[] = [...new Set(bundledPackages(sources).map((p) => p.name))];
    expect(names).toContain('jscodeshift');
    const notices: string = readFileSync(join(packageDir, 'THIRD-PARTY-NOTICES.md'), 'utf8');
    for (const name of names) expect(notices, name).toMatch(new RegExp(`^## ${name}@\\S+$`, 'm'));
    // the in-process --check: the file equals what the generator writes for this dist
    expect(main(['--check'])).toBe(0);
  });
});
