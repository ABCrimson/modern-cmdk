// tests/unit/ci-workflow.test.ts
// RDG-126, RDG-127, RDG-130: the rules .github/workflows/ci.yml states in comments, pinned as tests.
// Regex over the YAML as release-workflow.test.ts does: no YAML parser is a dependency of the workspace.
// Jobs sit at two-space indentation under `jobs:`; a job block runs to the next job key or job-level comment.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');

/** The lines of one job (its key line included) up to the next two-space-indented key or comment. */
function job(name: string): string {
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf(`  ${name}:`);
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}(#|[a-z][\w-]*:)/.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

describe('ci.yml', () => {
  it('RDG-127: the e2e, docs and consumers jobs install Chromium through the bounded retry that announces every failed attempt', () => {
    for (const name of ['e2e', 'docs', 'consumers']) {
      const block = job(name);
      expect(block, `${name} job`).toContain(
        '- name: Install Chromium (bounded retry on the apt mirror)',
      );
      expect(block, `${name} job`).toContain('for i in 1 2 3; do');
      expect(block, `${name} job`).toContain(
        'pnpm playwright install --with-deps chromium && exit 0',
      );
      expect(block, `${name} job`).toContain('::warning::playwright install attempt $i failed');
      expect(block, `${name} job`).toContain('::error::playwright install failed 3 times');
      expect(block, `${name} job`).not.toMatch(/^ {6}- run: pnpm playwright install/m);
      expect(block.match(/for i in 1 2 3; do/g), `${name} job`).toHaveLength(1);
    }
    expect(workflow).not.toMatch(/^\s+- run: pnpm playwright install/m);
    // The retry is for the install only: each test step after it is its own step, never inside the retry loop.
    expect(job('e2e')).toMatch(/^ {6}- run: pnpm playwright test$/m);
    expect(job('consumers')).toMatch(/^ {6}- run: node scripts\/consumer-smoke\.ts /m);
    expect(job('docs')).toMatch(/^ {6}- run: pnpm test:docs$/m);
  });

  it('the docs job uploads test-results/ whatever the test step did, so a flaky run leaves its trace (failOnFlakyTests fails the job)', () => {
    // playwright.docs.config.ts keeps a trace of every failed attempt under test-results/docs-runs, retried ones included
    const block = job('docs');
    const step = block.slice(block.indexOf('      - uses: actions/upload-artifact@'));
    expect(step).toMatch(/^ {6}- uses: actions\/upload-artifact@[0-9a-f]{40} # v\d/m);
    expect(step).toMatch(/^ {8}if: always\(\)$/m);
    expect(step).toMatch(/^ {10}name: docs-render$/m);
    expect(step).toMatch(/^ {10}path: test-results\/$/m);
    expect(block.indexOf('pnpm test:docs')).toBeLessThan(block.indexOf('upload-artifact'));
  });

  it('RDG-126, RDG-130: the consumers and package jobs take no pnpm store cache', () => {
    const cacheLine = /^ +cache:[ \t]*['"]?pnpm['"]?[ \t]*(#.*)?$/m;
    expect(job('consumers')).not.toMatch(cacheLine);
    expect(job('package')).not.toMatch(cacheLine);
  });
});
