// modern-cmdk — Codemod unified diff for `--dry-run`.
//
// `util.diff` (Node >= 22.15, @experimental in @types/node 26) does the line matching. On the .nvmrc
// Node it prints no ExperimentalWarning, so it is wrapped rather than re-implemented here. The
// operation codes follow the observed behaviour, which tests/unit/codemod-diff.test.ts pins: 1 is a
// line only in the first argument (removed), -1 a line only in the second (added), 0 is shared.

import { diff } from 'node:util';

/** Marks a final line that has no newline; stripped again when the hunk is printed. */
const NO_EOL = '\0';
const CONTEXT = 3;

type Row = readonly [op: ' ' | '-' | '+', text: string];

/** Split on LF or CRLF; a trailing newline adds no empty last line. */
function toLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split(/\r?\n/);
  const last = lines.pop() as string;
  if (last !== '') lines.push(last + NO_EOL);
  return lines;
}

function range(start: number, count: number): string {
  // An empty range names the line before it; a single line omits the count.
  const first = count === 0 ? start - 1 : start;
  return count === 1 ? `${first}` : `${first},${count}`;
}

function printRow([op, text]: Row): string[] {
  return text.endsWith(NO_EOL)
    ? [`${op}${text.slice(0, -1)}`, '\\ No newline at end of file']
    : [`${op}${text}`];
}

/**
 * A unified diff of `before` against `after` for one file: `--- a/<path>`, `+++ b/<path>`, then
 * `@@` hunks with 3 lines of context. Returns '' when the two are equal line for line.
 */
export function unifiedDiff(path: string, before: string, after: string): string {
  const rows: Row[] = diff(toLines(before), toLines(after)).map(([op, text]) => [
    op === 0 ? ' ' : op === 1 ? '-' : '+',
    text,
  ]);
  const changes = rows.flatMap(([op], index) => (op === ' ' ? [] : [index]));
  if (changes.length === 0) return '';

  // Changes closer than twice the context share a hunk.
  const groups: [first: number, last: number][] = [];
  for (const index of changes) {
    const group = groups.at(-1);
    if (group !== undefined && index - group[1] - 1 <= 2 * CONTEXT) group[1] = index;
    else groups.push([index, index]);
  }

  const out = [`--- a/${path}`, `+++ b/${path}`];
  for (const [firstChange, lastChange] of groups) {
    const start = Math.max(0, firstChange - CONTEXT);
    const slice = rows.slice(start, Math.min(rows.length, lastChange + CONTEXT + 1));
    const head = rows.slice(0, start);
    const oldStart = head.filter(([op]) => op !== '+').length + 1;
    const newStart = head.filter(([op]) => op !== '-').length + 1;
    const oldCount = slice.filter(([op]) => op !== '+').length;
    const newCount = slice.filter(([op]) => op !== '-').length;
    out.push(`@@ -${range(oldStart, oldCount)} +${range(newStart, newCount)} @@`);
    out.push(...slice.flatMap(printRow));
  }
  return out.join('\n');
}
