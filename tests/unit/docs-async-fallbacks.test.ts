// tests/unit/docs-async-fallbacks.test.ts
// TEB-93: DG-113 and DG-114 (the DG-108 defect shapes) as a docs-truth check, so the bug matrix maps both rows to a real test.
//   DG-113: CommandAsyncItems renders its own <Suspense fallback={fallback}> (src/react/async-items.tsx:58), so an outer
//           <Suspense> whose first element child is <Command.AsyncItems> never shows its own fallback.
//   DG-114: <Command.Loading> returns null unless isLoading is true (src/react/loading.tsx:25-27 takes the loading prop, else
//           state.loading or isPending; the machine sets state.loading true while a LOADING event is pending: src/core/machine.ts:317, sent by <Command.AsyncItems> while its fallback is mounted, src/react/async-items.tsx:47-58), so
//           fallback={<Command.Loading>...</Command.Loading>} without
//           the loading prop renders nothing while pending.
// Scope: every ts, tsx and typescript fence of apps/docs/**/*.md and of the three READMEs the docs-samples gate reads
// (scripts/check-doc-samples.ts DEFAULT_FILES), fragment fences included; the fence regex is that script's (:72).

import { existsSync, globSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root: string = resolve(import.meta.dirname, '../..');
const SKIP_DIRS: ReadonlySet<string> = new Set(['node_modules', 'cache', 'dist', '.git']);
const LANGS: ReadonlySet<string> = new Set(['ts', 'tsx', 'typescript']);
const READMES: readonly string[] = [
  'README.md',
  'packages/modern-cmdk/README.md',
  'packages/create-modern-cmdk/README.md',
];

/** Index of the `>` that closes the opening tag starting at `start`, skipping `{...}` expressions and quoted strings. */
function tagEnd(code: string, start: number): number {
  let depth = 0;
  let quote = '';
  for (let i = start; i < code.length; i++) {
    const ch: string = code[i] ?? '';
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'" || (ch === '`' && depth > 0)) quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) return i;
  }
  return code.length;
}

/** Index just past the `}` that closes the `{` at `open`. */
function braceEnd(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return i + 1;
  }
  return code.length;
}

const lineOf = (code: string, index: number): number => code.slice(0, index).split('\n').length;

/** Offenders of DG-114 (`loading`) and DG-113 (`suspense`) in one code sample, as 1-based lines within the sample. */
function scanAsyncFallbacks(code: string): { loading: number[]; suspense: number[] } {
  const loading: number[] = [];
  const suspense: number[] = [];

  for (const match of code.matchAll(/\bfallback=\{/g)) {
    const open: number = match.index + match[0].length - 1;
    const value: string = code.slice(open, braceEnd(code, open));
    for (const tag of value.matchAll(/<Command\.Loading(?![\w.])/g)) {
      const attrs: string = value.slice(tag.index, tagEnd(value, tag.index));
      if (!/\sloading(?=[\s=/>]|$)/.test(attrs)) loading.push(lineOf(code, open + tag.index));
    }
  }

  for (const match of code.matchAll(/<(?:React\.)?Suspense(?![\w.])/g)) {
    const end: number = tagEnd(code, match.index);
    if (code[end - 1] === '/') continue; // self-closing: no children
    let i: number = end + 1;
    for (;;) {
      const skip = /^(?:\s+|\{\/\*[\s\S]*?\*\/\}|<>)/.exec(code.slice(i));
      if (!skip) break;
      i += skip[0].length;
    }
    if (/^<Command\.AsyncItems(?![\w.])/.test(code.slice(i))) {
      suspense.push(lineOf(code, match.index));
    }
  }
  return { loading, suspense };
}

/** Every ts, tsx or typescript fence of a page, fragment fences included (the gate skips those); fence regex of scripts/check-doc-samples.ts:72. */
function fences(markdown: string): { line: number; code: string }[] {
  const found: { line: number; code: string }[] = [];
  const lines: string[] = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,}|~{3,})\s*(.*)$/.exec(lines[i] ?? '');
    if (!open) continue;
    const indent: string = open[1] ?? '';
    const fence: string = open[2] ?? '```';
    const lang: string = /^[A-Za-z]+/.exec((open[3] ?? '').trim())?.[0] ?? '';
    const body: string[] = [];
    let j: number = i + 1;
    for (; j < lines.length; j++) {
      const text: string = lines[j] ?? '';
      if (text.trim() === fence) break;
      body.push(text.startsWith(indent) ? text.slice(indent.length) : text);
    }
    if (LANGS.has(lang)) found.push({ line: i + 2, code: body.join('\n') });
    i = j;
  }
  return found;
}

function files(): string[] {
  const docs: string[] = globSync('apps/docs/**/*.md', {
    cwd: root,
    exclude: (name: string) => SKIP_DIRS.has(basename(name)),
  }).map((file) => file.replaceAll(String.fromCharCode(92), '/'));
  return [...docs, ...READMES].filter((file) => existsSync(resolve(root, file))).toSorted();
}

function offenders(kind: 'loading' | 'suspense'): string[] {
  const found: string[] = [];
  for (const file of files()) {
    for (const sample of fences(readFileSync(resolve(root, file), 'utf8'))) {
      for (const line of scanAsyncFallbacks(sample.code)[kind]) {
        found.push(`${file}:${sample.line + line - 1}`);
      }
    }
  }
  return found;
}

describe('docs async fallbacks', () => {
  it('scans the docs pages and the three READMEs', () => {
    const list: string[] = files();
    for (const readme of READMES) expect(list).toContain(readme);
    expect(list.some((file) => file.startsWith('apps/docs/'))).toBe(true);
    expect(list.some((file) => file.includes('node_modules'))).toBe(false);
  });

  it('DG-114: every Command.Loading used as a fallback carries the loading prop', () => {
    expect.soft(offenders('loading')).toEqual([]);
  });

  it('DG-113: no Suspense boundary wraps Command.AsyncItems directly', () => {
    expect.soft(offenders('suspense')).toEqual([]);
  });

  it('the scanner flags both DG-108 shapes', () => {
    const suspenseBad = [
      '<Suspense fallback={<p>Loading</p>}>',
      '  <Command.AsyncItems items={p}>{(x) => <Command.Item>{x}</Command.Item>}</Command.AsyncItems>',
      '</Suspense>',
    ].join('\n');
    const loadingBad = [
      '<Command.AsyncItems items={p}',
      '  fallback={<Command.Loading>Loading</Command.Loading>}>',
      '  {() => null}',
      '</Command.AsyncItems>',
    ].join('\n');
    const good = [
      '<Suspense fallback={<p>Loading</p>}>',
      '  <Other />',
      '</Suspense>',
      '<Command.AsyncItems items={p} fallback={<Command.Loading loading>Loading</Command.Loading>}>',
      '  {() => null}',
      '</Command.AsyncItems>',
      '<Command.AsyncItems items={p} fallback={<Command.Loading loading={true}>L</Command.Loading>} />',
    ].join('\n');
    const loadingOutsideFallback = '<Command.Loading>Loading</Command.Loading>';

    expect(scanAsyncFallbacks(suspenseBad)).toEqual({ loading: [], suspense: [1] });
    expect(scanAsyncFallbacks(loadingBad)).toEqual({ loading: [2], suspense: [] });
    expect(scanAsyncFallbacks(good)).toEqual({ loading: [], suspense: [] });
    expect(scanAsyncFallbacks(loadingOutsideFallback)).toEqual({ loading: [], suspense: [] });
    expect(
      scanAsyncFallbacks(suspenseBad.replaceAll('Suspense', 'React.Suspense')).suspense,
    ).toEqual([1]);
    expect(
      fences(['```tsx fragment', loadingBad, '```'].join('\n')).map(
        (f) => scanAsyncFallbacks(f.code).loading,
      ),
    ).toEqual([[2]]);
  });
});
