// tests/unit/ci-workflow.test.ts
// RDG-126, RDG-127, RDG-130, SEC-72, R5: the rules .github/workflows/ci.yml states in comments, pinned as tests.
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
  // The title is the string tests/bug-matrix.json cites for RDG-127, so it keeps its original three jobs; the loop below also covers browser-bench (R5)
  it('RDG-127: the e2e, docs and consumers jobs install Chromium through the bounded retry that announces every failed attempt', () => {
    for (const name of ['e2e', 'docs', 'consumers', 'browser-bench']) {
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
    expect(job('consumers')).toMatch(/^ {6}- run: pnpm run test:consumers /m);
    expect(job('docs')).toMatch(/^ {6}- run: pnpm test:docs$/m);
    expect(job('browser-bench')).toMatch(/^ {6}- run: node benchmarks\/browser\/run\.ts$/m);
  });

  it('RDG-126, RDG-130: the consumers and package jobs take no pnpm store cache', () => {
    const cacheLine = /^ +cache:[ \t]*['"]?pnpm['"]?[ \t]*(#.*)?$/m;
    expect(job('consumers')).not.toMatch(cacheLine);
    expect(job('package')).not.toMatch(cacheLine);
  });

  it('SEC-72: the consumers and templates jobs run the smoke scripts through pnpm run, so npm_execpath names the pnpm entry the scripts spawn', () => {
    // scripts/consumer-smoke.ts and scripts/template-smoke.ts spawn pnpm without a shell through the entry
    // npm_execpath names (SEC-70) and exit 2 with a usage line when it is absent. A bare `node scripts/…` step
    // has no npm_execpath: that is how the runs on e6e66d9 and 4e5b933 failed all four smoke jobs.
    expect(job('consumers')).toMatch(
      /^ {6}- run: pnpm run test:consumers --app \$\{\{ matrix\.variant \}\} --report consumers-\$\{\{ matrix\.variant \}\}\.json$/m,
    );
    expect(job('templates')).toMatch(
      /^ {6}- run: pnpm run test:templates --pack-dir "\$RUNNER_TEMP\/pack" --template all$/m,
    );
    expect(workflow).not.toMatch(/^ {6}- run: node scripts\/(?:consumer|template)-smoke\.ts/m);
  });

  it('R5: the browser-bench job downloads the dist, installs Chromium, runs the harness as its own step and always uploads the results', () => {
    const block = job('browser-bench');
    expect(block).toMatch(/^ {4}needs: build$/m);
    expect(block).toMatch(/^ {4}runs-on: ubuntu-26\.04$/m);
    expect(block).toMatch(/^ {4}name: .*Chromium.*10K mount/m);
    // The dist artifact is downloaded and extracted exactly as the e2e job does
    const download =
      /^ {6}- uses: actions\/download-artifact@.*\n(?: {8}.*\n)+? {6}- name: Extract the dist\n {8}run: .*$/m;
    const e2eDownload = download.exec(job('e2e'))?.[0];
    expect(e2eDownload, 'the e2e job downloads and extracts the dist').toBeDefined();
    expect(download.exec(block)?.[0]).toBe(e2eDownload);
    // Order: install Chromium, then the harness (its own step), then the upload
    const install = block.indexOf('- name: Install Chromium (bounded retry on the apt mirror)');
    const harness = block.indexOf('      - run: node benchmarks/browser/run.ts\n');
    const upload = block.indexOf('actions/upload-artifact@');
    expect(install).toBeGreaterThan(-1);
    expect(harness).toBeGreaterThan(install);
    expect(upload).toBeGreaterThan(harness);
    expect(block.slice(upload)).toMatch(/^ {8}if: always\(\)$/m);
    expect(block.slice(upload)).toContain('path: benchmarks/browser/results/');
    // No mask: a failing gate fails the job
    expect(block).not.toContain('continue-on-error');
    expect(block).not.toContain('|| true');
    // Every action is SHA-pinned with a version comment
    for (const use of block.match(/^ +- uses: .*$/gm) ?? []) {
      expect(use).toMatch(/@[0-9a-f]{40} # v\d/);
    }
  });

  it('R5: the CI Summary needs the browser-bench job and lists it in its rows table', () => {
    const block = job('summary');
    const needs = /^ {4}needs: \[(.*)\]$/m.exec(block)?.[1]?.split(/,\s*/) ?? [];
    expect(needs).toContain('browser-bench');
    expect(block).toMatch(/^ {12}"browser-bench\|.*Chromium.*"$/m);
    // The header comment states the job count the needs list really has
    expect(workflow).toContain(`summary needs all ${needs.length} jobs`);
  });
});
