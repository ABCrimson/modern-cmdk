// tests/unit/docs-1-7-0-claims.test.ts
// The docs rows of 1.7.0 that the BUG-to-test matrix (tests/unit/bug-matrix.test.ts) maps to a test
// title, and the rows of the cluster whose pages and source comments are content-tested here. Each
// `it` guards the row's code anchors (a sample's structure, a token, a source pattern) and the
// absence of the row's false claim (a negative family of phrasings). A test that holds a code anchor
// asserts no positive English: a rewording that keeps the claim true stays green, and silence
// passes by design. A test whose object is prose with no code anchor (RA-26, RA-28, RA-85) may
// assert a phrase. The pages are read as Markdown and the source comments as text: no build is
// needed. Row claims live in docs/ledger/findings.json.
//   Samples (a promise held outside render, an `id` on each loaded Command.Item, 'use client', the
//     engine's owner)
//     DAE-08  api/command-react.md        AsyncItems sample
//     DAE-13, DAE-58, NAR-async-5  examples/async-search.md
//     DAE-60  examples/frecency.md        DAE-64  examples/virtualized.md      RC-15
//       examples/vanilla.md
//     DAE-65, NAR-aichat-3  recipes/ai-chat-commands.md   DAE-66, NAR-emoji-4
//       recipes/emoji-picker.md
//     DAE-67, NAR-file-3  recipes/file-picker.md   DAE-68  recipes/nested-commands.md
//     DAE-69, NAR-spotlight-5  recipes/spotlight-search.md
//     DG-22, DG-23, DG-24, DG-74, DG-75, DT-54, DGX-ASYNC-8  guide/async-items.md
//     DGX-SSR-7, ARCH-47  guide/ssr.md    DG-21  guide/controlled-dialog.md
//   Reference pages
//     DAE-37, DAE-38, DAE-41, DAE-42  api/command-react.md (Group priority, Dialog open, data
//       attributes, tokens)
//     DAE-33, SEC-47, RA-84, CE-92  api/command.md (the telemetry sections, the events table);
//       RA-84 guide/architecture.md
//     RM-12, RM-13, CE-92  packages/modern-cmdk/README.md; CE-92  ARCHITECTURE.md and
//       CONTRIBUTING.md
//   Source comments
//     RA-26 activity.tsx   RA-28 shortcut.tsx   RA-29 page.tsx   RA-30 dialog.tsx   RA-70
//       dialog.tsx and command.tsx   RA-85 dialog.tsx (the open and onOpenChange JSDoc)
//     RA-86 activity.tsx (the CommandActivity JSDoc) and api/command-react.md (Command.Activity)
//     CE-125 core/types.ts (the CommandGroup JSDoc)
//   Delta table
//     guide/migration-from-cmdk.md renders every row of tests/unit/cmdk-parity-delta.json (not a
//       ledger row)

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root: string = resolve(import.meta.dirname, '../..');
const DOCS = 'apps/docs/';
const SRC_REACT = 'packages/modern-cmdk/src/react/';
const CODE_LANGS: ReadonlySet<string> = new Set([
  'ts',
  'tsx',
  'typescript',
  'js',
  'jsx',
  'javascript',
]);

interface Fence {
  /** 1-based line of the first line of the body in the file. */
  readonly line: number;
  readonly lang: string;
  readonly code: string;
}

const read = (file: string): string => readFileSync(resolve(root, file), 'utf8');

/** Every fenced block of a page (the fence regex of tests/unit/docs-async-fallbacks.test.ts). */
function fences(markdown: string): Fence[] {
  const found: Fence[] = [];
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
    found.push({ line: i + 2, lang, code: body.join('\n') });
    i = j;
  }
  return found;
}

/** The script fences of a page; the language is the first word of the info string, any case. */
const codeFences = (markdown: string): Fence[] =>
  fences(markdown).filter((f) => CODE_LANGS.has(f.lang.toLowerCase()));

/** The text under the heading matching `heading`, up to the next heading of the same or a higher level; headings inside fences do not count. */
function section(markdown: string, heading: RegExp): string {
  const lines: string[] = markdown.split(/\r?\n/);
  let level = 0;
  let inFence = false;
  const body: string[] = [];
  for (const text of lines) {
    if (/^\s*(?:`{3,}|~{3,})/.test(text)) inFence = !inFence;
    const h = inFence ? null : /^(#{1,6})\s+(.*)$/.exec(text);
    if (level === 0) {
      if (h && heading.test(h[2] ?? '')) level = (h[1] ?? '').length;
      continue;
    }
    if (h && (h[1] ?? '').length <= level) break;
    body.push(text);
  }
  return body.join('\n');
}

/** The section that `heading` opens; the heading must exist (an empty body is not a pass). */
function sectionOf(file: string, heading: RegExp): string {
  const body: string = section(read(file), heading);
  expect(body.trim(), `${file}: a section headed ${String(heading)}`).not.toBe('');
  return body;
}

/** The script fences of `text` (a page or one of its sections). */
const scriptFences = (text: string): Fence[] => codeFences(text);

/** The first script fence of `text` in which every predicate holds. */
function fenceWith(text: string, label: string, ...needles: readonly (string | RegExp)[]): Fence {
  const hit: Fence | undefined = scriptFences(text).find((f) =>
    needles.every((needle) =>
      typeof needle === 'string' ? f.code.includes(needle) : needle.test(f.code),
    ),
  );
  expect(
    hit,
    `${label}: expected a script sample matching ${needles.map(String).join(' and ')}`,
  ).toBeDefined();
  return hit as Fence;
}

/** The opening tags of every `<Command.Item` in a sample (`=>` inside an attribute does not end a tag). */
const itemTags = (code: string): string[] => code.match(/<Command\.Item\b(?:=>|[^>])*>/g) ?? [];

/** The opening tags of the Items that carry no `id` prop (`forceId` and `data-id` are not it). */
const itemsWithoutId = (code: string): string[] =>
  itemTags(code).filter((tag) => !/\sid=(?:\{|")/.test(tag));

/** Every `<Command.AsyncItems ...>...</Command.AsyncItems>` element of a sample. */
const asyncBlocks = (code: string): string[] =>
  code.match(/<Command\.AsyncItems\b[\s\S]*?<\/Command\.AsyncItems>/g) ?? [];

/** The expression of the `items={...}` prop of an AsyncItems element. */
const itemsExpr = (block: string): string => /\bitems=\{([^{}]*)\}/.exec(block)?.[1]?.trim() ?? '';

/** The comment lines that open a source file, before its first statement. */
function header(file: string): string {
  const lines: string[] = [];
  for (const text of read(file).split(/\r?\n/)) {
    if (!text.startsWith('//')) break;
    lines.push(text);
  }
  return lines.join('\n');
}

/** The JSDoc block that ends right above the first line of `file` matching `anchor`, on one line. */
function jsdocAbove(file: string, anchor: RegExp): string {
  const lines: string[] = read(file).split(/\r?\n/);
  const at: number = lines.findIndex((l) => anchor.test(l));
  expect(at, `${file}: a line matching ${String(anchor)}`).toBeGreaterThan(-1);
  const block: string[] = [];
  for (let i = at - 1; i >= 0; i--) {
    const text: string = (lines[i] ?? '').trim();
    if (!text.startsWith('*') && !text.startsWith('/**')) break;
    block.unshift(text.replace(/^\/\*\*\s?|\*\/\s*$/g, '').replace(/^\*\s?/, ''));
    if (text.startsWith('/**')) break;
  }
  const doc: string = block.join(' ').replace(/\s+/g, ' ').trim();
  expect(doc, `${file}: a JSDoc block above ${String(anchor)}`).not.toBe('');
  return doc;
}

/** A module whose first statement is the directive (comment lines may precede it). */
const isClientModule = (code: string): boolean => /^(?:\/\/[^\n]*\n)*'use client';/.test(code);

/** The table row of `page` whose first cell is `cell`. */
function tableRow(text: string, cell: RegExp): string {
  const row: string | undefined = text.split(/\r?\n/).find((l) => cell.test(l));
  expect(row, `a table row matching ${String(cell)}`).toBeDefined();
  return row as string;
}

/** The sentences of `text`, split after `.`, `;`, `!` or `?` and at line breaks. */
const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.;!?])\s+|\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s !== '');

/** The sentences of `text` that match `topic` but carry no negation (a claim, not a denial). */
const claimsOf = (text: string, topic: RegExp): string[] =>
  sentences(text).filter(
    (s) => topic.test(s) && !/\b(?:no|not|never|without|neither|nor|none)\b|n't\b/i.test(s),
  );

/** Every `.ts` and `.tsx` source file under the React adapter (its hooks directory included). */
const reactSources = (): string[] =>
  readdirSync(resolve(root, SRC_REACT), { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => read(`${SRC_REACT}${name.replaceAll('\\', '/')}`));

/**
 * Every Item of every AsyncItems element in `fs` passes `id`, and no AsyncItems `items` prop
 * is a call (a promise created during render suspends again on every render).
 */
function expectLoadedItemsHaveIds(fs: readonly Fence[], label: string): void {
  const blocks: string[] = fs.flatMap((f) => asyncBlocks(f.code));
  expect(blocks.length, `${label}: the page has AsyncItems samples`).toBeGreaterThan(0);
  for (const block of blocks) {
    expect(itemTags(block).length, `${label}: an AsyncItems sample renders Items`).toBeGreaterThan(
      0,
    );
    expect(itemsWithoutId(block), `${label}: every loaded Command.Item passes id`).toEqual([]);
  }
}

function expectNoPromiseInJsx(fs: readonly Fence[], label: string): void {
  const blocks: string[] = fs.flatMap((f) => asyncBlocks(f.code));
  expect(blocks.length, `${label}: the page has AsyncItems samples`).toBeGreaterThan(0);
  for (const block of blocks) {
    expect(itemsExpr(block), `${label}: items is a held promise, not a call`).toMatch(/^[\w.]+$/);
  }
}

describe('docs rows of 1.7.0', () => {
  it('DAE-08: api/command-react.md AsyncItems sample holds its promise outside render and passes each Command.Item its id', () => {
    // apps/docs/api/command-react.md `<Command.AsyncItems>`: `const itemsPromise = fetchItems();`
    // at module scope, `items={itemsPromise}`.
    const body: string = sectionOf(`${DOCS}api/command-react.md`, /^`<Command\.AsyncItems>`$/);
    const sample: Fence = fenceWith(body, 'DAE-08', '<Command.AsyncItems');
    expectNoPromiseInJsx([sample], 'DAE-08');
    const name: string = itemsExpr(asyncBlocks(sample.code)[0] ?? '');
    expect(sample.code, 'DAE-08: the promise is created at module scope').toMatch(
      new RegExp(`^const ${name} = `, 'm'),
    );
    expectLoadedItemsHaveIds([sample], 'DAE-08');
  });

  it('DAE-13: examples/async-search.md gives each loaded Command.Item its id', () => {
    const samples: Fence[] = codeFences(read(`${DOCS}examples/async-search.md`));
    expect(samples.length, 'DAE-13: the page has script samples').toBeGreaterThan(0);
    expectLoadedItemsHaveIds(samples, 'DAE-13');
  });

  it('DAE-58: examples/async-search.md Multiple Async Sources passes ids and holds both promises outside render', () => {
    const body: string = sectionOf(`${DOCS}examples/async-search.md`, /^Multiple Async Sources$/);
    const sample: Fence = fenceWith(body, 'DAE-58', '<Command.AsyncItems');
    const blocks: string[] = asyncBlocks(sample.code);
    expect(blocks.length, 'DAE-58: two sources').toBeGreaterThanOrEqual(2);
    expectLoadedItemsHaveIds([sample], 'DAE-58');
    for (const block of blocks) {
      const name: string = itemsExpr(block);
      expect(name, 'DAE-58: items is a bare name').toMatch(/^\w+$/);
      expect(sample.code, `DAE-58: ${name} is declared at module scope`).toMatch(
        new RegExp(`^(?:declare )?const ${name}\\b`, 'm'),
      );
    }
  });

  it('DAE-60: examples/frecency.md keys persisted frecency by stable item ids', () => {
    // Persisted frecency is keyed by the selected item's id; an Item without `id` gets a useId() id
    // that depends on tree position.
    const body: string = sectionOf(`${DOCS}examples/frecency.md`, /^IndexedDB Persistence$/);
    const sample: Fence = fenceWith(body, 'DAE-60', /frecency=\{\{/, '<Command.Item');
    const tags: string[] = itemTags(sample.code);
    expect(tags.length, 'DAE-60: the sample renders Items').toBeGreaterThan(1);
    expect(itemsWithoutId(sample.code), 'DAE-60: every persisted item passes a stable id').toEqual(
      [],
    );
    const ids: string[] = tags.map((tag) => /\sid="([^"]+)"/.exec(tag)?.[1] ?? '');
    expect(
      ids.every((id) => id !== ''),
      'DAE-60: the ids are string literals',
    ).toBe(true);
    expect(new Set(ids).size, 'DAE-60: the ids are distinct').toBe(ids.length);
  });

  it('DAE-64: examples/virtualized.md disposes the engine once, as its owner', () => {
    // The component that creates the engine disposes it in its effect cleanup; the machine disposes
    // only an engine it created, so the engine is passed as `searchEngine` and never as `search`.
    const page: string = read(`${DOCS}examples/virtualized.md`);
    const body: string = sectionOf(`${DOCS}examples/virtualized.md`, /^Supplying a Search Engine$/);
    const sample: Fence = fenceWith(body, 'DAE-64', 'createWasmSearchEngine(');
    expect(sample.code, 'DAE-64: the engine reaches the machine as searchEngine').toMatch(
      /\bsearchEngine=\{engine\}/,
    );
    expect(sample.code, 'DAE-64: not as search').not.toMatch(/\bsearch=\{/);
    const effectAt: number = sample.code.indexOf('useEffect(');
    expect(effectAt, 'DAE-64: the engine is created in an effect').toBeGreaterThan(-1);
    const disposeAt: number[] = [
      ...sample.code.matchAll(/\[Symbol\.(?:async)?[dD]ispose\]\(\)/g),
    ].map((m) => m.index);
    expect(disposeAt.length, 'DAE-64: the creator disposes the engine').toBeGreaterThan(0);
    expect(
      disposeAt.every((at) => at > effectAt),
      'DAE-64: every dispose call sits inside the creating effect',
    ).toBe(true);
    expect(page, 'DAE-64: no untyped useState(null) engine').not.toMatch(/useState\(null\)/);
    // The false claim: the machine disposes an engine it was given. The sample's anchors above pin
    // the owner (the creating effect disposes) and the prop (`searchEngine`, never `search`).
    expect(body, 'DAE-64: the machine is not said to dispose an engine it was given').not.toMatch(
      /machine (?:also )?disposes (?:the|an|that|your) (?:search )?engine (?:you|that you|it was|passed|supplied)|disposes the engine you pass/i,
    );
  });

  it('DAE-65: recipes/ai-chat-commands.md filters its slash commands', () => {
    // `filter={false}` turns the built-in filtering off, so the typed text would filter nothing.
    const fs: Fence[] = codeFences(read(`${DOCS}recipes/ai-chat-commands.md`));
    const palette: Fence = fenceWith(
      read(`${DOCS}recipes/ai-chat-commands.md`),
      'DAE-65',
      '<Command ',
    );
    expect(palette.code, 'DAE-65: the palette keeps its built-in filtering').not.toMatch(
      /\bfilter=\{/,
    );
    for (const f of fs) {
      expect(f.code, `DAE-65: no fence disables filtering (line ${f.line})`).not.toMatch(
        /\bfilter=\{false\}/,
      );
    }
    expect(palette.code, 'DAE-65: each command is an Item with a value').toMatch(
      /<Command\.Item\b/,
    );
  });

  it('DAE-66: recipes/emoji-picker.md creates its engine per mount', () => {
    const page: string = read(`${DOCS}recipes/emoji-picker.md`);
    const sample: Fence = fenceWith(page, 'DAE-66', 'createWasmSearchEngine(', 'searchEngine=');
    expect(sample.code, 'DAE-66: no module-scope engine').not.toMatch(
      /^(?:(?:const|let|var)\s[^\n]*|await\s)createWasmSearchEngine\(/m,
    );
    expect(sample.code, 'DAE-66: no top-level await').not.toMatch(
      /^[^\s/][^\n]*\bawait createWasmSearchEngine/m,
    );
    const effectAt: number = sample.code.indexOf('useEffect(');
    expect(effectAt, 'DAE-66: the engine is created in an effect').toBeGreaterThan(-1);
    expect(
      sample.code.indexOf('createWasmSearchEngine('),
      'DAE-66: the call is inside the effect',
    ).toBeGreaterThan(effectAt);
    expect(sample.code, 'DAE-66: the engine reaches the machine as searchEngine').toMatch(
      /\bsearchEngine=\{engine\}/,
    );
    expect(sample.code, 'DAE-66: not as search').not.toMatch(/\bsearch=\{/);
    const cleanupAt: number = sample.code.indexOf('return () =>', effectAt);
    expect(cleanupAt, 'DAE-66: the effect has a cleanup').toBeGreaterThan(-1);
    expect(
      sample.code.indexOf('[Symbol.dispose]()', cleanupAt),
      'DAE-66: the cleanup disposes the engine its component created',
    ).toBeGreaterThan(cleanupAt);
  });

  it('DAE-67: recipes/file-picker.md gives each file one stable id', () => {
    const page: string = read(`${DOCS}recipes/file-picker.md`);
    const sample: Fence = fenceWith(page, 'DAE-67', 'function FilePicker');
    expect(itemTags(sample.code).length, 'DAE-67: each file renders one Item').toBe(1);
    expect(sample.code, 'DAE-67: the Item registers under the file path').toMatch(
      /<Command\.Item\b(?:=>|[^>])*\sid=\{file\.path\}/,
    );
    expect(sample.code, 'DAE-67: no second list of the recent files').not.toMatch(
      /\.filter\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.recent/,
    );
    const frecency: Fence = fenceWith(page, 'DAE-67', 'IdbFrecencyStorage');
    expect(frecency.code, 'DAE-67: the storage is created once, at module scope').toMatch(
      /^const storage = new IdbFrecencyStorage\(/m,
    );
  });

  it('DAE-68: recipes/nested-commands.md renders root links inside the root page and pages inside the list', () => {
    const sample: Fence = fenceWith(
      read(`${DOCS}recipes/nested-commands.md`),
      'DAE-68',
      '<Command.Page',
      '<Command.List>',
    );
    const code: string = sample.code;
    const listOpen: number = code.indexOf('<Command.List>');
    const listClose: number = code.indexOf('</Command.List>');
    expect(listClose, 'DAE-68: the list closes').toBeGreaterThan(listOpen);
    const pages: number[] = [...code.matchAll(/<Command\.Page\b/g)].map((m) => m.index);
    expect(pages.length, 'DAE-68: the sample has pages').toBeGreaterThan(1);
    for (const at of pages) {
      expect(
        at > listOpen && at < listClose,
        'DAE-68: every Command.Page is inside Command.List',
      ).toBe(true);
    }
    const root: RegExpExecArray | null =
      /<Command\.Page id="root">([\s\S]*?)<\/Command\.Page>/.exec(code);
    expect(root, 'DAE-68: a root page').not.toBeNull();
    const links: number[] = [...code.matchAll(/<PageLink\b/g)]
      .map((m) => m.index)
      .filter((at) => at > listOpen);
    expect(links.length, 'DAE-68: the root links render').toBeGreaterThan(0);
    const rootStart: number = root?.index ?? 0;
    const rootEnd: number = rootStart + (root?.[0].length ?? 0);
    for (const at of links) {
      expect(
        at > rootStart && at < rootEnd,
        'DAE-68: every PageLink sits inside the root page',
      ).toBe(true);
    }
  });

  it('DAE-69: recipes/spotlight-search.md holds its promise outside render and passes ids', () => {
    const fs: Fence[] = codeFences(read(`${DOCS}recipes/spotlight-search.md`));
    expectNoPromiseInJsx(fs, 'DAE-69');
    expectLoadedItemsHaveIds(fs, 'DAE-69');
    const sample: Fence = fenceWith(
      read(`${DOCS}recipes/spotlight-search.md`),
      'DAE-69',
      '<Command.AsyncItems',
    );
    const name: string = itemsExpr(asyncBlocks(sample.code)[0] ?? '');
    expect(sample.code, 'DAE-69: the promise is built by useMemo, not in the JSX').toMatch(
      new RegExp(`const ${name} = useMemo\\(`),
    );
    // A memo whose dependencies change on every render (`[Math.random()]`) builds a new promise
    // each time and suspends again: the promise is made once per mount, so the list is empty.
    const statement: string = sample.code.slice(sample.code.indexOf(`const ${name} = useMemo(`));
    const deps: string | undefined = /,\s*(\[[^\]]*\])\s*\)\s*;/.exec(statement)?.[1];
    expect(deps?.replace(/\s+/g, ''), 'DAE-69: the useMemo dependency list is []').toBe('[]');
  });

  it('DG-22: guide/async-items.md creates no AsyncItems promise during render', () => {
    const fs: Fence[] = codeFences(read(`${DOCS}guide/async-items.md`));
    expectNoPromiseInJsx(fs, 'DG-22');
    expect(
      fs.flatMap((f) => asyncBlocks(f.code)).length,
      'DG-22: the page has several AsyncItems samples',
    ).toBeGreaterThan(3);
    for (const f of fs) {
      expect(f.code, `DG-22: no fetch call in the JSX (line ${f.line})`).not.toMatch(
        /items=\{\s*[\w.]+\(/,
      );
    }
  });

  it('DG-23: guide/async-items.md gives each loaded Command.Item its id', () => {
    expectLoadedItemsHaveIds(codeFences(read(`${DOCS}guide/async-items.md`)), 'DG-23');
    const registration: string = sectionOf(`${DOCS}guide/async-items.md`, /^Registration$/);
    expect(registration, 'DG-23: the Registration section passes the id').toContain('id={item.id}');
  });

  it('RC-15: apps/docs/examples/vanilla.md keeps the machine with const, not a module-level using', () => {
    // A top-level `using machine` disposes the machine when the module finishes evaluating, before
    // the first keystroke.
    const sample: Fence = fenceWith(
      read(`${DOCS}examples/vanilla.md`),
      'RC-15',
      'createCommandMachine(',
    );
    expect(sample.code, 'RC-15: the machine is a const').toMatch(
      /^const machine = createCommandMachine\(/m,
    );
    expect(sample.code, 'RC-15: no module-level using').not.toMatch(/^(?:await )?using\s/m);
    expect(sample.code, 'RC-15: the page disposes the machine when it hides for good').toMatch(
      /machine\[Symbol\.dispose\]\(\)/,
    );
  });

  it('RM-12: packages/modern-cmdk/README.md claims no React Compiler support and no useTransition', () => {
    const readme: string = read('packages/modern-cmdk/README.md');
    // A sentence that names React Compiler or useTransition without a negation is a claim of
    // support or of use; "with no `useTransition`" is a true statement and stays allowed.
    expect(claimsOf(readme, /React Compiler/i), 'RM-12: no React Compiler claim').toEqual([]);
    expect(claimsOf(readme, /\buseTransition\b/), 'RM-12: no useTransition claim').toEqual([]);
    expect(readme, 'RM-12: the adapter is built on useSyncExternalStore').toContain(
      'useSyncExternalStore',
    );
    // The code anchor: no module of the React adapter calls either.
    for (const source of reactSources()) {
      expect(source, 'RM-12: the adapter source uses no useTransition').not.toMatch(
        /\buseTransition\(/,
      );
    }
    expect(
      reactSources().some((source) => /\buseSyncExternalStore\(/.test(source)),
      'RM-12: the adapter source calls useSyncExternalStore',
    ).toBe(true);
  });

  it('RM-13: packages/modern-cmdk/README.md documents Command.Activity', () => {
    const readme: string = read('packages/modern-cmdk/README.md');
    expect(readme, 'RM-13: the README names Command.Activity').toContain('Command.Activity');
    expect(readme, 'RM-13: it wraps React’s Activity').toMatch(/<Activity>/);
  });

  it('DAE-37: api/command-react.md Group priority orders groupedIds and leaves the render order to the JSX', () => {
    const group: string = sectionOf(`${DOCS}api/command-react.md`, /^`<Command\.Group>`$/);
    const row: string = tableRow(group, /^\| `priority` \|/);
    expect(row, 'DAE-37: the number orders the keys of groupedIds').toContain('groupedIds');
    expect(row, 'DAE-37: the search order of filteredIds is kept').toContain('`filteredIds`');
    // The false claim: React renders the groups in the order of the number (it renders them in JSX
    // order). The anchors above pin the two orders the row names, the keys of `groupedIds` and the
    // search order of `filteredIds`.
    expect(row, 'DAE-37: no claim that React sorts the groups by the number').not.toMatch(
      /\b(?:sort\w*|order\w*|render\w*|arrang\w*)\s+(?:the\s+)?(?:groups\s+)?by\s+(?:this\s+number|`?priority`?)|\b(?:in|by)\s+(?:`?priority`?|numeric|number)\s+order\b|\bpriority order\b/i,
    );
  });

  it('CE-125: core/types.ts CommandGroup JSDoc says priority orders groupedIds and getGroups, not the React render order', () => {
    // `priority` orders the keys of `CommandState.groupedIds` (core/machine.ts, the refilter) and
    // `getGroups()` (core/registry.ts); the React adapter renders `<Command.Group>` elements in JSX
    // order. The JSDoc of the interface and of its `priority` member is the hover text of the type.
    const file = 'packages/modern-cmdk/src/core/types.ts';
    const doc: string = `${jsdocAbove(file, /^export interface CommandGroup\b/)} ${jsdocAbove(file, /^\s*readonly priority\?:/)}`;
    expect(doc, 'CE-125: the JSDoc names groupedIds').toContain('groupedIds');
    expect(doc, 'CE-125: the JSDoc names getGroups').toContain('getGroups');
    // A sentence that says the groups are rendered, displayed, shown, listed or arranged by
    // priority (or that lower values appear first) is the false claim, even when it names JSX or
    // the data. A sentence that says the groups are sorted or ordered by priority is the false
    // claim unless it names the data the number does order (groupedIds, getGroups).
    const shown =
      /\b(?:render\w*|display\w*|show\w*|shown|list\w*|arrang\w*|appear\w*)\b(?:(?!\b(?:not|never|regardless|rather|instead|independent\w*)\b)[^.;])*?\b(?:by|in|with|on)\s+(?:(?:ascending|descending|numeric)\s+)?(?:`?priority`?|numeric order|priority order)\b|\blower (?:values?|numbers?|priorit\w*)\b[^.;]*\b(?:appear\w*|render\w*|show\w*|display\w*|on top)\b/i;
    const sorted =
      /\b(?:sort\w*|order\w*)\b(?:(?!\b(?:not|never|regardless|rather|instead|independent\w*)\b)[^.;])*?\bby\s+(?:(?:ascending|descending)\s+)?`?priority`?|\bpriority order\b|\blower (?:values?|numbers?)\b[^.;]*\bfirst\b/i;
    const dataNamed = /\bgroupedIds\b|\bgetGroups\b/;
    expect(
      sentences(doc).filter((s) => shown.test(s) || (sorted.test(s) && !dataNamed.test(s))),
      'CE-125: no sentence says the groups are rendered or displayed in priority order',
    ).toEqual([]);
  });

  it('DAE-85: api/command.md getGroups() row says groups are sorted by priority, not in insertion order', () => {
    // The code anchor: getGroups() sorts the registered groups with toSorted by `priority`
    // (core/registry.ts), while getItems() returns the items Map in insertion order. The false
    // claim: the groups come back in insertion (registration) order.
    const registry: string = sectionOf(`${DOCS}api/command.md`, /^`CommandRegistry`$/);
    const row: string = tableRow(registry, /^\| `getItems\(\)` \/ `getGroups\(\)` \|/);
    expect(row, 'DAE-85: the row names the priority that orders the groups').toContain(
      '`priority`',
    );
    const description: string = row.split('|')[3] ?? '';
    const clauses: string[] = description
      .split(/[;,]/)
      .map((c) => c.trim())
      .filter((c) => c !== '');
    expect(clauses.length, 'DAE-85: the row has a description cell').toBeGreaterThan(0);
    expect(
      clauses.filter(
        (c) =>
          /\bgroups?\b|\bgetGroups\b/i.test(c) &&
          /\b(?:insertion|registration)\b|\b(?:registered|added) order\b|\border (?:in which )?(?:they|it) (?:were|was) (?:added|registered)\b|\bin the order\b[^.]*\b(?:added|registered)\b/i.test(
            c,
          ) &&
          !/`?priority`?/i.test(c),
      ),
      'DAE-85: no clause says the groups are returned in insertion order without naming priority',
    ).toEqual([]);
  });

  it('DAE-38: api/command-react.md Dialog open row states the controlled contract and a closed uncontrolled start', () => {
    const dialog: string = sectionOf(`${DOCS}api/command-react.md`, /^`<Command\.Dialog>`$/);
    const row: string = tableRow(dialog, /^\| `open` \|/);
    const changeRow: string = tableRow(dialog, /^\| `onOpenChange` \|/);
    for (const s of sentences(changeRow).filter((s) =>
      /\buncontrolled\b|\bwithout `open`|\bomit\w* `open`|`open` (?:is )?(?:omitted|undefined|left out)\b/i.test(
        s,
      ),
    )) {
      expect(
        s,
        'DAE-38/RA-85: an uncontrolled report in the onOpenChange row is tied to a dialog that dropped its open prop',
      ).toMatch(
        /\b(?:drops?|stops? passing|no longer pass\w*|unsets?)\b[^.]*`open`|`open`[^.]*\b(?:dropped|removed)\b/,
      );
    }
    expect(row, 'DAE-38: a request calls onOpenChange once and the parent decides').toContain(
      'onOpenChange(requested)',
    );
    expect(row, 'DAE-38: a parent that keeps open={true} keeps the dialog open').toContain(
      'open={true}',
    );
    // The false claim: the component can own its open state (an "uncontrolled mode" that opens
    // itself). The anchors above pin the controlled contract; the unqualified-report guard above
    // pins the onOpenChange row.
    expect(row, 'DAE-38: no "uncontrolled mode" invitation').not.toMatch(
      /\b(?:omit|leave|skip)\b[^|]*\buncontrolled\b|\bown(?:s)? its open state\b/i,
    );
  });

  it('DAE-41: api/command-react.md data attributes list list-status and page-id and none that no component emits', () => {
    const all: string = sectionOf(`${DOCS}api/command-react.md`, /^All Data Attributes$/);
    const rows: string[] = all.split(/\r?\n/).filter((l) => l.startsWith('| `['));
    const listed: string = rows.join('\n');
    expect(listed, 'DAE-41: data-command-list-status is listed').toContain(
      '[data-command-list-status]',
    );
    expect(listed, 'DAE-41: data-command-page-id is listed').toContain('[data-command-page-id]');
    expect(listed, 'DAE-41: virtual-item is not in the table').not.toContain(
      'data-command-virtual-item',
    );
    expect(listed, 'DAE-41: scroll-indicator is not in the table').not.toContain(
      'data-command-scroll-indicator',
    );
    const prose: string = all
      .split(/\r?\n/)
      .filter((l) => !l.startsWith('|'))
      .join('\n');
    expect(prose, 'DAE-41: both are named').toContain('data-command-virtual-item');
  });

  it('DAE-42: api/command-react.md tokens declare --command-count written by no component and list the user tokens', () => {
    const tokens: string = sectionOf(`${DOCS}api/command-react.md`, /^All CSS Custom Properties$/);
    const count: string = tableRow(tokens, /^\| `--command-count` \|/);
    // The code anchors: the stylesheet declares --command-count with the integer syntax and the
    // initial 0, and no source of the adapter writes it. The false claim is a live count.
    expect(count, 'DAE-42: the row declares the integer syntax and the initial 0').toMatch(
      /^\| `--command-count` \| `<integer>` \| `0` \|/,
    );
    expect(count, 'DAE-42: it is not described as a live count').not.toMatch(
      /\b(?:filtered|live|current|matching)\b[^|]*\bcount\b|\bcount of\b/i,
    );
    expect(
      read(`${SRC_REACT}styles.css`),
      'DAE-42: the stylesheet declares --command-count',
    ).toContain('@property --command-count');
    for (const source of reactSources()) {
      expect(source, 'DAE-42: no component writes --command-count').not.toContain(
        '--command-count',
      );
    }
    for (const token of [
      '--command-item-height',
      '--command-dialog-radius',
      '--command-dialog-max-width',
      '--command-dialog-max-height',
      '--command-highlight-color',
    ]) {
      expect(tokens, `DAE-42: ${token} is documented`).toContain(`\`${token}\``);
    }
    expect(tokens, 'DAE-42: a duration token is documented').toMatch(/`--command-duration-/);
  });

  it('DAE-33: api/command.md Telemetry documents the telemetry option, the standalone helper and the hooks type', () => {
    const page: string = read(`${DOCS}api/command.md`);
    const telemetry: string = sectionOf(`${DOCS}api/command.md`, /^Telemetry$/);
    expect(telemetry, 'DAE-33: the telemetry option has a subsection').toMatch(
      /^### The `telemetry` option$/m,
    );
    expect(telemetry, 'DAE-33: the standalone helper has a subsection').toMatch(
      /^### `createTelemetryMiddleware\(hooks\)`$/m,
    );
    expect(telemetry, 'DAE-33: the hooks type has a subsection').toMatch(
      /^### `CommandTelemetryHooks`$/m,
    );
    for (const hook of ['onPaletteOpen', 'onPaletteClose', 'onSearchComplete', 'onItemSelected']) {
      expect(telemetry, `DAE-33: ${hook} is documented`).toContain(hook);
    }
    expect(
      fenceWith(telemetry, 'DAE-33', 'createCommandMachine(', /\btelemetry:\s*\{/).code,
      'DAE-33: a sample passes the option to the machine',
    ).toContain('onSearchComplete');
    const options: string = sectionOf(`${DOCS}api/command.md`, /^`CommandMachineOptions`$/);
    expect(
      tableRow(options, /^\| `telemetry` \|/),
      'DAE-33: the options table has a telemetry row',
    ).toContain('CommandTelemetryHooks');
    expect(page, 'DAE-33: durations are not Date.now() differences').not.toContain(
      'Date.now() - startTime',
    );
  });

  it('NAR-aichat-3: recipes/ai-chat-commands.md starts every Command module with use client', () => {
    const modules = clientModuleStarts(`${DOCS}recipes/ai-chat-commands.md`);
    expect(
      modules.found,
      'NAR-aichat-3: the page has a module that renders a Command with an onSelect closure',
    ).toBeGreaterThan(0);
    expect(
      modules.withoutDirective,
      "NAR-aichat-3: every such module starts with 'use client'",
    ).toEqual([]);
  });

  it('NAR-emoji-4: recipes/emoji-picker.md starts every Command module with use client', () => {
    const modules = clientModuleStarts(`${DOCS}recipes/emoji-picker.md`);
    expect(
      modules.found,
      'NAR-emoji-4: the page has a module that renders a Command with an onSelect closure',
    ).toBeGreaterThan(0);
    expect(
      modules.withoutDirective,
      "NAR-emoji-4: every such module starts with 'use client'",
    ).toEqual([]);
  });

  it('NAR-file-3: recipes/file-picker.md starts every Command module with use client', () => {
    const modules = clientModuleStarts(`${DOCS}recipes/file-picker.md`);
    expect(
      modules.found,
      'NAR-file-3: the page has a module that renders a Command with an onSelect closure',
    ).toBeGreaterThan(0);
    expect(
      modules.withoutDirective,
      "NAR-file-3: every such module starts with 'use client'",
    ).toEqual([]);
  });

  it('NAR-spotlight-5: recipes/spotlight-search.md starts every Command module with use client', () => {
    const modules = clientModuleStarts(`${DOCS}recipes/spotlight-search.md`);
    expect(
      modules.found,
      'NAR-spotlight-5: the page has a module that renders a Command with an onSelect closure',
    ).toBeGreaterThan(0);
    expect(
      modules.withoutDirective,
      "NAR-spotlight-5: every such module starts with 'use client'",
    ).toEqual([]);
  });

  it('NAR-async-5: examples/async-search.md With Error Boundary uses CommandErrorBoundary and defines what it renders', () => {
    const page: string = read(`${DOCS}examples/async-search.md`);
    expect(page, 'NAR-async-5: the third-party package is not imported').not.toContain(
      'react-error-boundary',
    );
    const body: string = sectionOf(`${DOCS}examples/async-search.md`, /^With Error Boundary$/);
    const sample: Fence = fenceWith(body, 'NAR-async-5', '<CommandErrorBoundary');
    expect(sample.code, 'NAR-async-5: CommandErrorBoundary comes from modern-cmdk/react').toMatch(
      /import\s*\{[^}]*\bCommandErrorBoundary\b[^}]*\}\s*from\s*'modern-cmdk\/react'/,
    );
    for (const name of ['SearchResults', 'cachedSearch', 'cache']) {
      expect(sample.code, `NAR-async-5: ${name} is defined or declared in the sample`).toMatch(
        new RegExp(`^(?:declare )?(?:function|const) ${name}\\b`, 'm'),
      );
    }
    expect(sample.code, 'NAR-async-5: the fallback and onError props are used').toMatch(
      /\bonError=/,
    );
  });

  it('DG-21: guide/controlled-dialog.md opens the dialog from a document keydown listener and says an uncontrolled one never opens', () => {
    const page: string = read(`${DOCS}guide/controlled-dialog.md`);
    // The false claim: a dialog without `open` opens itself (the base page left an uncontrolled
    // dialog to open itself). The page opens it from a document keydown listener (the sample
    // below) that toggles the state `open` reads.
    expect(page, 'DG-21: no invitation to an uncontrolled dialog that opens itself').not.toMatch(
      /\b(?:omit|leave|skip)\b[^.]*\b(?:open|uncontrolled)\b[^.]*\b(?:own|opens? itself|manages? (?:its|the) (?:own )?(?:open )?state)\b|\bowns? its open state\b/i,
    );
    const shortcut: string = sectionOf(
      `${DOCS}guide/controlled-dialog.md`,
      /^Opening with Ctrl\+K$/,
    );
    const sample: Fence = fenceWith(
      shortcut,
      'DG-21',
      "addEventListener('keydown'",
      'Command.Dialog',
    );
    expect(sample.code, 'DG-21: the listener toggles the state that open reads').toMatch(
      /set\w+\(\(\w+\) => !\w+\)/,
    );
    expect(sample.code, 'DG-21: the dialog reads the state').toMatch(
      /<Command\.Dialog\b[^>]*\bopen=\{/,
    );
    expect(sample.code, 'DG-21: the listener is removed').toContain(
      "removeEventListener('keydown'",
    );
  });

  it('DG-24: guide/async-items.md Debounced API Search contains a debounce and a per-query cache', () => {
    const body: string = sectionOf(`${DOCS}guide/async-items.md`, /^Debounced API Search$/);
    const sample: Fence = fenceWith(body, 'DG-24', '<Command.AsyncItems');
    expect(sample.code, 'DG-24: a timer debounce restarts on every keystroke').toMatch(
      /setTimeout\(/,
    );
    expect(sample.code, 'DG-24: the timer is cleared').toMatch(/clearTimeout\(/);
    expect(sample.code, 'DG-24: the search reads the debounced value').toMatch(
      /useDebouncedValue\(/,
    );
    expect(sample.code, 'DG-24: one promise per query is cached in a Map').toMatch(
      /new Map<string, Promise</,
    );
    expect(sample.code, 'DG-24: the cached search is read through useMemo').toMatch(
      /useMemo\(\(\) => cachedSearch\(/,
    );
  });

  it('DG-74: guide/async-items.md says an enclosing Suspense never shows the AsyncItems fallback', () => {
    const page: string = read(`${DOCS}guide/async-items.md`);
    for (const f of codeFences(page)) {
      expect(
        f.code,
        `DG-74: no sample wraps AsyncItems in an outer Suspense (line ${f.line})`,
      ).not.toContain('<Suspense');
    }
    // The false claim: a Suspense around the AsyncItems shows the AsyncItems fallback (the
    // component renders its own boundary and its `fallback` prop). The anchor above pins the
    // samples; this pins the prose: a comma clause about an enclosing Suspense that shows,
    // displays or renders a fallback carries a negation in the same clause.
    const loading: string = sectionOf(`${DOCS}guide/async-items.md`, /^Loading States$/);
    const fallbackRow: string = tableRow(
      sectionOf(`${DOCS}guide/async-items.md`, /^Props$/),
      /^\| `fallback` \|/,
    );
    const outerShows =
      /(?=.*\bSuspense\b)(?=.*\b(?:enclos\w*|outer|surround\w*|wrap\w*|parent|ancestor|higher up|further up|around (?:it|the list|the items)|above it)\b)(?=.*\b(?:shows?|displays?|renders?|catch\w*|handles?|provides?|appears?|visible)\b)(?=.*\bfallback\b)/i;
    const clauseClaims = (text: string): string[] =>
      sentences(text)
        .flatMap((s) => s.split(/,\s+/))
        .filter(
          (c) =>
            outerShows.test(c) && !/\b(?:no|not|never|without|neither|nor|none)\b|n't\b/i.test(c),
        );
    expect(
      [...clauseClaims(loading), ...clauseClaims(fallbackRow)],
      'DG-74: no sentence says an enclosing Suspense shows the fallback',
    ).toEqual([]);
  });

  it('DG-75: guide/async-items.md handles errors with CommandErrorBoundary, not react-error-boundary', () => {
    const page: string = read(`${DOCS}guide/async-items.md`);
    expect(page, 'DG-75: the third-party package is not named').not.toContain(
      'react-error-boundary',
    );
    const body: string = sectionOf(`${DOCS}guide/async-items.md`, /^Error Handling$/);
    const sample: Fence = fenceWith(body, 'DG-75', '<CommandErrorBoundary');
    expect(sample.code, 'DG-75: CommandErrorBoundary comes from modern-cmdk/react').toMatch(
      /import\s*\{[^}]*\bCommandErrorBoundary\b[^}]*\}\s*from\s*'modern-cmdk\/react'/,
    );
    expect(body, 'DG-75: resetKeys is documented').toContain('resetKeys');
    expect(body, 'DG-75: onError is documented').toContain('onError');
  });

  it('DT-54: guide/async-items.md samples use Map.groupBy and no non-null assertion on the groups', () => {
    const fs: Fence[] = codeFences(read(`${DOCS}guide/async-items.md`));
    const all: string = fs.map((f) => f.code).join('\n');
    expect(all, 'DT-54: no Object.groupBy').not.toContain('Object.groupBy');
    expect(all, 'DT-54: no non-null assertion on a group').not.toMatch(/\b\w+!\.\w/);
    expect(all, 'DT-54: the grouping sample uses Map.groupBy').toContain('Map.groupBy(');
    expectNoPromiseInJsx(fs, 'DT-54');
  });

  it('DGX-ASYNC-8: guide/async-items.md groups with Map.groupBy and needs no non-null assertion', () => {
    const body: string = sectionOf(`${DOCS}guide/async-items.md`, /^Debounced API Search$/);
    const sample: Fence = fenceWith(body, 'DGX-ASYNC-8', 'groupBy(');
    expect(sample.code, 'DGX-ASYNC-8: the groups come from Map.groupBy').toMatch(/Map\.groupBy\(/);
    expect(sample.code, 'DGX-ASYNC-8: not Object.groupBy').not.toContain('Object.groupBy');
    expect(sample.code, 'DGX-ASYNC-8: the Map is iterated, not Object.entries').not.toContain(
      'Object.entries(',
    );
    expect(sample.code, 'DGX-ASYNC-8: no non-null assertion on a group or an array').not.toMatch(
      /\b\w+!(?:\.|\)|;|\s)/,
    );
    expect(sample.code, 'DGX-ASYNC-8: no ?? [] fallback for a group').not.toMatch(
      /\(\w+ \?\? \[\]\)/,
    );
  });

  it('DGX-SSR-7: guide/ssr.md Streaming SSR creates the promise per request in a Server Component', () => {
    const body: string = sectionOf(`${DOCS}guide/ssr.md`, /^Streaming SSR$/);
    for (const f of codeFences(body)) {
      expect(f.code, `DGX-SSR-7: no module-scope fetch promise (line ${f.line})`).not.toMatch(
        /^(?:const|let)\s+\w+\s*=\s*[^\n]*\bfetch\w*\([^\n]*\)\s*\.then\(/m,
      );
    }
    const server: Fence = fenceWith(body, 'DGX-SSR-7', /results=\{\w+\(\)\}/);
    expect(server.code, 'DGX-SSR-7: the Server Component does not await the fetcher').not.toMatch(
      /await \w+\(\)\s*[;)]/,
    );
    const client: Fence = fenceWith(body, 'DGX-SSR-7', 'items={results}');
    expect(
      isClientModule(client.code),
      'DGX-SSR-7: the palette that reads the promise is a client module',
    ).toBe(true);
  });

  it('ARCH-47: guide/ssr.md does not use Command.X members in a Server Component', () => {
    const page: string = read(`${DOCS}guide/ssr.md`);
    expect(page, 'ARCH-47: no automatic Client Component claim').not.toMatch(
      /automatically become Client Components/i,
    );
    const body: string = sectionOf(`${DOCS}guide/ssr.md`, /^Next\.js App Router$/);
    expect(body, 'ARCH-47: the page names the server error').toContain(
      'Cannot access Command.Input on the server',
    );
    for (const f of codeFences(page)) {
      if (!/\(Server Component\)/.test(f.code)) continue;
      expect(
        f.code,
        `ARCH-47: a Server Component sample renders no Command.X member (line ${f.line})`,
      ).not.toMatch(/<Command\.\w+/);
    }
  });

  it('RA-26: packages/modern-cmdk/src/react/activity.tsx header says the caller chooses the mode', () => {
    const head: string = header(`${SRC_REACT}activity.tsx`);
    expect(head, 'RA-26: it renders React’s Activity with the mode prop').toMatch(/\bmode\b/);
    expect(head, 'RA-26: it is not wired to the dialog').not.toMatch(
      /when (?:the )?dialog closes/i,
    );
    expect(head, 'RA-26: no promise of scroll preservation').not.toMatch(/preserves scroll/i);
    expect(head, 'RA-26: no promise of no remount').not.toMatch(/without remount/i);
  });

  it('RA-28: packages/modern-cmdk/src/react/shortcut.tsx claims no context lookup of the nearest Command.Item', () => {
    const source: string = read(`${SRC_REACT}shortcut.tsx`);
    expect(source, 'RA-28: no nearest-Item lookup').not.toMatch(/nearest\s+`?Command\.Item/i);
    expect(source, 'RA-28: no reads-from claim').not.toMatch(/reads from/i);
    expect(source, 'RA-28: without a shortcut the component renders its children').toMatch(
      /renders its `children`/,
    );
  });

  it('RA-29: packages/modern-cmdk/src/react/page.tsx header says the page renders only while it is current', () => {
    const head: string = header(`${SRC_REACT}page.tsx`);
    // The code anchor: the component renders its children only while the machine's page equals
    // `id`, keeps no stack and starts no view transition. The header claims no
    // page stack and no View Transitions.
    const source: string = read(`${SRC_REACT}page.tsx`);
    expect(source, 'RA-29: the component renders only the page whose id is current').toMatch(
      /if \(stateCtx\.state\.page !== id\) return null;/,
    );
    expect(source, 'RA-29: the component starts no view transition').not.toMatch(
      /ViewTransition|startViewTransition|addTransitionType/,
    );
    expect(head, 'RA-29: no page stack management').not.toMatch(/page[- ]stack/i);
    expect(head, 'RA-29: no View Transitions').not.toMatch(/view[- ]transitions?/i);
  });

  it('RA-30: packages/modern-cmdk/src/react/dialog.tsx header names hideOthers, not inert', () => {
    const head: string = header(`${SRC_REACT}dialog.tsx`);
    expect(head, 'RA-30: no inert claim').not.toMatch(/inert on background/i);
    expect(head, 'RA-30: the background is hidden with aria-hidden through hideOthers').toContain(
      'hideOthers',
    );
    expect(head, 'RA-30: aria-hidden is named').toContain('aria-hidden');
  });

  it('RA-70: packages/modern-cmdk/src/react/dialog.tsx and command.tsx headers claim no ES2026 satisfies or branded types', () => {
    for (const file of ['dialog.tsx', 'command.tsx']) {
      const head: string = header(`${SRC_REACT}${file}`);
      expect(head, `RA-70: ${file} header names no ES2026 feature`).not.toMatch(/ES2026/);
      expect(head, `RA-70: ${file} header names no satisfies operator`).not.toMatch(
        /satisfies operator/i,
      );
      expect(head, `RA-70: ${file} header names no branded types`).not.toMatch(/branded types/i);
    }
  });

  it('RA-85: packages/modern-cmdk/src/react/dialog.tsx open JSDoc says an undefined open starts closed and nothing opens it', () => {
    // An uncontrolled dialog starts closed (`useState(controlledOpen ?? false)`) and nothing it
    // renders or binds opens it: there is no trigger, the keydown listener exists only while it is
    // open, and the machine is not exposed. The `open` JSDoc must not invite the uncontrolled mode.
    const file = `${SRC_REACT}dialog.tsx`;
    const open: string = jsdocAbove(file, /^\s*readonly open\?:/);
    expect(open, 'RA-85: the open prop is described as controlled state').toMatch(/controlled/i);
    expect(open, 'RA-85: an undefined open starts (or begins) closed').toMatch(
      /\b(?:starts|begins|stays|remains|mounts|initially) closed\b/,
    );
    expect(open, 'RA-85: nothing (or no part of the component) opens it').toMatch(
      /\b(?:nothing|no part)\b[^.]*\bopens? it\b/,
    );
    expect(open, 'RA-85: no invitation to let the dialog own its open state').not.toMatch(
      /\bowns? its open state\b/,
    );
    const changed: string = jsdocAbove(file, /^\s*readonly onOpenChange\?:/);
    expect(changed, 'RA-85: a controlled dialog reports each request once').toMatch(/controlled/i);
    for (const s of sentences(changed).filter((s) =>
      /\buncontrolled\b|\bwithout `open`|\bomit\w* `open`|`open` (?:is )?(?:omitted|undefined|left out)\b/i.test(
        s,
      ),
    )) {
      expect(
        s,
        'RA-85: an uncontrolled report is tied to a dialog that dropped its open prop',
      ).toMatch(
        /\b(?:drops?|stops? passing|no longer pass\w*|unsets?)\b[^.]*`open`|`open`[^.]*\b(?:dropped|removed)\b/,
      );
    }
  });

  it('RA-86: packages/modern-cmdk/src/react/activity.tsx and api/command-react.md describe a hidden Activity as kept mounted and hidden, not unrendered', () => {
    // The code anchor: the component hands its mode to React's Activity. The false claim: a hidden
    // Activity is unrendered or preserved in memory (React keeps the children mounted, hides their
    // DOM with `display: none` and cleans up their effects).
    const texts: ReadonlyMap<string, string> = new Map([
      [
        `${SRC_REACT}activity.tsx (the CommandActivity JSDoc)`,
        jsdocAbove(`${SRC_REACT}activity.tsx`, /^export function CommandActivity\b/),
      ],
      [
        `${DOCS}api/command-react.md (the Command.Activity section)`,
        sectionOf(`${DOCS}api/command-react.md`, /^`<Command\.Activity>`$/),
      ],
    ]);
    for (const [where, text] of texts) {
      expect(text, `RA-86: ${where} does not call the hidden tree unrendered`).not.toMatch(
        /preserved in memory|\bwithout render\w*|\bnot (?:be )?rendered\b|\bunrendered\b/i,
      );
    }
    expect(
      read(`${SRC_REACT}activity.tsx`),
      'RA-86: the component hands its mode prop to React Activity',
    ).toMatch(/<ActivityComponent mode=\{mode\}>/);
  });

  it('CE-92: api/command.md, packages/modern-cmdk/README.md, ARCHITECTURE.md and CONTRIBUTING.md name the telemetry option', () => {
    for (const file of [
      `${DOCS}api/command.md`,
      'packages/modern-cmdk/README.md',
      'ARCHITECTURE.md',
      'CONTRIBUTING.md',
    ]) {
      const text: string = read(file);
      expect(text, `CE-92: ${file} names the telemetry option or prop`).toContain('`telemetry`');
      expect(text, `CE-92: ${file} says no telemetry option exists`).not.toMatch(
        /\b(?:have|has|with|without)\s+no\s+(?:machine or React\s+)?telemetry (?:option|prop)|\bno (?:machine or React )?telemetry option/i,
      );
      expect(text, `CE-92: ${file} says nothing calls the hooks`).not.toMatch(
        /\bNothing (?:in the \w+ )?(?:calls|invokes) (?:it|them|the hooks)\b|\b(?:hooks|middleware)\b[^.\n]*\b(?:your code|the caller|you)\s+(?:calls?|invokes?|runs?|fires?)\s+(?:them |it )?(?:itself|yourself|by hand)\b/i,
      );
    }
    // The code anchor: the machine options have a `telemetry` field and the React root forwards it.
    expect(read('packages/modern-cmdk/src/core/types.ts'), 'CE-92: the option exists').toMatch(
      /readonly telemetry\?:/,
    );
    expect(read(`${SRC_REACT}command.tsx`), 'CE-92: the React root forwards it').toMatch(
      /^\s+telemetry,$/m,
    );
  });

  it('SEC-47: api/command.md Telemetry samples report counts and never the raw query', () => {
    const telemetry: string = sectionOf(`${DOCS}api/command.md`, /^Telemetry$/);
    const samples: Fence[] = codeFences(telemetry);
    // The sinks: the analytics client and any other call that leaves the page (one level of nested
    // parentheses, so `durationMs: end - start` and `q.length` stay inside their call).
    const sinkStart = /\b(?:analytics\.\w+|console\.\w+|fetch|navigator\.sendBeacon)\(/g;
    const calls: string[] = samples.flatMap((f) =>
      [...f.code.matchAll(sinkStart)].map((m) => {
        let depth = 0;
        for (let i = m.index + m[0].length - 1; i < f.code.length; i++) {
          if (f.code[i] === '(') depth++;
          else if (f.code[i] === ')' && --depth === 0) return f.code.slice(m.index, i + 1);
        }
        return f.code.slice(m.index);
      }),
    );
    expect(calls.length, 'SEC-47: the samples track events').toBeGreaterThan(3);
    // The raw query reaches a hook as the first parameter of onSearchComplete and the second of
    // onItemSelected, whatever the sample names it (`_query`, `q`, `text`) and however the hook is
    // written (an arrow function with or without parameter types, or a `function`).
    const queryParams: Set<string> = new Set(
      samples.flatMap((f) => [
        ...[...f.code.matchAll(/\bonSearchComplete\b[^(\n]*\(\s*(\w+)/g)].map((m) => m[1] ?? ''),
        ...[...f.code.matchAll(/\bonItemSelected\b[^(\n]*\(\s*\w+[^,()]*,\s*(\w+)/g)].map(
          (m) => m[1] ?? '',
        ),
      ]),
    );
    queryParams.delete('');
    // The hook signatures are cut out by position, so a parameter's declaration is not read as a use.
    const hookSignature = /\b(?:onSearchComplete|onItemSelected)\b[^(\n]*\([^)]*\)/g;
    for (const f of samples) {
      let body = '';
      let from = 0;
      for (const m of f.code.matchAll(hookSignature)) {
        body += f.code.slice(from, m.index);
        from = m.index + m[0].length;
      }
      body += f.code.slice(from);
      for (const name of queryParams) {
        expect(body, `SEC-47: ${name} is used only as ${name}.length`).not.toMatch(
          new RegExp(`(?<![\\w$])${name}(?![\\w$])(?!\\.length\\b)`),
        );
      }
    }
    expect(
      queryParams.size,
      'SEC-47: the samples name the query parameter of onSearchComplete and onItemSelected',
    ).toBeGreaterThan(0);
    for (const call of calls) {
      // Only the length of the query is a count: `name.length` is allowed, the name alone is not.
      const sent: string = call.replace(/\b(\w+)\.length\b/g, (whole, name: string) =>
        queryParams.has(name) ? '' : whole,
      );
      expect(sent, 'SEC-47: no sink call sends the query by its word').not.toMatch(/\bquery\b/i);
      for (const name of queryParams) {
        expect(sent, `SEC-47: no sink call sends the query parameter ${name}`).not.toMatch(
          new RegExp(`(?<![\\w$])${name}(?![\\w$])`),
        );
      }
    }
    expect(telemetry, 'SEC-47: the search sample reports resultCount').toContain('resultCount');
    expect(telemetry, 'SEC-47: durations are performance.now() differences').toContain(
      'performance.now()',
    );
    expect(telemetry, 'SEC-47: no wall-clock start time').not.toContain('Date.now() - startTime');
  });

  it('RA-84: api/command.md events table and guide/architecture.md CommandState paragraph state the active item rule', () => {
    // The rule (core/machine.ts, the refilter): after a search change the active item stays while
    // the new list still holds it and it is enabled, otherwise the first enabled item of the ranked
    // list becomes active. The anchors pin the names the rule is about (`onActiveChange`, `filteredIds`, `activeId`).
    // The base text said only "Update search query"; cmdk, by contrast, returns to the first
    // item, and no page may say that the machine does.
    const returnsToFirst =
      /\b(?:resets?|returns?|goes back|jumps?|moves?)\b[^|.;]*\b(?:first|top)\b[^|.;]*\b(?:item|result)/i;
    const events: string = sectionOf(`${DOCS}api/command.md`, /^Events \(`CommandEvent`\)$/);
    const search: string = tableRow(events, /^\| `SEARCH_CHANGE` \|/);
    expect(search, 'RA-84: a controlled activeId reports the candidate').toContain(
      '`onActiveChange`',
    );
    expect(search, 'RA-84: SEARCH_CHANGE does not reset to the first item').not.toMatch(
      returnsToFirst,
    );
    expect(search, 'RA-84: the row is more than "Update search query"').not.toMatch(
      /\|\s*Update search query\s*\|\s*$/,
    );
    const activate: string = tableRow(events, /^\| `ITEM_ACTIVATE` \|/);
    expect(activate, 'RA-84: ITEM_ACTIVATE lands on an item of filteredIds').toContain(
      '`filteredIds`',
    );
    const arch: string = read(`${DOCS}guide/architecture.md`);
    const paragraph: string =
      arch.split(/\r?\n/).find((l) => l.includes('`SEARCH_CHANGE` updates')) ?? '';
    expect(paragraph, 'RA-84: the CommandState paragraph exists').not.toBe('');
    expect(paragraph, 'RA-84: it names the field the rule decides').toContain('`activeId`');
    expect(paragraph, 'RA-84: a cleared search does not return to the first item').not.toMatch(
      /\bcleared search (?:returns?|resets?|goes back|jumps?|moves?)\b/i,
    );
  });

  it('C4 delta table: guide/migration-from-cmdk.md renders every row of tests/unit/cmdk-parity-delta.json', () => {
    // Section `## Measured Differences from cmdk 1.1.1`: rows | `<case-id>` | status | reason | ref
    // |, `|` and `<` escaped with a backslash in the
    // reason, an empty ref cell for null. The ids, statuses, reasons and refs equal the JSON's, in
    // its key order.
    const delta = JSON.parse(read('tests/unit/cmdk-parity-delta.json')) as Record<
      string,
      { readonly status: string; readonly reason: string; readonly ref: string | null }
    >;
    const body: string = sectionOf(
      `${DOCS}guide/migration-from-cmdk.md`,
      /^Measured Differences from cmdk 1\.1\.1$/,
    );
    const unescapeCell = (cell: string): string =>
      cell.replaceAll('\\|', '|').replaceAll('\\<', '<');
    const rows: { id: string; status: string; reason: string; ref: string }[] = [];
    for (const line of body.split(/\r?\n/)) {
      if (!/^\|\s*`[^`]+`\s*\|/.test(line)) continue;
      const cells: string[] = line
        .split(/(?<!\\)\|/)
        .slice(1, -1)
        .map((cell) => cell.trim());
      expect(cells.length, `delta row has four cells: ${line.slice(0, 60)}`).toBe(4);
      rows.push({
        id: /^`([^`]+)`$/.exec(cells[0] ?? '')?.[1] ?? '',
        status: cells[1] ?? '',
        reason: unescapeCell(cells[2] ?? ''),
        ref: unescapeCell(cells[3] ?? ''),
      });
    }
    const keys: string[] = Object.keys(delta);
    expect(
      rows.map((r) => r.id),
      'delta: the case ids, in JSON order',
    ).toEqual(keys);
    expect(
      rows.map((r) => r.status),
      'delta: the statuses',
    ).toEqual(keys.map((k) => delta[k]?.status));
    expect(
      rows.map((r) => r.reason),
      'delta: the reasons, verbatim',
    ).toEqual(keys.map((k) => delta[k]?.reason));
    expect(
      rows.map((r) => r.ref),
      'delta: the references (null renders empty)',
    ).toEqual(keys.map((k) => delta[k]?.ref ?? ''));
  });
});

/**
 * A recipe module that imports the React adapter and renders a Command with an `onSelect` closure is a client
 * module: its first statement is the directive. Returns the count of such modules and the lines of those that lack it.
 */
function clientModuleStarts(file: string): { found: number; withoutDirective: number[] } {
  const modules: Fence[] = codeFences(read(file)).filter(
    (f) =>
      /from 'modern-cmdk\/react'/.test(f.code) &&
      /<Command\b/.test(f.code) &&
      /\bonSelect=\{/.test(f.code),
  );
  return {
    found: modules.length,
    withoutDirective: modules.filter((f) => !isClientModule(f.code)).map((f) => f.line),
  };
}
