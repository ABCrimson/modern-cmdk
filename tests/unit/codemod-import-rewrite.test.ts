import type { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';
import { describe, expect, it } from 'vitest';
import transform from '../../packages/modern-cmdk/src/codemod/transforms/import-rewrite.js';

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

const importRewriteCases: readonly {
  readonly label: string;
  readonly input: string;
  readonly contains: string;
}[] = [
  { label: 'named import', input: `import { Command } from 'cmdk';`, contains: '{ Command }' },
  { label: 'default import', input: `import Command from 'cmdk';`, contains: 'import Command' },
  { label: 'namespace import', input: `import * as Cmdk from 'cmdk';`, contains: '* as Cmdk' },
  {
    label: 'named re-export',
    input: `export { Command } from 'cmdk';`,
    contains: 'export { Command }',
  },
  { label: 'star re-export', input: `export * from 'cmdk';`, contains: 'modern-cmdk/react' },
  { label: 'dynamic import', input: `const mod = import('cmdk');`, contains: 'modern-cmdk/react' },
  {
    label: 'require call',
    input: `const Command = require('cmdk');`,
    contains: 'modern-cmdk/react',
  },
];

describe('codemod: import-rewrite', () => {
  // Data-driven rewrite tests
  it.for(importRewriteCases)('rewrites $label from cmdk', ({ input, contains }) => {
    const output = run(input);

    expect.soft(output).toContain('modern-cmdk/react');
    expect.soft(output).toContain(contains);
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

    expect.soft(output).not.toMatch(/from\s+['"]cmdk['"]/);
    expect.soft(output).toMatch(/from\s+['"]react['"]/);
    // Both cmdk imports should be rewritten
    const matches = output.match(/modern-cmdk\/react/g);
    expect(matches).toHaveLength(2);
  });
});
