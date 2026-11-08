// should-filter on exact-output fixtures: tests/fixtures/codemod/should-filter/<ROW-id-case>/.
// Every case runs three ways: LF, CRLF (both sides through toCrlf), and idempotent (the output is
// a fixed point: the filter adapter and the `expr ? undefined : false` form are recognised and left alone).
// Every title starts with its ledger row id.

import { describe, expect, it } from 'vitest';
import { parserFor } from '../../packages/modern-cmdk-codemod/src/files.js';
import transform from '../../packages/modern-cmdk-codemod/src/transforms/should-filter.js';
import { applyTransform, listCases, readCase, toCrlf } from './codemod-fixtures.ts';

const ROW_ID = /^(?:SF-\d+|SF-DOC|SF-TEST|SEC-\d+|G41|TUB-\d+|ARCH-\d+)-/;

function run(path: string, source: string): { output: string; reports: string[] } {
  const parser = parserFor(path);
  if (parser === undefined) throw new Error(`no parser for ${path}`);
  return applyTransform(transform, { path, source }, parser);
}

describe('codemod: should-filter fixtures', () => {
  const names = listCases('should-filter');

  it('has fixture cases, each named after its row id', () => {
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).toMatch(ROW_ID);
  });

  for (const name of names) {
    const c = readCase('should-filter', name);

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

    it(`${name}: running it on its own output changes nothing`, () => {
      const again = run(c.inputPath, c.output);
      expect(again.output).toBe(c.output);
    });
  }

  // The forms the transform header lists as left unchanged (should-filter.ts: filter={x!},
  // filter={x as F}, filter={o?.f}, filter={super.f}). The fixture is the carry recorded in
  // DECISIONS G-41 and G-42 (it is not a SEC-52 clause: that row's remainder is SEC-02).
  it('G-41 carry (should-filter fixture): filter={x!}, {x as F}, {o?.f} and {super.f} are left byte-identical, one computed-value report each', () => {
    const c = readCase('should-filter', 'G41-unadaptable-filter-forms');
    const result = run(c.inputPath, c.input);
    expect(result.output).toBe(c.input);
    expect(result.reports).toHaveLength(4);
    for (const report of result.reports) expect(report).toContain('computed where it stands');
    expect(result.reports.map((r) => /at line (\d+)/.exec(r)?.[1])).toEqual([
      '10',
      '11',
      '12',
      '15',
    ]);
  });
});
