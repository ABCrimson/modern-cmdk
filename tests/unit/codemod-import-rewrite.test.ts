// import-rewrite on exact-output fixtures: tests/fixtures/codemod/import-rewrite/<ROW-id-case>/.
// Every case runs LF and CRLF (both sides through toCrlf); a case whose output differs from its input
// also runs idempotent (the output is a fixed point: names left on a cmdk import stay there and are
// reported again, nothing else moves). A case whose output equals its input is its own fixed point,
// and its LF run checks that.
// Every title starts with its ledger row id.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { API } from 'jscodeshift';
import { describe, expect, it } from 'vitest';
import { parserFor } from '../../packages/modern-cmdk-codemod/src/files.js';
import transform, {
  KNOWN_EXPORTS,
} from '../../packages/modern-cmdk-codemod/src/transforms/import-rewrite.js';
import { applyTransform, listCases, readCase, toCrlf } from './codemod-fixtures.ts';

const ROW_ID = /^(?:IR-\d+|IR-TEST|TUB-\d+)-/;

function run(path: string, source: string): { output: string; reports: string[] } {
  const parser = parserFor(path);
  if (parser === undefined) throw new Error(`no parser for ${path}`);
  return applyTransform(transform, { path, source }, parser);
}

/**
 * The names modern-cmdk/react exports, read from src/react/index.ts with a regex: importing that
 * file would pull in React and the whole adapter, and only its export clauses matter here.
 * Value and `export type` clauses are both counted; `a as b` counts b, `type X` counts X.
 */
function reactExportNames(): { names: Set<string>; source: string } {
  const source = readFileSync(
    join(import.meta.dirname, '..', '..', 'packages', 'modern-cmdk', 'src', 'react', 'index.ts'),
    'utf8',
  ).replace(/\/\/[^\n]*/g, '');
  const names = new Set<string>();
  for (const clause of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s*from/g)) {
    for (const part of (clause[1] ?? '').split(',')) {
      const spec = part.trim().replace(/^type\s+/, '');
      if (spec === '') continue;
      names.add(spec.split(/\s+as\s+/).pop() ?? spec);
    }
  }
  return { names, source };
}

describe('codemod: import-rewrite fixtures', () => {
  const names = listCases('import-rewrite');

  it('IR-TEST: has fixture cases, each named after its row id', () => {
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).toMatch(ROW_ID);
  });

  for (const name of names) {
    const c = readCase('import-rewrite', name);

    it(`${name}: exact output and reports, LF`, () => {
      const result = run(c.inputPath, c.input);
      expect(result.output).toBe(c.output);
      expect(result.reports).toEqual(c.reports);
    });

    it(`${name}: exact output and reports, CRLF`, () => {
      const result = run(c.inputPath, toCrlf(c.input));
      expect(result.output).toBe(toCrlf(c.output));
      expect(result.reports).toEqual(c.reports);
    });

    // A case whose output equals its input is already its own fixed point: the LF test above runs
    // that very source.
    if (c.input !== c.output) {
      it(`${name}: running it on its own output changes nothing`, () => {
        expect(run(c.inputPath, c.output).output).toBe(c.output);
      });
    }
  }
});

describe('codemod: import-rewrite', () => {
  it('IR-TEST: KNOWN_EXPORTS equals the names exported by modern-cmdk/react', () => {
    const { names: fromIndex, source } = reactExportNames();
    // Any export form the clause regex does not parse (export *, export const, a local export { X })
    // would leave KNOWN_EXPORTS stale without failing the comparison below; it fails here instead.
    expect(
      source.replace(/export\s+(?:type\s+)?\{[^}]*\}\s*from\s*['"][^'"]+['"];?/g, ''),
    ).not.toMatch(/\bexport\b/);
    expect(fromIndex.size).toBeGreaterThan(20);
    expect([...KNOWN_EXPORTS].sort()).toEqual([...fromIndex].sort());
  });

  it('IR-1: every name a rewrite writes into a modern-cmdk/react import is in KNOWN_EXPORTS', () => {
    for (const name of listCases('import-rewrite')) {
      const c = readCase('import-rewrite', name);
      for (const clause of c.output.matchAll(
        /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]modern-cmdk\/react['"]/g,
      )) {
        for (const part of (clause[1] ?? '').split(',')) {
          const spec = part.trim().replace(/^type\s+/, '');
          if (spec === '') continue;
          const imported = spec.split(/\s+as\s+/)[0] ?? spec;
          expect(KNOWN_EXPORTS.has(imported), `${name}: ${imported}`).toBe(true);
        }
      }
    }
  });

  it('IR-5: a source with no cmdk in it returns before parsing', () => {
    const source = `import { useState } from 'react';\nexport const n = useState(0);\n`;
    const j = (() => {
      throw new Error('parsed');
    }) as unknown as API['jscodeshift'];
    const api: API = { jscodeshift: j, j, stats: () => {}, report: () => {} };
    expect(transform({ path: 'plain.tsx', source }, api)).toBe(source);
  });

  it('IR-3: a file that names modern-cmdk but not cmdk is parsed and returned byte for byte', () => {
    const source = `import { Command } from 'modern-cmdk/react';\nexport { Command };\n`;
    const result = run('already.tsx', source);
    expect(result.output).toBe(source);
    expect(result.reports).toEqual([]);
  });
});
