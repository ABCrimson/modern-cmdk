import type { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';
import { describe, expect, it } from 'vitest';
import transform from '../../packages/modern-cmdk/src/codemod/transforms/should-filter.js';

// Vitest 4.1 — vi.hoisted() not needed here since helpers are pure functions
function createApi(parser: string = 'tsx'): API {
  return {
    jscodeshift: jscodeshift.withParser(parser),
    j: jscodeshift.withParser(parser),
    stats: (): void => {},
    report: (): void => {},
  };
}

function run(source: string, parser: string = 'tsx'): string {
  const fileInfo: FileInfo = { path: 'test.tsx', source };
  return transform(fileInfo, createApi(parser));
}

describe('codemod: should-filter', () => {
  it('removes shouldFilter={true}', () => {
    const input = `const el = <Command shouldFilter={true} />;`;
    const output = run(input);

    // Vitest 4.1 — soft assertions to check all conditions
    expect.soft(output).not.toContain('shouldFilter');
    // The attribute should be removed entirely since true is the default
    expect.soft(output).not.toContain('filter');
    expect.soft(output).toContain('<Command');
  });

  it('removes bare shouldFilter attribute', () => {
    const input = `const el = <Command shouldFilter />;`;
    const output = run(input);

    // Bare shouldFilter is implicitly true, so it should be removed
    expect.soft(output).not.toContain('shouldFilter');
    expect.soft(output).not.toContain('filter');
    expect.soft(output).toContain('<Command');
  });

  it('renames shouldFilter={false} to filter={false}', () => {
    const input = `const el = <Command shouldFilter={false} />;`;
    const output = run(input);

    expect(output).not.toContain('shouldFilter');
    expect(output).toContain('filter={false}');
  });

  it('skips files without shouldFilter', () => {
    const input = `const el = <Command label="search" />;`;
    const output = run(input);

    expect(output).toBe(input);
  });
});
