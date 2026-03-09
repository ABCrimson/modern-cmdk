import type { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';
import { describe, expect, it } from 'vitest';
import transform from '../../packages/command-codemod/src/transforms/forward-ref.js';

function createApi(parser: string = 'tsx'): API {
  return {
    jscodeshift: jscodeshift.withParser(parser),
    j: jscodeshift.withParser(parser),
    stats: () => {},
    report: () => {},
  };
}

function run(source: string, parser: string = 'tsx'): string {
  const fileInfo: FileInfo = { path: 'test.tsx', source };
  return transform(fileInfo, createApi(parser));
}

describe('codemod: forward-ref', () => {
  it('removes React.forwardRef with destructured props', () => {
    const input = [
      `import React from 'react';`,
      `const MyComponent = React.forwardRef(({ className }, ref) => {`,
      `  return <div ref={ref} className={className} />;`,
      `});`,
    ].join('\n');
    const output = run(input);

    // Vitest 4.1 — soft assertions: check all output properties
    expect.soft(output).not.toContain('forwardRef');
    expect.soft(output).toContain('ref');
    expect.soft(output).toContain('className');
    // ref should be merged into the destructured props
    expect(output).toMatch(/\{\s*ref\s*,\s*className\s*\}/);
  });

  it('removes bare forwardRef call (not React.forwardRef)', () => {
    const input = [
      `import { forwardRef } from 'react';`,
      `const MyComponent = forwardRef(({ value }, ref) => {`,
      `  return <input ref={ref} value={value} />;`,
      `});`,
    ].join('\n');
    const output = run(input);

    // forwardRef wrapper should be gone
    expect(output).not.toContain('forwardRef(');
    // ref should be merged into destructured props
    expect(output).toMatch(/\{\s*ref\s*,\s*value\s*\}/);
  });

  it('converts identifier props param to destructured with rest', () => {
    const input = [
      `import React from 'react';`,
      `const MyComponent = React.forwardRef((props, ref) => {`,
      `  return <div ref={ref} {...props} />;`,
      `});`,
    ].join('\n');
    const output = run(input);

    expect(output).not.toContain('forwardRef');
    // Should convert (props, ref) -> ({ ref, ...props })
    expect(output).toMatch(/\{\s*ref\s*,\s*\.\.\.props\s*\}/);
  });

  it('cleans up unused forwardRef import specifier', () => {
    const input = [
      `import { forwardRef } from 'react';`,
      `const MyComponent = forwardRef(({ name }, ref) => {`,
      `  return <span ref={ref}>{name}</span>;`,
      `});`,
    ].join('\n');
    const output = run(input);

    // The entire import should be removed since forwardRef was the only specifier
    expect(output).not.toContain(`import { forwardRef }`);
    expect(output).not.toContain('forwardRef');
  });

  it('preserves other imports when removing forwardRef specifier', () => {
    const input = [
      `import { forwardRef, useState } from 'react';`,
      `const MyComponent = forwardRef(({ label }, ref) => {`,
      `  const [value, setValue] = useState('');`,
      `  return <input ref={ref} value={value} />;`,
      `});`,
    ].join('\n');
    const output = run(input);

    // Vitest 4.1 — soft assertions for multi-check validation
    expect.soft(output).not.toContain('forwardRef');
    expect.soft(output).toContain('useState');
    expect.soft(output).toMatch(/from\s+['"]react['"]/);
  });

  it('skips files without forwardRef', () => {
    const input = [`import React from 'react';`, `const MyComponent = () => <div />;`].join('\n');
    const output = run(input);

    expect(output).toBe(input);
  });
});
