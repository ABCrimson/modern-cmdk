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

// ES2026 Object.groupBy — organize import rewrite test cases by type
const importTestCases: Partial<
  Record<string, { label: string; input: string; contains: string; type: string }[]>
> = Object.groupBy(
  [
    {
      label: 'named import',
      input: `import { Command } from 'cmdk';`,
      contains: '{ Command }',
      type: 'rewrite',
    },
    {
      label: 'default import',
      input: `import Command from 'cmdk';`,
      contains: 'import Command',
      type: 'rewrite',
    },
    {
      label: 'namespace import',
      input: `import * as Cmdk from 'cmdk';`,
      contains: '* as Cmdk',
      type: 'rewrite',
    },
    {
      label: 'named re-export',
      input: `export { Command } from 'cmdk';`,
      contains: 'export { Command }',
      type: 'rewrite',
    },
    {
      label: 'star re-export',
      input: `export * from 'cmdk';`,
      contains: 'modern-cmdk/react',
      type: 'rewrite',
    },
    {
      label: 'dynamic import',
      input: `const mod = import('cmdk');`,
      contains: 'modern-cmdk/react',
      type: 'rewrite',
    },
    {
      label: 'require call',
      input: `const Command = require('cmdk');`,
      contains: 'modern-cmdk/react',
      type: 'rewrite',
    },
  ],
  (t) => t.type,
);

describe('codemod: import-rewrite', () => {
  // Data-driven rewrite tests using Object.groupBy
  for (const testCase of importTestCases.rewrite ?? []) {
    it(`rewrites ${testCase.label} from cmdk`, () => {
      const output = run(testCase.input);

      expect.soft(output).toContain('modern-cmdk/react');
      expect.soft(output).toContain(testCase.contains);
    });
  }

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
