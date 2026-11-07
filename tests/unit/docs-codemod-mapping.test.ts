// tests/unit/docs-codemod-mapping.test.ts
// W7-01 (DG-06, DG-14, DG-125, DG-126): the migration guide says what the tested codemod does, and a later change to the
// codemod fails here until the page follows it.
//   1. The guide's attribute table, parsed, equals ATTR_MAP, UNMAPPED_ATTRS and CSS_VAR_MAP of data-attrs.ts. A mapped
//      row's Codemod cell reads 'data-attrs'; an unmapped row's reads 'Manual: <the reason the codemod reports>'.
//   2. Every shell fence that runs a transform runs modern-cmdk-codemod; the deprecated bin is described in prose only.
//   3. Every long flag the page names is in the `--help` text of the codemod CLI.
//   4. The sentences the rows above removed do not return.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it } from 'vitest';
import { run } from '../../packages/modern-cmdk-codemod/src/cli.js';
import {
  ATTR_MAP,
  CSS_VAR_MAP,
  UNMAPPED_ATTRS,
} from '../../packages/modern-cmdk-codemod/src/transforms/data-attrs.js';

const root: string = resolve(import.meta.dirname, '../..');
const page: string = readFileSync(resolve(root, 'apps/docs/guide/migration-from-cmdk.md'), 'utf8');
const TRANSFORMS: readonly string[] = [
  'import-rewrite',
  'data-attrs',
  'forward-ref',
  'should-filter',
];

/** A table cell without its inline-code backticks and escaped pipes, trimmed. */
const plain = (cell: string): string => cell.replaceAll('`', '').replaceAll('\\|', '|').trim();

interface Row {
  readonly cmdk: string;
  readonly modern: string;
  readonly codemod: string;
}

/** Rows of every Markdown table whose first cell names a cmdk attribute (`[cmdk-x]`, `cmdk-x`) or custom property (`--cmdk-x`). */
function attributeRows(): Row[] {
  const rows: Row[] = [];
  for (const line of page.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells: string[] = line
      .slice(1, line.lastIndexOf('|'))
      .split(/(?<!\\)\|/)
      .map(plain);
    const [cmdk, modern, codemod] = cells;
    if (cmdk === undefined || modern === undefined || codemod === undefined) continue;
    if (/^\[?(?:--)?cmdk-[\w-]+\]?$/.test(cmdk)) {
      rows.push({ cmdk: cmdk.replace(/^\[|\]$/g, ''), modern, codemod });
    }
  }
  return rows;
}

/** The CLI's `--help`, as the codemod program prints it. */
async function helpText(): Promise<string> {
  let out = '';
  const collector = new Writable({
    write(chunk: Buffer, _encoding: BufferEncoding, done: () => void): void {
      out += chunk.toString();
      done();
    },
  });
  const code: number = await run(['--help'], { stdout: collector, stderr: collector });
  expect(code).toBe(0);
  return stripVTControlCharacters(out);
}

/** The shell fences (`bash`, `sh`, `shell`, `console`), each with its code-group label and body. */
function shellFences(): { readonly info: string; readonly body: string }[] {
  const fences: { info: string; body: string }[] = [];
  for (const m of page.matchAll(/^```(bash|sh|shell|console)\b([^\n]*)\n([\s\S]*?)^```/gm)) {
    fences.push({ info: `${m[1]}${m[2]}`, body: m[3] as string });
  }
  return fences;
}

describe('migration guide: attribute table', () => {
  const rows: Row[] = attributeRows();

  it('names every cmdk attribute and custom property of data-attrs, and nothing else', () => {
    const expected: string[] = [
      ...ATTR_MAP.keys(),
      ...UNMAPPED_ATTRS.keys(),
      ...CSS_VAR_MAP.keys(),
    ].sort();
    expect(rows.map((r) => r.cmdk).sort()).toEqual(expected);
  });

  it('writes the target ATTR_MAP and CSS_VAR_MAP name for every mapped row, with the Codemod cell data-attrs', () => {
    for (const [from, to] of ATTR_MAP) {
      const row: Row | undefined = rows.find((r) => r.cmdk === from);
      expect(row, `[${from}]`).toBeDefined();
      expect(row?.modern, `[${from}]`).toBe(`[${to}]`);
      expect(row?.codemod, `[${from}]`).toBe('data-attrs');
    }
    for (const [from, to] of CSS_VAR_MAP) {
      const row: Row | undefined = rows.find((r) => r.cmdk === from);
      expect(row, from).toBeDefined();
      expect(row?.modern, from).toBe(to);
      expect(row?.codemod, from).toBe('data-attrs');
    }
  });

  it('gives every UNMAPPED_ATTRS row the Codemod cell Manual: plus the reason the codemod reports', () => {
    for (const [name, reason] of UNMAPPED_ATTRS) {
      const row: Row | undefined = rows.find((r) => r.cmdk === name);
      expect(row, name).toBeDefined();
      expect(row?.codemod, name).toBe(`Manual: ${reason}`);
    }
  });
});

describe('migration guide: commands', () => {
  it('runs every transform in a shell fence through modern-cmdk-codemod', () => {
    const fences = shellFences();
    expect(fences.length).toBeGreaterThan(0);
    let transformLines = 0;
    for (const { info, body } of fences) {
      for (const line of body.split('\n')) {
        if (!TRANSFORMS.some((name) => new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(line)))
          continue;
        transformLines++;
        expect(line, `${info}: ${line}`).toMatch(/\bmodern-cmdk-codemod\b/);
      }
      expect(body, info).not.toMatch(/(?:npx|dlx|pnpm exec)\s+modern-cmdk(?!-codemod)\b/);
    }
    expect(transformLines).toBeGreaterThan(0);
  });

  it('lists the transforms in the order should-filter, forward-ref, data-attrs, import-rewrite', () => {
    const commands: string[] = [];
    for (const { body } of shellFences()) {
      for (const m of body.matchAll(
        /modern-cmdk-codemod\s+(?:--[\w=-]+\s+)*(import-rewrite|data-attrs|forward-ref|should-filter)\b/g,
      )) {
        commands.push(m[1] as string);
      }
    }
    // First appearance of each transform: the dry run and the --force example repeat should-filter and data-attrs.
    expect([...new Set(commands)]).toEqual([
      'should-filter',
      'forward-ref',
      'data-attrs',
      'import-rewrite',
    ]);
  });

  it('names only flags that the codemod --help prints', async () => {
    const help: string = await helpText();
    const flags: Set<string> = new Set(
      [...page.matchAll(/(?<![\w-])--[a-z][a-z-]*/g)]
        .map((m) => m[0])
        // CSS custom properties (--cmdk-list-height, --command-list-height) are not flags.
        .filter((name) => !name.startsWith('--cmdk-') && !name.startsWith('--command-')),
    );
    for (const required of ['--dry-run', '--force', '--strict', '--lenient', '--version']) {
      expect(flags, `the page names ${required}`).toContain(required);
    }
    for (const flag of flags) expect(help, flag).toContain(flag);
  });
});

describe('migration guide: API differences', () => {
  it("DT-17: the API differences table names every cmdk prop modern-cmdk lacks, from defaultValue to the root's div props", () => {
    const table = page.slice(
      page.indexOf('## Complete API Differences'),
      page.indexOf('## New Features Available After Migration'),
    );
    expect(table.length).toBeGreaterThan(0);
    for (const needle of [
      'defaultValue',
      'forceMount',
      'progress',
      'div props',
      'alwaysRender',
      'asChild',
      'onSelect',
      'heading',
      'defaultOpen',
      'modal',
    ]) {
      expect(table, needle).toContain(needle);
    }
  });

  it('DT-17: section 9 says a data-* or aria-* attribute compiles and is dropped rather than claiming tsc rejects every prop', () => {
    const start = page.indexOf('### 9. ');
    const end = page.indexOf('### 10. ');
    expect(start, 'section 9 exists').toBeGreaterThan(-1);
    expect(end, 'section 10 follows').toBeGreaterThan(start);
    const section = page.slice(start, end);
    expect(section).toContain('compiles and is dropped');
    expect(section).not.toContain('rejects with TS2322 (declarations');
  });

  it('DG-137: the guide states that Command.Item onSelect receives no argument in 1.x and names the 2.0 change', () => {
    const headings = [...page.matchAll(/^### (\d+)\. .*$/gm)].map((m) => m[0]);
    const heading = headings.find((h) => h.includes('onSelect'));
    expect(heading, 'a numbered breaking-change heading names onSelect').toBeDefined();
    const start = page.indexOf(heading as string);
    const next = page.indexOf('\n## ', start);
    const section = page.slice(start, next === -1 ? undefined : next);
    expect(section).toContain('() => void');
    expect(section).toContain('2.0');
    const number = /^### (\d+)\./.exec(heading as string)?.[1];
    const table = page.slice(
      page.indexOf('## Complete API Differences'),
      page.indexOf('## New Features Available After Migration'),
    );
    const row = table.split('\n').find((line) => line.includes('onSelect'));
    expect(row, 'the API table has an onSelect row').toBeDefined();
    expect(row).toContain(`Breaking change ${number}`);
  });
});

describe('migration guide: removed claims', () => {
  it('does not say the API works identically, skips CSS, skips group-heading or plans a root fix', () => {
    expect(page).not.toMatch(/works identically/i);
    expect(page).not.toMatch(/skips (?:the )?(?:CSS|`cmdk-group-heading`)/i);
    expect(page).not.toMatch(/does not read `\.css`/i);
    expect(page).not.toMatch(/not covered by the codemod/i);
    expect(page).not.toMatch(/planned fix/i);
    expect(page).not.toMatch(/writes `?\[?data-command\]?`? for/i);
    expect(page).not.toMatch(/`--dry-run` prints no diff/i);
  });
});

describe('deprecated bin paragraphs', () => {
  const paragraphs: Record<string, string> = {
    guide: page,
    'codemod README': readFileSync(resolve(root, 'packages/modern-cmdk-codemod/README.md'), 'utf8'),
    'modern-cmdk README': readFileSync(resolve(root, 'packages/modern-cmdk/README.md'), 'utf8'),
  };

  for (const [name, text] of Object.entries(paragraphs)) {
    it(`DG-135: the ${name} says the deprecated bin follows a symlinked directory that a pattern names and leaves out dot paths`, () => {
      const at: number = text.indexOf("1.4's excludes");
      expect(at, name).toBeGreaterThan(-1);
      const paragraph: string = text.slice(at, text.indexOf('\n', at));
      expect(paragraph).toContain('a pattern names');
      expect(paragraph).toContain('or that a directory argument names');
      expect(paragraph).toContain('start with a dot');
      expect(paragraph).not.toContain('does not follow symlinked directories');
    });
  }
});
