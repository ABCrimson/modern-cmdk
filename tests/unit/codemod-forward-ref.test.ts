// forward-ref: every case directory of tests/fixtures/codemod/forward-ref/ is one input file, its
// exact expected output (diffed byte for byte), and the reports the transform files. A case
// directory is named after the ledger row it closes, so each title starts with its row id.

import { describe, expect, it } from 'vitest';
import { parserFor } from '../../packages/modern-cmdk-codemod/src/files.js';
import transform from '../../packages/modern-cmdk-codemod/src/transforms/forward-ref.js';
import {
  applyTransform,
  listCases,
  readCase,
  type TransformResult,
  toCrlf,
} from './codemod-fixtures.js';

describe('codemod: forward-ref', () => {
  for (const name of listCases('forward-ref')) {
    const fixture = readCase('forward-ref', name);
    const parser = parserFor(fixture.inputPath);
    if (parser === undefined)
      throw new Error(`forward-ref/${name}: no parser for ${fixture.inputPath}`);
    const run = (source: string): TransformResult =>
      applyTransform(transform, { path: fixture.inputPath, source }, parser);

    it(`${name}: output is exactly the expected file`, () => {
      expect(run(fixture.input).output).toBe(fixture.output);
    });

    it(`${name}: files exactly the expected reports`, () => {
      expect(run(fixture.input).reports).toEqual(fixture.reports);
    });

    it(`${name}: a CRLF file keeps its line endings`, () => {
      const result = run(toCrlf(fixture.input));
      expect(result.output).toBe(toCrlf(fixture.output));
      expect(result.reports).toEqual(fixture.reports);
    });

    // A case whose output equals its input is already its own fixed point: the first test above
    // runs that very source.
    if (fixture.input !== fixture.output) {
      it(`${name}: a second run changes nothing`, () => {
        const second = run(fixture.output);
        expect(second.output).toBe(fixture.output);
      });
    }
  }
});
