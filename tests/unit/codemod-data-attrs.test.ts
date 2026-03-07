import { describe, expect, it } from 'vitest';
import jscodeshift from 'jscodeshift';
import type { API, FileInfo } from 'jscodeshift';
import transform from '../../packages/command-codemod/src/transforms/data-attrs.js';

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

describe('codemod: data-attrs', () => {
  it('renames cmdk-root JSX attr to data-command', () => {
    const input = `const el = <div cmdk-root="" />;`;
    const output = run(input);

    expect(output).toContain('data-command');
    expect(output).not.toContain('cmdk-root');
  });

  it('renames cmdk-item JSX attr to data-command-item', () => {
    const input = `const el = <div cmdk-item="" />;`;
    const output = run(input);

    expect(output).toContain('data-command-item');
    expect(output).not.toContain('cmdk-item');
  });

  it('renames cmdk-input JSX attr to data-command-input', () => {
    const input = `const el = <input cmdk-input="" />;`;
    const output = run(input);

    expect(output).toContain('data-command-input');
    expect(output).not.toContain('cmdk-input');
  });

  it('renames cmdk-list JSX attr to data-command-list', () => {
    const input = `const el = <div cmdk-list="" />;`;
    const output = run(input);

    expect(output).toContain('data-command-list');
    expect(output).not.toContain('cmdk-list');
  });

  it('renames cmdk-group JSX attr to data-command-group', () => {
    const input = `const el = <div cmdk-group="" />;`;
    const output = run(input);

    expect(output).toContain('data-command-group');
    expect(output).not.toContain('cmdk-group');
  });

  it('renames cmdk-separator JSX attr to data-command-separator', () => {
    const input = `const el = <div cmdk-separator="" />;`;
    const output = run(input);

    expect(output).toContain('data-command-separator');
    expect(output).not.toContain('cmdk-separator');
  });

  it('renames cmdk-empty JSX attr to data-command-empty', () => {
    const input = `const el = <div cmdk-empty="" />;`;
    const output = run(input);

    expect(output).toContain('data-command-empty');
    expect(output).not.toContain('cmdk-empty');
  });

  it('renames cmdk-loading JSX attr to data-command-loading', () => {
    const input = `const el = <div cmdk-loading="" />;`;
    const output = run(input);

    expect(output).toContain('data-command-loading');
    expect(output).not.toContain('cmdk-loading');
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

    expect(output).toContain('[data-command]');
    expect(output).toContain('[data-command-list]');
    expect(output).not.toContain('[cmdk-root]');
    expect(output).not.toContain('[cmdk-list]');
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

    expect(output).toContain('data-command');
    expect(output).toContain('data-command-item');
    expect(output).not.toContain('cmdk-root');
    expect(output).not.toContain('cmdk-item');
  });

  it('returns original when no cmdk references exist', () => {
    const input = `const el = <div data-testid="hello" />;`;
    const output = run(input);

    expect(output).toBe(input);
  });
});
