// tests/unit/e2e-spec-guards.test.ts
// Source-level guards over the Playwright specs in tests/e2e. They read the spec files and need
// no browser.

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const E2E_DIR = resolve(import.meta.dirname, '../e2e');

// T22: a spec asserts its item count and its visibility; it never returns early when the count is
// zero or a trigger is missing, because the case would then pass without running its body.
it('T22: no e2e spec returns early on a count or visibility guard', () => {
  const earlyReturns = [
    /\bif \(.*[cC]ount\b.*\) return\b/,
    /hasTrigger/,
    /count > 0/,
    /isVisible\(\)\)+ return/,
  ];
  const offenders: string[] = [];
  for (const file of readdirSync(E2E_DIR).filter((name) => name.endsWith('.spec.ts'))) {
    const lines = readFileSync(resolve(E2E_DIR, file), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (earlyReturns.some((pattern) => pattern.test(line))) {
        offenders.push(`${file}:${index + 1}`);
      }
    });
  }
  expect(offenders, 'early-return guards in the e2e specs').toEqual([]);
});
