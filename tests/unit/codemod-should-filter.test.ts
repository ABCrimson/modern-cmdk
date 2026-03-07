import type { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';
import { describe, expect, it } from 'vitest';
import transform from '../../packages/command-codemod/src/transforms/should-filter.js';

function createApi(parser = 'tsx'): API {
  return {
    jscodeshift: jscodeshift.withParser(parser),
    j: jscodeshift.withParser(parser),
    stats: () => {},
    report: () => {},
  };
}

function run(source: string, parser = 'tsx'): string {
  const fileInfo: FileInfo = { path: 'test.tsx', source };
  return transform(fileInfo, createApi(parser));
}

describe('codemod: should-filter', () => {
  it('removes shouldFilter={true}', () => {
    const input = `const el = <Command shouldFilter={true} />;`;
    const output = run(input);

    expect(output).not.toContain('shouldFilter');
    // The attribute should be removed entirely since true is the default
    expect(output).not.toContain('filter');
    expect(output).toContain('<Command');
  });

  it('removes bare shouldFilter attribute', () => {
    const input = `const el = <Command shouldFilter />;`;
    const output = run(input);

    // Bare shouldFilter is implicitly true, so it should be removed
    expect(output).not.toContain('shouldFilter');
    expect(output).not.toContain('filter');
    expect(output).toContain('<Command');
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
