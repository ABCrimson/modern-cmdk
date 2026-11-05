import type { API, FileInfo } from 'jscodeshift';
import { describe, expect, it } from 'vitest';
import {
  applyStylesheet,
  applyTransform,
  listCases,
  readCase,
  toCrlf,
} from './codemod-fixtures.ts';

const identity = (_file: FileInfo, _api: API): string | null | undefined => undefined;
const reporting = (file: FileInfo, api: API): string => {
  api.report('first report');
  api.report('second report');
  return file.source;
};

describe('codemod fixture harness', () => {
  it('lists the case directories sorted', () => {
    expect(listCases('_harness')).toEqual([
      'a-identity',
      'b-reports',
      'c-no-final-newline',
      'd-reports-default',
      'z-missing-output',
    ]);
  });

  it('reports default to an empty array and come from reports.json when present', () => {
    expect(readCase('_harness', 'a-identity').reports).toEqual([]);
    expect(readCase('_harness', 'b-reports').reports).toEqual(['first report', 'second report']);
  });

  it('reads files untrimmed, keeping an input with no final newline as it is', () => {
    const c = readCase('_harness', 'c-no-final-newline');
    expect(c.input).toBe('const nofinal = 1;');
    expect(c.output).toBe('const nofinal = 1;');
    expect(c.inputPath.endsWith('input.tsx')).toBe(true);
    expect(readCase('_harness', 'a-identity').input.endsWith('\n')).toBe(true);
  });

  it('a missing output file raises an error naming the case', () => {
    expect(() => readCase('_harness', 'z-missing-output')).toThrow(/z-missing-output/);
  });

  it('runs every _harness case byte for byte, LF and CRLF', () => {
    const names = listCases('_harness').filter((n) => n !== 'z-missing-output');
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const c = readCase('_harness', name);
      const run = (source: string): { output: string; reports: string[] } => {
        if (c.inputPath.endsWith('.css')) {
          return applyStylesheet((s, report) => {
            if (name === 'b-reports') {
              report('first report');
              report('second report');
            }
            return s;
          }, source);
        }
        const mod = name === 'b-reports' ? reporting : identity;
        return applyTransform(
          mod,
          { path: c.inputPath, source },
          c.inputPath.endsWith('.tsx') ? 'tsx' : 'ts',
        );
      };
      const lf = run(c.input);
      expect(lf.output, name).toBe(c.output);
      expect(lf.reports, name).toEqual(c.reports);
      const crlf = run(toCrlf(c.input));
      expect(crlf.output, name).toBe(toCrlf(c.output));
      expect(crlf.reports, name).toEqual(c.reports);
    }
  });

  it('applyTransform: an undefined or null return leaves output === source', () => {
    const source = "export const a = 'x';\n";
    expect(applyTransform(identity, { path: 'a.ts', source }, 'ts')).toEqual({
      output: source,
      reports: [],
    });
    const nul = (): null => null;
    expect(applyTransform(nul, { path: 'a.ts', source }, 'tsx').output).toBe(source);
  });

  it('applyTransform: collects api.report messages and passes the parser through', () => {
    const r = applyTransform(reporting, { path: 'a.ts', source: 'x' }, 'babel');
    expect(r).toEqual({ output: 'x', reports: ['first report', 'second report'] });
    const probe = applyTransform(
      (file, api) => String(api.j(file.source).find(api.j.Identifier).length),
      { path: 'a.ts', source: 'let a: number = 1;' },
      'ts',
    );
    expect(probe.output).toBe('1');
  });

  it('applyStylesheet: runs the function and collects reports', () => {
    const r = applyStylesheet((source, report) => {
      report('seen');
      return `${source}!`;
    }, 'a{}');
    expect(r).toEqual({ output: 'a{}!', reports: ['seen'] });
  });

  it('toCrlf turns every LF or CRLF into CRLF and is idempotent', () => {
    expect(toCrlf('a\nb\r\nc')).toBe('a\r\nb\r\nc');
    expect(toCrlf(toCrlf('a\nb\n'))).toBe('a\r\nb\r\n');
    expect(toCrlf('')).toBe('');
  });
});
