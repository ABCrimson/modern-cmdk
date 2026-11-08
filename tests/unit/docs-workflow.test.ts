// tests/unit/docs-workflow.test.ts
// The Docs workflow (.github/workflows/docs.yml) deploys GitHub Pages on a push to main that changes an input of the site
// build. The redesigned site reads three inputs outside apps/docs at build time: the modern-cmdk manifest (the version in
// the nav, the footer and the home eyebrow; config.ts and the records loader), the size records and the search baseline
// (the home-page figures; records.data.ts). A trigger that misses one leaves the deployed site stale after the push that
// changes it, for example the Version PR merge that bumps the manifest. The lists below are the coupling, pinned in both
// directions so that a change to either side fails here instead of silently going stale.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root: string = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

const workflow: string = read('.github/workflows/docs.yml');
const loader: string = read('apps/docs/.vitepress/theme/data/records.data.ts');
const config: string = read('apps/docs/.vitepress/config.ts');

/** The quoted items of the `paths:` block under `on.push`, in file order. */
function triggerPaths(): string[] {
  const block: RegExpExecArray | null =
    /^on:\n {2}push:\n(?: {4}.*\n)*? {4}paths:\n((?: {6}- '[^']+'\n)+)/m.exec(workflow);
  if (block?.[1] === undefined) throw new Error('docs.yml has no multi-line on.push.paths block');
  return [...block[1].matchAll(/^ {6}- '([^']+)'$/gm)].map((m) => m[1] ?? '');
}

describe('.github/workflows/docs.yml deploys on every input of the site build', () => {
  it('runs on pushes to main only, in the pages concurrency group without cancellation', () => {
    expect(workflow).toContain('on:\n  push:\n    branches: [main]\n');
    expect(workflow).toContain('concurrency:\n  group: pages\n  cancel-in-progress: false\n');
  });

  it('the trigger paths are the docs app, the package sources, the modern-cmdk manifest, the size records and the search baseline', () => {
    expect(triggerPaths()).toEqual([
      'apps/docs/**',
      'packages/*/src/**',
      'packages/modern-cmdk/package.json',
      'benchmarks/size-history/**',
      'benchmarks/baseline.json',
    ]);
  });

  it('the three inputs outside apps/docs are the ones the site reads at build time', () => {
    expect(config).toContain(
      "import pkg from '../../../packages/modern-cmdk/package.json' with { type: 'json' };",
    );
    expect(loader).toContain('benchmarks/size-history/');
    expect(loader).toContain('benchmarks/baseline.json');
    expect(loader).toContain('packages/modern-cmdk/package.json');
  });
});
