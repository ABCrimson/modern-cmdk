import type { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';
import { describe, expect, it } from 'vitest';
import transform from '../../packages/command-codemod/src/transforms/import-rewrite.js';

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

describe('codemod: import-rewrite', () => {
  it('rewrites named import from cmdk', () => {
    const input = `import { Command } from 'cmdk';`;
    const output = run(input);

    expect(output).toContain('@crimson_dev/command-react');
    expect(output).not.toMatch(/from\s+['"]cmdk['"]/);
    expect(output).toContain('{ Command }');
  });

  it('rewrites default import from cmdk', () => {
    const input = `import Command from 'cmdk';`;
    const output = run(input);

    expect(output).toContain('@crimson_dev/command-react');
    expect(output).not.toMatch(/from\s+['"]cmdk['"]/);
    expect(output).toContain('import Command');
  });

  it('rewrites namespace import from cmdk', () => {
    const input = `import * as Cmdk from 'cmdk';`;
    const output = run(input);

    expect(output).toContain('@crimson_dev/command-react');
    expect(output).not.toMatch(/from\s+['"]cmdk['"]/);
    expect(output).toContain('* as Cmdk');
  });

  it('rewrites named re-export from cmdk', () => {
    const input = `export { Command } from 'cmdk';`;
    const output = run(input);

    expect(output).toContain('@crimson_dev/command-react');
    expect(output).not.toMatch(/from\s+['"]cmdk['"]/);
    expect(output).toContain('export { Command }');
  });

  it('rewrites star re-export from cmdk', () => {
    const input = `export * from 'cmdk';`;
    const output = run(input);

    expect(output).toContain('@crimson_dev/command-react');
    expect(output).not.toMatch(/from\s+['"]cmdk['"]/);
  });

  it('rewrites dynamic import of cmdk', () => {
    const input = `const mod = import('cmdk');`;
    const output = run(input);

    expect(output).toContain('@crimson_dev/command-react');
    expect(output).not.toMatch(/import\(['"]cmdk['"]\)/);
  });

  it('rewrites require call for cmdk', () => {
    const input = `const Command = require('cmdk');`;
    const output = run(input);

    expect(output).toContain('@crimson_dev/command-react');
    expect(output).not.toMatch(/require\(['"]cmdk['"]\)/);
  });

  it('does NOT modify unrelated imports', () => {
    const input = `import React from 'react';\nimport { useState } from 'react';`;
    const output = run(input);

    expect(output).toBe(input);
  });

  it('returns original source when no cmdk imports exist', () => {
    const input = `const x = 42;\nconsole.log(x);`;
    const output = run(input);

    expect(output).toBe(input);
  });

  it('handles multiple cmdk imports in one file', () => {
    const input = [
      `import { Command } from 'cmdk';`,
      `import type { CommandProps } from 'cmdk';`,
      `import React from 'react';`,
    ].join('\n');
    const output = run(input);

    expect(output).not.toMatch(/from\s+['"]cmdk['"]/);
    expect(output).toMatch(/from\s+['"]react['"]/);
    // Both cmdk imports should be rewritten
    const matches = output.match(/@crimson_dev\/command-react/g);
    expect(matches).toHaveLength(2);
  });
});
