// tests/unit/act-guard-usage.test.ts
// The act guard (tests/setup.ts, tests/act-guard.ts) records a React act warning when console.error is called. A spy
// or an assignment that replaces console.error would route the call away from the guard's wrapper, so the only
// console.error spy is the one silenceConsoleError() in tests/act-guard.ts makes, and tests/setup.ts is the only
// place that assigns console.error. This test reads the source of every test file under tests/ and packages/*/src
// (the unit project's tree) and fails naming each other file that spies on console.error, through `console` or
// `globalThis.console`, or assigns to it.

import { glob, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');
const allowed = new Set([
  resolve(repoRoot, 'tests/act-guard.ts'),
  resolve(repoRoot, 'tests/setup.ts'),
  import.meta.filename,
]);
const CONSOLE_ERROR_SPY =
  /spyOn\(\s*(?:globalThis\.)?console\s*,\s*['"`]error['"`]|console\.error\s*=(?!=)/;

describe('the act guard cannot be bypassed by a console.error spy', () => {
  it('no file under tests/ or packages/*/src spies on or replaces console.error, except tests/act-guard.ts and tests/setup.ts', async () => {
    const offenders: string[] = [];
    for await (const path of glob(['tests/**/*.{ts,tsx}', 'packages/*/src/**/*.test.{ts,tsx}'], {
      cwd: repoRoot,
      exclude: (name: string): boolean => name === 'node_modules',
    })) {
      const file = resolve(repoRoot, path);
      if (allowed.has(file)) continue;
      if (CONSOLE_ERROR_SPY.test(await readFile(file, 'utf-8'))) {
        offenders.push(relative(repoRoot, file).split(sep).join('/'));
      }
    }
    expect(
      offenders,
      'use the MockInstance silenceConsoleError() from tests/act-guard.ts returns, and assert on its calls',
    ).toEqual([]);
  });
});
