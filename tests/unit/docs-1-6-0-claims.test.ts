// tests/unit/docs-1-6-0-claims.test.ts
// The ten docs rows of 1.6.0 that the BUG-to-test matrix (tests/unit/bug-matrix.test.ts, G17/D88) maps to a test title.
// Each `it` asserts the page property whose absence was the row's defect: it is red on the page revision before the fix and
// red when the row's false sentence is put back, and a rewording that keeps the property stays green.
// The pages are read as Markdown: no build is needed. Row claims live in docs/ledger/findings.json.
//   DAE-09, DAE-59  apps/docs/examples/frecency.md   (module-scope storage in the React sample, no view object, await using order)
//   DG-09, DT-18    apps/docs/guide/frecency.md      (same sample, ownership paragraph, non-empty-query sentence)
//   DAE-28, DAE-30  apps/docs/api/command.md         (Disabled items section, FrecencyEngine sample)
//   DG-32           apps/docs/guide/shortcuts.md     (How the Registry Resolves Conflicts)
//   RDG-34          CONTRIBUTING.md                  (the sample unit test waits for the scheduled send())
//   DAE-15, NAR-vanilla-4  apps/docs/examples/vanilla.md  (const machine + pagehide, the Svelte $effect cleanup)
// A guard `it` (not a row) keeps the DAE-15 shape, a module-top-level `using machine` or `await using storage`, out of every
// shipped Markdown sample (apps/docs, the READMEs, CONTRIBUTING.md, ARCHITECTURE.md).

import { existsSync, globSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root: string = resolve(import.meta.dirname, '../..');
const SKIP_DIRS: ReadonlySet<string> = new Set(['node_modules', 'cache', 'dist', '.git']);
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

/** The script fences of a page; the language is the first word of the info string, any case (```ts title="x.ts" and ```ts{2} count). */
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

/** The first script fence of `file` in which every predicate holds. */
function fenceWith(file: string, ...needles: readonly (string | RegExp)[]): Fence {
  const hit: Fence | undefined = codeFences(read(file)).find((f) =>
    needles.every((needle) =>
      typeof needle === 'string' ? f.code.includes(needle) : needle.test(f.code),
    ),
  );
  expect(
    hit,
    `${file}: expected a script sample matching ${needles.map(String).join(' and ')}`,
  ).toBeDefined();
  return hit as Fence;
}

describe('docs rows of 1.6.0', () => {
  it('DAE-09: examples/frecency.md states the IndexedDB save flow (1000 ms debounce, visibilitychange, pagehide) and passes a module-scope storage to the React frecency prop', () => {
    // apps/docs/examples/frecency.md:110-114 (What persists, and when), :77 (const storage = new IdbFrecencyStorage(...)), :82-86 (frecency={{ enabled: true, storage, ... }}).
    // "Your history persists across reloads" is true only if the engine saves before the page goes away, so the page states the real
    // flow (a 1000 ms trailing debounce, visibilitychange, pagehide, dispose) and never presents dispose as the only save. The sample keeps one module-scope storage that the caller disposes (D95); no view object wraps it.
    const file = 'apps/docs/examples/frecency.md';
    const persistence: string = section(read(file), /^IndexedDB Persistence$/);
    expect.soft(persistence, 'DAE-09: the debounce').toContain('1000 ms');
    expect.soft(persistence, 'DAE-09: visibilitychange saves').toContain('`visibilitychange`');
    expect.soft(persistence, 'DAE-09: pagehide saves').toContain('`pagehide`');
    const sample: Fence = fenceWith(file, /frecency=\{\{[^}]*\bstorage\b/);
    expect
      .soft(sample.code, 'DAE-09: storage is created at module scope')
      .toMatch(/^const storage = new IdbFrecencyStorage\(/m);
    expect
      .soft(sample.code, 'DAE-09: the prop passes the module storage')
      .toMatch(/frecency=\{\{[^}]*\benabled: true,[^}]*\bstorage,/);
    expect
      .soft(read(file), 'DAE-09: no view object with a no-op dispose')
      .not.toContain('[Symbol.dispose]: () => {}');
  });

  it('DAE-59: examples/frecency.md core demo declares await using storage before await using machine', () => {
    // apps/docs/examples/frecency.md:160-161. Declarations dispose in reverse order, so the machine (whose async dispose
    // saves) goes first and the storage is still live then. A sync `using machine` after the storage disposes the storage before that save.
    const sample: Fence = fenceWith('apps/docs/examples/frecency.md', 'createCommandMachine({');
    const storageAt: number = sample.code.indexOf('await using storage =');
    const machineAt: number = sample.code.indexOf('await using machine =');
    expect.soft(storageAt, 'DAE-59: await using storage is declared').toBeGreaterThanOrEqual(0);
    expect.soft(machineAt, 'DAE-59: await using machine is declared').toBeGreaterThanOrEqual(0);
    expect
      .soft(storageAt, 'DAE-59: the storage is declared before the machine')
      .toBeLessThan(machineAt);
    expect
      .soft(sample.code, 'DAE-59: no sync using machine')
      .not.toMatch(/(?<!await )using machine =/);
  });

  it('DG-09: guide/frecency.md passes a module-scope storage with no view object and says a passed storage is yours to dispose', () => {
    // apps/docs/guide/frecency.md:53 (const storage = new IdbFrecencyStorage()), :59-60 (enabled: true, storage), :79 (the ownership paragraph).
    const file = 'apps/docs/guide/frecency.md';
    const markdown: string = read(file);
    const sample: Fence = fenceWith(file, /frecency=\{\{[^}]*\bstorage\b/);
    expect
      .soft(sample.code, 'DG-09: storage is created at module scope')
      .toMatch(/^const storage = new IdbFrecencyStorage\(/m);
    expect
      .soft(sample.code, 'DG-09: the prop passes the module storage')
      .toMatch(/frecency=\{\{[^}]*\benabled: true,[^}]*\bstorage,/);
    expect
      .soft(markdown, 'DG-09: no view object with a no-op dispose')
      .not.toContain('[Symbol.dispose]: () => {}');
    expect.soft(markdown, 'DG-09: ownership paragraph').toMatch(/yours to dispose/);
  });

  it('DAE-30: api/command.md FrecencyEngine sample passes enabled: true and imports every name it uses', () => {
    // apps/docs/api/command.md:305-329 (the sample under "### FrecencyEngine" that builds a machine: frecency: { enabled: true, ... }),
    // :333-340 (the standalone FrecencyEngine sample, which has no enabled switch).
    const frecencyDoc: string = section(read('apps/docs/api/command.md'), /^`FrecencyEngine`$/);
    const known = [
      'createCommandMachine',
      'itemId',
      'FrecencyEngine',
      'MemoryFrecencyStorage',
      'IdbFrecencyStorage',
    ];
    const samples: Fence[] = codeFences(frecencyDoc).filter(
      (f) => /\bfrecency:\s*\{/.test(f.code) || /new FrecencyEngine\(/.test(f.code),
    );
    expect(
      samples.length,
      'DAE-30: the FrecencyEngine section holds the machine and the engine samples',
    ).toBeGreaterThanOrEqual(2);
    const machineSample: Fence | undefined = samples.find((f) =>
      f.code.includes('createCommandMachine('),
    );
    expect
      .soft(machineSample?.code, 'DAE-30: the machine sample passes enabled: true')
      .toMatch(/frecency:\s*\{\s*enabled: true\b/);
    for (const sample of samples) {
      const importLine: string =
        /^import \{([^}]*)\} from 'modern-cmdk';/m.exec(sample.code)?.[1] ?? '';
      const imported: Set<string> = new Set(
        importLine.split(',').map((name) => name.trim().replace(/^type /, '')),
      );
      const body: string = sample.code.replace(/^import .*$/gm, '').replace(/\/\/.*$/gm, ''); // names in comments do not count
      const first: string =
        sample.code.split('\n').find((text) => text.includes('import')) ?? sample.code;
      const missing: string[] = known.filter(
        (name) => new RegExp(`\\b${name}\\b`).test(body) && !imported.has(name),
      );
      expect
        .soft(missing, `DAE-30: the sample opening with "${first}" uses names it does not import`)
        .toEqual([]);
    }
  });

  it("DAE-28: api/command.md's Disabled items section says a disabled item takes part in filtering, never that it is excluded, and names both disabledItems values", () => {
    // apps/docs/api/command.md:194-203 (### Disabled items: "takes part in filtering" at :196, the 'hide' bullet at :201), :78 (the disabledItems row: 'show' | 'hide', default 'show').
    // The search path lists disabled items, so the page says they take part in filtering and never says "Excluded from filtering".
    const markdown: string = read('apps/docs/api/command.md');
    const disabled: string = section(markdown, /^Disabled items$/);
    expect.soft(disabled, 'DAE-28: the Disabled items section exists').not.toBe('');
    expect
      .soft(disabled, 'DAE-28: a disabled item takes part in filtering')
      .toContain('takes part in filtering');
    expect
      .soft(markdown, 'DAE-28: no page text says a disabled item is excluded from filtering')
      .not.toMatch(/excluded from filtering/i);
    expect.soft(disabled, 'DAE-28: the section names disabledItems').toContain('disabledItems');
    expect.soft(disabled, "DAE-28: the section says what 'hide' does").toContain("'hide'");
    const optionRow: string =
      markdown.split('\n').find((line) => line.startsWith('| `disabledItems`')) ?? '';
    expect
      .soft(optionRow, 'DAE-28: the disabledItems option row lists both values')
      .toContain("'show' \\| 'hide'");
    expect.soft(optionRow, "DAE-28: 'show' is the default").toContain("`'show'`");
  });

  it('DG-32: guide/shortcuts.md says the later binding wins and names getConflicts, getBindings and unregisterByItem', () => {
    // apps/docs/guide/shortcuts.md:182-189 (## How the Registry Resolves Conflicts), :179 (the detectConflicts tip).
    // detectConflicts is a real exported function (src/core/keyboard/matcher.ts), so the page may name it, but never says it runs during
    // registration: the registry keeps a stack per key and getConflicts() computes the report on demand.
    const markdown: string = read('apps/docs/guide/shortcuts.md');
    const conflicts: string = section(markdown, /^How the Registry Resolves Conflicts$/);
    expect.soft(conflicts, 'DG-32: the conflicts section exists').not.toBe('');
    expect.soft(conflicts, 'DG-32: the later binding wins').toMatch(/later binding/);
    for (const name of ['getConflicts', 'getBindings', 'unregisterByItem']) {
      expect.soft(conflicts, `DG-32: the section names ${name}`).toContain(name);
    }
    expect.soft(conflicts, 'DG-32: getConflicts is computed on demand').toMatch(/on demand/i);
    expect
      .soft(markdown, 'DG-32: the page never says detectConflicts runs during registration')
      .not.toMatch(/detectConflicts`?\s+runs during registration/i);
  });

  it('DT-18: guide/frecency.md says frecency re-ranks only non-empty queries, and none under filter={false}', () => {
    // apps/docs/guide/frecency.md:35. The page states that the empty query keeps registration order, and shows no sample in which
    // SEARCH_CHANGE with an empty query puts a selected item first (filteredIds[0]).
    const markdown: string = read('apps/docs/guide/frecency.md');
    const sentence: string =
      markdown.split('\n').find((line) => /re-ranks only non-empty quer/i.test(line)) ?? '';
    expect.soft(sentence, 'DT-18: the key sentence exists').not.toBe('');
    expect.soft(sentence, 'DT-18: it names the empty query').toMatch(/empty query/);
    expect.soft(sentence, 'DT-18: it names filter={false}').toMatch(/filter=\{false\}/);
    expect.soft(sentence, 'DT-18: it names registration order').toMatch(/registration order/);
    const emptyBoost: Fence[] = codeFences(markdown).filter(
      (f) =>
        /SEARCH_CHANGE[^\n]*query:\s*(?:''|"")/.test(f.code) && /filteredIds\[0\]/.test(f.code),
    );
    expect
      .soft(
        emptyBoost.map((f) => f.line),
        'DT-18: no sample expects an empty query to boost an item to filteredIds[0]',
      )
      .toEqual([]);
  });

  it('RDG-34: CONTRIBUTING.md sample test is async and waits with vi.waitFor instead of asserting synchronously after send()', () => {
    // CONTRIBUTING.md:491-512. send() is scheduled, so a getState() read right after it shows the previous state.
    const sample: Fence = fenceWith('CONTRIBUTING.md', "describe('CommandMachine'");
    expect
      .soft(sample.code, 'RDG-34: the it callback is async')
      .toMatch(/\bit\('[^']*',\s*async\s*\(\)\s*=>/);
    expect
      .soft(sample.code, 'RDG-34: the assertion is awaited inside vi.waitFor')
      .toMatch(/await\s+vi\.waitFor\(\s*\(\)\s*=>\s*expect\(/);
    const afterSend: string = sample.code.slice(sample.code.indexOf('machine.send('));
    expect
      .soft(afterSend, 'RDG-34: no bare synchronous expect on the filtered count after send()')
      .not.toMatch(/^\s*expect\(machine\.getState\(\)\.filteredCount\)/m);
  });

  it('DAE-15: examples/vanilla.md declares const machine and disposes it on pagehide unless the page is persisted', () => {
    // apps/docs/examples/vanilla.md:40 (const machine =), :85-89 (pagehide + event.persisted guard). A top-level `using machine` disposes at module end.
    const sample: Fence = fenceWith('apps/docs/examples/vanilla.md', 'createCommandMachine({');
    expect
      .soft(sample.code, 'DAE-15: const machine')
      .toMatch(/^const machine = createCommandMachine\(/m);
    expect
      .soft(sample.code, 'DAE-15: no top-level using machine')
      .not.toMatch(/^(?:await\s+)?using\s+machine\b/m);
    expect
      .soft(sample.code, 'DAE-15: pagehide guarded by persisted, then dispose')
      .toMatch(
        /addEventListener\('pagehide',[\s\S]*?\.persisted\)\s*return;[\s\S]*?machine\[Symbol\.dispose\]\(\)/,
      );
  });

  it('NAR-vanilla-4: examples/vanilla.md Svelte $effect returns a cleanup that calls unsubscribe and machine[Symbol.dispose]', () => {
    // apps/docs/examples/vanilla.md:138-145 (## Building a Svelte 5 Adapter).
    const svelte: string = section(
      read('apps/docs/examples/vanilla.md'),
      /^Building a Svelte 5 Adapter$/,
    );
    const effect: string = /\$effect\(\(\) => \{([\s\S]*?)\n\s*\}\);/.exec(svelte)?.[1] ?? '';
    expect.soft(effect, 'NAR-vanilla-4: the $effect body exists').not.toBe('');
    expect
      .soft(effect, 'NAR-vanilla-4: subscribe keeps the unsubscribe')
      .toMatch(/const unsubscribe = machine\.subscribe\(/);
    const cleanup: string = /return \(\) => \{([\s\S]*?)\};/.exec(effect)?.[1] ?? '';
    expect.soft(cleanup, 'NAR-vanilla-4: the cleanup unsubscribes').toContain('unsubscribe();');
    expect
      .soft(cleanup, 'NAR-vanilla-4: the cleanup disposes the machine')
      .toContain('machine[Symbol.dispose]();');
  });

  it('guard: no fenced script sample declares a module-top-level using machine or await using storage', () => {
    // Column 0 of a fenced sample is module top level: there `using` disposes when the module finishes evaluating (the DAE-15 defect),
    // and `await using` of a storage disposes it before the UI exists. No sample is exempt: a sample that needs disposal wraps it in a function.
    const slashes = (file: string): string => file.replaceAll(String.fromCharCode(92), '/');
    const docs: string[] = globSync('apps/docs/**/*.md', {
      cwd: root,
      exclude: (name: string) => SKIP_DIRS.has(basename(name)),
    }).map(slashes);
    const readmes: string[] = [
      'README.md',
      'CONTRIBUTING.md',
      'ARCHITECTURE.md',
      ...globSync('packages/*/README.md', { cwd: root }).map(slashes),
    ];
    const scanned: string[] = [...docs, ...readmes]
      .filter((file) => existsSync(resolve(root, file)))
      .toSorted();
    expect(
      scanned.length,
      'the scan covers the docs pages, the READMEs, CONTRIBUTING.md and ARCHITECTURE.md',
    ).toBeGreaterThan(10);
    expect(scanned, 'the scan reads CONTRIBUTING.md and ARCHITECTURE.md').toEqual(
      expect.arrayContaining(['CONTRIBUTING.md', 'ARCHITECTURE.md']),
    );

    const found: string[] = [];
    for (const file of scanned) {
      for (const sample of codeFences(read(file))) {
        sample.code.split('\n').forEach((text, index) => {
          if (/^(?:await\s+)?using\s+(?:machine|storage)\b\s*[:=]/.test(text))
            found.push(`${file}:${sample.line + index}`);
        });
      }
    }
    expect
      .soft(found, 'a sample declares a top-level using machine / await using storage at file:line')
      .toEqual([]);
  });
});
