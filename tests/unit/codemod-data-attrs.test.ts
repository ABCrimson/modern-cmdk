import { describe, expect, it } from 'vitest';
import { parserFor } from '../../packages/modern-cmdk-codemod/src/files.js';
import transform, {
  ATTR_MAP,
  CSS_VAR_MAP,
  transformStylesheet,
  UNMAPPED_ATTRS,
} from '../../packages/modern-cmdk-codemod/src/transforms/data-attrs.js';
import type { Parser } from './codemod-fixtures.ts';
import {
  applyStylesheet,
  applyTransform,
  listCases,
  readCase,
  toCrlf,
} from './codemod-fixtures.ts';

// Each fixture directory under tests/fixtures/codemod/data-attrs/ is one case. Its title starts
// with the ledger rows it proves (W8-02 cites these titles), so a case without a title fails.
const TITLES: Readonly<Record<string, string>> = {
  '01-root-jsx':
    'DA-1, RC-1, TUB-01, RP-07, DG-05, DA-9, ARCH-10: cmdk-root maps to data-command-root in JSX',
  '02-root-selectors':
    'DA-1, RC-1, TUB-01, RP-07, DG-05: cmdk-root maps to data-command-root in selector strings and querySelector',
  '03-missing-five-jsx':
    'DA-2, RC-21, TUB-02, ARCH-10: cmdk-dialog, cmdk-overlay, cmdk-group-heading, cmdk-group-items and cmdk-list-sizer map in JSX',
  '04-missing-five-selectors':
    'DA-2, RC-21, TUB-02, ARCH-10: the five missing attributes map in selector strings',
  '05-state-selectors':
    'DA-3, ARCH-10: data-selected and data-disabled values become data-active and data-disabled inside a cmdk compound',
  '06-state-bare-reported':
    'DA-3, ARCH-10: a bare or odd-valued state attribute beside a cmdk attribute is reported, not rewritten',
  '07-state-negative':
    'DA-3: a state attribute outside a compound that holds a cmdk attribute stays as it is',
  '08-tailwind-cmdk':
    'DA-3: Tailwind data-[selected=true]: and data-[disabled=true]: become data-active: and data-disabled: on cmdk-bound elements',
  '09-tailwind-modern-react':
    'DA-3: Tailwind variants are rewritten on elements bound to modern-cmdk/react',
  '10-tailwind-unbound':
    'DA-3, TUB-53: Tailwind variants on an element not bound to cmdk stay as they are',
  '11-operator-forms':
    'DA-5: empty, single-quoted, ~= and unquoted attribute selectors are rewritten, operator and value kept',
  '12-name-boundary':
    'DA-5, DA-2: the longest name wins, so cmdk-group never matches inside cmdk-group-heading',
  '13-unmapped': 'DA-10: cmdk-label and cmdk-item-select stay unchanged, one report per site',
  '14-quotes-single': 'DA-7: a single-quoted file stays single-quoted, inner quotes unescaped',
  '15-quotes-double': 'DA-7: a double-quoted file stays double-quoted',
  '16-quotes-jsx-attr':
    'DA-7: a rewritten JSX className keeps its own double quotes in a single-quoted file',
  '17-mention-only':
    'TUB-53: a file that mentions cmdk but has nothing to rename is byte-identical',
  '18-root-jsx-babel':
    'DA-1, DA-2, DA-7: the babel parser (.jsx) renames attributes and keeps quotes',
  '19-css':
    'DA-4, RP-17, SEC-30, DG-06: a .css file has selectors and --cmdk-list-height rewritten, comments and formatting untouched',
  '20-scss':
    'DA-4, RP-17, SEC-30, DG-06: a .scss file with nesting is rewritten, including & state compounds',
  '21-escapes':
    'DA-7: escapes in a rewritten string literal (tab, newline, escaped quote, non-ASCII) survive byte for byte',
  '22-template-split':
    'DA-3, ARCH-10: a compound split by a template placeholder keeps its cmdk attribute for the state rewrite and the report',
  '23-tailwind-state-edges':
    'DA-3: Tailwind presence forms of the state attributes are reported and [&[data-selected=true]_svg] arbitrary variants are rewritten on cmdk-bound elements',
  '24-tailwind-arbitrary-combinators':
    'DA-3: a state attribute after a >, + or ~ inside a [&...] arbitrary variant sits on another element and stays as it is',
  '25-tailwind-prefixed-variants':
    'DA-3: a [&...] arbitrary variant after other variants (hover:, md:, group-hover:) is rewritten on the bound element and left alone on another element',
  '26-tailwind-arbitrary-has':
    'DA-3: inside the :has() of a [&...] arbitrary variant a state attribute sits on another element and stays as it is; one after the :has() is rewritten',
  '27-tailwind-variant-scope':
    'DA-3: a [&...] arbitrary variant after a *: or **: variant, or after an earlier [&...] variant that moves to another element, stays as it is',
  '28-tailwind-arbitrary-is':
    "DA-3: inside the :is(), :not() or :where() of a [&...] arbitrary variant a state attribute before a _, >, + or ~ sits on another element and stays as it is; the argument's subject is rewritten",
  '29-attribute-name-case':
    'DA-11: cmdk attribute names match case-insensitively, as in an HTML document: [CMDK-ITEM], [DATA-SELECTED] and a CMDK-ROOT JSX attribute are rewritten, CMDK-LABEL is reported',
  '30-tailwind-group-peer':
    "DA-12: group-, peer- and in- data variants style a bound element by another element's state and are reported, not rewritten; the element's own data-[selected=true]: still is",
};

const cases = listCases('data-attrs');

function runCase(name: string, source: string): { output: string; reports: string[] } {
  const { inputPath } = readCase('data-attrs', name);
  const parser = parserFor(inputPath);
  if (parser === undefined) return applyStylesheet(transformStylesheet, source);
  return applyTransform(transform, { path: inputPath, source }, parser as Parser);
}

describe('codemod: data-attrs', () => {
  it('DA-TEST, DG-64: every fixture case has a title and every title has a case', () => {
    expect(cases.length).toBeGreaterThan(0);
    expect([...cases].sort()).toEqual(Object.keys(TITLES).sort());
  });

  for (const name of cases) {
    const title = TITLES[name] ?? name;

    it(`${title}`, () => {
      const c = readCase('data-attrs', name);
      const result = runCase(name, c.input);
      expect(result.output).toBe(c.output);
      expect(result.reports).toEqual(c.reports);
    });

    it(`${title} (CRLF)`, () => {
      const c = readCase('data-attrs', name);
      const result = runCase(name, toCrlf(c.input));
      expect(result.output).toBe(toCrlf(c.output));
      expect(result.reports).toEqual(c.reports);
    });
  }

  it('DA-TEST, DG-64: the quick bail returns a source with no cmdk reference as it is', () => {
    const input = `const el = <div data-testid="hello" />;\n`;
    const result = applyTransform(transform, { path: 'a.tsx', source: input }, 'tsx');
    expect(result).toEqual({ output: input, reports: [] });
  });

  it('DA-1, DA-2, DA-10, DG-05: the exported maps carry the attributes modern-cmdk renders', () => {
    expect(Object.fromEntries(ATTR_MAP)).toEqual({
      'cmdk-root': 'data-command-root',
      'cmdk-dialog': 'data-command-dialog',
      'cmdk-overlay': 'data-command-overlay',
      'cmdk-input': 'data-command-input',
      'cmdk-list': 'data-command-list',
      'cmdk-list-sizer': 'data-command-list-inner',
      'cmdk-item': 'data-command-item',
      'cmdk-group': 'data-command-group',
      'cmdk-group-heading': 'data-command-group-heading',
      'cmdk-group-items': 'data-command-group-items',
      'cmdk-separator': 'data-command-separator',
      'cmdk-empty': 'data-command-empty',
      'cmdk-loading': 'data-command-loading',
    });
    expect(Object.fromEntries(CSS_VAR_MAP)).toEqual({
      '--cmdk-list-height': '--command-list-height',
    });
    expect([...UNMAPPED_ATTRS.keys()].sort()).toEqual(['cmdk-item-select', 'cmdk-label']);
    for (const reason of UNMAPPED_ATTRS.values()) expect(reason.length).toBeGreaterThan(0);
  });
});
