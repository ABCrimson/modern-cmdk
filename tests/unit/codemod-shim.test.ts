// PKG-1: the deprecated `modern-cmdk` bin is a shim (packages/modern-cmdk/src/codemod/bin.ts) over the bundled
// codemod CLI. shimArgv decides lenient or strict; the built shim itself is covered by tests/dist/cli-smoke.test.ts.

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  DEPRECATION_WARNING,
  type Run,
  shimArgv,
} from '../../packages/modern-cmdk/src/codemod/bin.js';
import type { run } from '../../packages/modern-cmdk-codemod/src/cli.js';

describe('PKG-1: the modern-cmdk bin shim', () => {
  it('PKG-1: shimArgv puts --lenient first when argv carries no --strict', () => {
    expect(shimArgv([])).toEqual(['--lenient']);
    expect(shimArgv(['import-rewrite', './src'])).toEqual(['--lenient', 'import-rewrite', './src']);
    expect(shimArgv(['--bogus'])).toEqual(['--lenient', '--bogus']);
    expect(shimArgv(['import-rewrite', './src', '--dry-run'])).toEqual([
      '--lenient',
      'import-rewrite',
      './src',
      '--dry-run',
    ]);
  });

  it('PKG-1: shimArgv leaves argv alone when it carries --strict, wherever it stands', () => {
    expect(shimArgv(['--strict', '--bogus'])).toEqual(['--strict', '--bogus']);
    expect(shimArgv(['import-rewrite', './src', '--strict'])).toEqual([
      'import-rewrite',
      './src',
      '--strict',
    ]);
  });

  it('PKG-1: shimArgv does not mutate its input', () => {
    const argv: readonly string[] = ['x'];
    shimArgv(argv);
    expect(argv).toEqual(['x']);
  });

  it('F16, PKG-1: the deprecation warning is one line that starts as the smoke test expects', () => {
    expect(DEPRECATION_WARNING).not.toContain('\n');
    expect(DEPRECATION_WARNING.startsWith('warning: the modern-cmdk bin is deprecated')).toBe(true);
    expect(DEPRECATION_WARNING).toContain('npx modern-cmdk-codemod');
  });

  it("PKG-1: the shim's Run type accepts the codemod source's run, and agrees on argv and result", () => {
    expectTypeOf<typeof run>().toExtend<Run>();
    expectTypeOf<Parameters<Run>[0]>().toEqualTypeOf<Parameters<typeof run>[0]>();
    expectTypeOf<ReturnType<Run>>().toEqualTypeOf<ReturnType<typeof run>>();
    expectTypeOf<Parameters<Run>[1]>().toEqualTypeOf<Parameters<typeof run>[1]>();
    expect(true).toBe(true);
  });
});
