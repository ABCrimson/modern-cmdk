import type { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';
import { describe, expect, it } from 'vitest';
import transform from '../../packages/modern-cmdk/src/codemod/transforms/data-attrs.js';

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

const attrRenameCases: readonly { readonly attr: string; readonly expected: string }[] = [
  { attr: 'cmdk-root', expected: 'data-command' },
  { attr: 'cmdk-item', expected: 'data-command-item' },
  { attr: 'cmdk-input', expected: 'data-command-input' },
  { attr: 'cmdk-list', expected: 'data-command-list' },
  { attr: 'cmdk-group', expected: 'data-command-group' },
  { attr: 'cmdk-separator', expected: 'data-command-separator' },
  { attr: 'cmdk-empty', expected: 'data-command-empty' },
  { attr: 'cmdk-loading', expected: 'data-command-loading' },
];

describe('codemod: data-attrs', () => {
  // Data-driven JSX attribute renames
  describe('JSX attribute renames', () => {
    it.for(attrRenameCases)('renames $attr to $expected', ({ attr, expected }) => {
      const tag = attr === 'cmdk-input' ? 'input' : 'div';
      const input = `const el = <${tag} ${attr}="" />;`;
      const output = run(input);

      // Vitest — soft assertions to check both conditions
      expect.soft(output).toContain(expected);
      expect.soft(output).not.toContain(attr);
    });
  });

  it('replaces [cmdk-*] in querySelector strings', () => {
    const input = `const el = document.querySelector('[cmdk-item]');`;
    const output = run(input);

    expect(output).toContain('[data-command-item]');
    expect(output).not.toContain('[cmdk-item]');
  });

  it('replaces [cmdk-*] in template literals', () => {
    const input = 'const selector = `[cmdk-root] > [cmdk-list]`;';
    const output = run(input);

    expect.soft(output).toContain('[data-command]');
    expect.soft(output).toContain('[data-command-list]');
    expect.soft(output).not.toContain('[cmdk-root]');
    expect.soft(output).not.toContain('[cmdk-list]');
  });

  it('replaces --cmdk-list-height CSS variable', () => {
    const input = `const style = 'var(--cmdk-list-height)';`;
    const output = run(input);

    expect(output).toContain('--command-list-height');
    expect(output).not.toContain('--cmdk-list-height');
  });

  it('handles multiple attributes in one element', () => {
    const input = `const el = <div cmdk-root="" cmdk-item="" />;`;
    const output = run(input);

    expect.soft(output).toContain('data-command');
    expect.soft(output).toContain('data-command-item');
    expect.soft(output).not.toContain('cmdk-root');
    expect.soft(output).not.toContain('cmdk-item');
  });

  it('returns original when no cmdk references exist', () => {
    const input = `const el = <div data-testid="hello" />;`;
    const output = run(input);

    expect(output).toBe(input);
  });
});
