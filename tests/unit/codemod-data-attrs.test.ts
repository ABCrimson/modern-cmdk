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

// ES2026 Object.groupBy — organize test cases by category for data-driven testing
const attrRenameTests: Partial<
  Record<string, { attr: string; expected: string; category: string }[]>
> = Object.groupBy(
  [
    { attr: 'cmdk-root', expected: 'data-command', category: 'jsx-attr' },
    { attr: 'cmdk-item', expected: 'data-command-item', category: 'jsx-attr' },
    { attr: 'cmdk-input', expected: 'data-command-input', category: 'jsx-attr' },
    { attr: 'cmdk-list', expected: 'data-command-list', category: 'jsx-attr' },
    { attr: 'cmdk-group', expected: 'data-command-group', category: 'jsx-attr' },
    { attr: 'cmdk-separator', expected: 'data-command-separator', category: 'jsx-attr' },
    { attr: 'cmdk-empty', expected: 'data-command-empty', category: 'jsx-attr' },
    { attr: 'cmdk-loading', expected: 'data-command-loading', category: 'jsx-attr' },
  ],
  (t) => t.category,
);

describe('codemod: data-attrs', () => {
  // Data-driven JSX attribute renames using Object.groupBy results
  describe('JSX attribute renames', () => {
    for (const testCase of attrRenameTests['jsx-attr'] ?? []) {
      it(`renames ${testCase.attr} to ${testCase.expected}`, () => {
        const tag = testCase.attr === 'cmdk-input' ? 'input' : 'div';
        const input = `const el = <${tag} ${testCase.attr}="" />;`;
        const output = run(input);

        // Vitest 4.1 — soft assertions to check both conditions
        expect.soft(output).toContain(testCase.expected);
        expect.soft(output).not.toContain(testCase.attr);
      });
    }
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
