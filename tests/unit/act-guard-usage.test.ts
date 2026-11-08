// tests/unit/act-guard-usage.test.ts
// The act guard (tests/setup.ts, tests/act-guard.ts) records a React act warning when console.error is called. A spy
// whose mockImplementation swallows the call would hide the warning, so a test that silences console.error calls
// silenceConsoleError() from tests/act-guard.ts, whose implementation records before it discards. This test reads
// the source of every test file and fails naming each file that spies on console.error and gives the spy its own
// mockImplementation.

import { glob, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const testsDir = resolve(import.meta.dirname, '..');
const guardFile = resolve(testsDir, 'act-guard.ts');
const SWALLOWING_SPY = /spyOn\(\s*console\s*,\s*['"`]error['"`]\s*\)\s*\.mockImplementation\(/;

describe('the act guard cannot be silenced by a console.error spy', () => {
  it('no file under tests/ spies on console.error with its own mockImplementation, except tests/act-guard.ts', async () => {
    const offenders: string[] = [];
    for await (const path of glob('**/*.{ts,tsx}', {
      cwd: testsDir,
      exclude: (name: string): boolean => name === 'node_modules',
    })) {
      const file = resolve(testsDir, path);
      if (file === guardFile || file === import.meta.filename) continue;
      if (SWALLOWING_SPY.test(await readFile(file, 'utf-8'))) {
        offenders.push(relative(testsDir, file).split(sep).join('/'));
      }
    }
    expect(
      offenders,
      'use silenceConsoleError() from tests/act-guard.ts instead of vi.spyOn(console, "error").mockImplementation(...)',
    ).toEqual([]);
  });
});
