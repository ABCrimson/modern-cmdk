// tests/unit/check-doc-samples.test.ts
// TEB-84: the docs-samples gate. extractSamples, mapDiagnostic and importsWasm are pure; the 'check-doc-samples runs' suite spawns the script with real tsc on a fixture page (--root) into a directory under node_modules/.cache (--out), covering --skip-wasm and the generated tsconfig.

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_FILES,
  extractSamples,
  importsWasm,
  mapDiagnostic,
} from '../../scripts/check-doc-samples.ts';

const md = [
  '# Title', // 1
  '', // 2
  '```ts', // 3
  "import { a } from 'modern-cmdk';", // 4
  'a();', // 5
  '```', // 6
  '', // 7
  '```tsx [After (modern-cmdk/react)]', // 8
  'export const X = () => <div />;', // 9
  '```', // 10
  '```bash', // 11
  'pnpm add x', // 12
  '```', // 13
  '```tsx fragment', // 14
  '<Command />', // 15
  '```', // 16
  '::: code-group', // 17
  '```typescript [Vite]', // 18
  'const v = 1;', // 19
  '```', // 20
  ':::', // 21
  '```js', // 22
  'const j = 1;', // 23
  '```', // 24
].join('\n');

describe('extractSamples', () => {
  it('returns ts, tsx and typescript fences with page and start line (first body line)', () => {
    const { samples } = extractSamples(md, 'guide/x.md');
    expect(samples.map((s) => [s.page, s.line, s.lang])).toEqual([
      ['guide/x.md', 4, 'ts'],
      ['guide/x.md', 9, 'tsx'],
      ['guide/x.md', 19, 'typescript'],
    ]);
    expect(samples[0]?.code).toBe("import { a } from 'modern-cmdk';\na();");
  });

  it('skips a fence whose info string contains the word fragment and counts it', () => {
    const { samples, fragments } = extractSamples(md, 'guide/x.md');
    expect(fragments).toBe(1);
    expect(samples.some((s) => s.code.includes('<Command />'))).toBe(false);
  });

  it('does not treat a fragment-like substring as the word', () => {
    const { samples, fragments } = extractSamples('```ts [fragmentary]\nlet a = 1;\n```', 'p.md');
    expect(fragments).toBe(0);
    expect(samples).toHaveLength(1);
  });
});

describe('mapDiagnostic', () => {
  it('maps a generated file line back to page:line', () => {
    expect(mapDiagnostic('guide__x-L4.ts', 3)).toBe('guide/x.md:6');
  });
});

// The script's own runs: --root points at a fixture page, --out at a directory under node_modules/.cache
// (never the default directory, which a sibling run may own). tsc is real, so these take a few seconds.
describe('check-doc-samples runs', () => {
  const repo: string = resolve(import.meta.dirname, '../..');
  const script: string = join(repo, 'scripts/check-doc-samples.ts');
  const created: string[] = [];

  function fixture(): { root: string; out: string } {
    mkdirSync(join(repo, 'node_modules/.cache'), { recursive: true });
    const root: string = mkdtempSync(join(repo, 'node_modules/.cache/doc-samples-fixture-'));
    const out: string = `${root}-out`;
    created.push(root, out);
    writeFileSync(
      join(root, 'page.md'),
      [
        '```ts',
        "import type { Engine } from 'modern-cmdk-search-wasm';",
        'export type E = Engine;',
        '```',
        '',
        '```ts',
        'export const plain: number = 1;',
        '```',
        '',
      ].join('\n'),
    );
    return { root, out };
  }

  function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  afterAll(() => {
    for (const dir of created) rmSync(dir, { recursive: true, force: true });
  });

  it('--skip-wasm checks only the sample that does not import modern-cmdk-search-wasm', () => {
    const { root, out } = fixture();
    const result = run(['--root', root, '--out', out, '--skip-wasm']);
    expect(result.stdout).toContain(
      'check-doc-samples: 1 samples checked, 0 fragments skipped, 1 wasm samples skipped (--skip-wasm)',
    );
    expect(result.status).toBe(0);
    expect(readdirSync(out).filter((f) => f.startsWith('page-'))).toHaveLength(1);
  });

  it('without the flag both samples are checked and no wasm clause is printed', () => {
    const { root, out } = fixture();
    const result = run(['--root', root, '--out', out]);
    expect(result.stdout).toContain('check-doc-samples: 2 samples checked, 0 fragments skipped\n');
    expect(result.stdout).not.toContain('wasm samples skipped');
    expect(readdirSync(out).filter((f) => f.startsWith('page-'))).toHaveLength(2);
  });

  it('rejects an --out outside node_modules/.cache with exit 2 and deletes nothing', () => {
    const { root } = fixture();
    const outside: string = mkdtempSync(join(tmpdir(), 'doc-samples-outside-'));
    created.push(outside);
    writeFileSync(join(outside, 'keep.txt'), 'x');
    const result = run(['--root', root, '--out', outside]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--out must be a directory under node_modules/.cache');
    expect(existsSync(join(outside, 'keep.txt'))).toBe(true);
  });

  it('--out receives the samples and a tsconfig whose extends resolves from there', () => {
    const { root, out } = fixture();
    run(['--root', root, '--out', out, '--skip-wasm']);
    const names: string[] = readdirSync(out);
    expect(names).toContain('tsconfig.json');
    expect(names).toContain('css.d.ts');
    const tsconfig = JSON.parse(readFileSync(join(out, 'tsconfig.json'), 'utf8')) as {
      extends: string;
    };
    expect(existsSync(resolve(out, tsconfig.extends))).toBe(true);
  });
});

describe('importsWasm', () => {
  it('matches the import, export-from, side-effect and import() forms and subpaths', () => {
    expect(importsWasm("import { a } from 'modern-cmdk-search-wasm';")).toBe(true);
    expect(importsWasm('export * from "modern-cmdk-search-wasm";')).toBe(true);
    expect(importsWasm("import 'modern-cmdk-search-wasm';")).toBe(true);
    expect(importsWasm("const m = await import('modern-cmdk-search-wasm');")).toBe(true);
    expect(importsWasm("import x from 'modern-cmdk-search-wasm/pkg';")).toBe(true);
  });

  it('ignores other specifiers and mentions in prose or strings', () => {
    expect(importsWasm("import { a } from 'modern-cmdk';")).toBe(false);
    expect(importsWasm("import { a } from 'modern-cmdk-search-wasm-extra';")).toBe(false);
    expect(importsWasm("const s = 'modern-cmdk-search-wasm';")).toBe(false);
  });
});

describe('DEFAULT_FILES', () => {
  it('W7-02: lists the root README and the README of every package, and each file exists', () => {
    expect([...DEFAULT_FILES].sort()).toEqual([
      'README.md',
      'packages/command-search-wasm/README.md',
      'packages/create-modern-cmdk/README.md',
      'packages/modern-cmdk-codemod/README.md',
      'packages/modern-cmdk/README.md',
      'packages/vscode-modern-cmdk/README.md',
    ]);
    for (const file of DEFAULT_FILES) {
      expect(existsSync(resolve(import.meta.dirname, '../..', file)), file).toBe(true);
    }
  });
});

// The layout rules of the published READMEs (scripts/readme-rules.ts, unit-tested in readme-rules.test.ts) run inside the gate:
// a fixture root holds packages/<name>/README.md pages, the script prints page:line: message and exits 1.
describe('check-doc-samples: the layout rules of the published READMEs', () => {
  const repo: string = resolve(import.meta.dirname, '../..');
  const script: string = join(repo, 'scripts/check-doc-samples.ts');
  const created: string[] = [];

  /** A fixture root with the given pages, each a path under the root and its lines. */
  function fixture(pages: Record<string, string[]>): { root: string; out: string } {
    mkdirSync(join(repo, 'node_modules/.cache'), { recursive: true });
    const root: string = mkdtempSync(join(repo, 'node_modules/.cache/doc-samples-layout-'));
    const out: string = `${root}-out`;
    created.push(root, out);
    for (const [page, lines] of Object.entries(pages)) {
      mkdirSync(join(root, page, '..'), { recursive: true });
      writeFileSync(join(root, page), `${lines.join('\n')}\n`);
    }
    return { root, out };
  }

  function run(
    root: string,
    out: string,
  ): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(process.execPath, [script, '--root', root, '--out', out], {
      cwd: repo,
      encoding: 'utf8',
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  afterAll(() => {
    for (const dir of created) rmSync(dir, { recursive: true, force: true });
  });

  const sample = ['```ts', 'export const plain: number = 1;', '```'];

  it('passes a published README whose fences are 78 columns or fewer and whose spans can wrap', () => {
    const { root, out } = fixture({
      'packages/modern-cmdk/README.md': [
        ...sample,
        '```sh',
        `npm install ${'x'.repeat(78 - 'npm install '.length)}`,
        '```',
        'Use `modern-cmdk/react/dialog` for the dialog.',
      ],
    });
    const result = run(root, out);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      'check-doc-samples: 1 published READMEs checked for layout, 0 violations',
    );
    expect(result.status).toBe(0);
  });

  it('A1-10: fails a sample line over 78 columns and an unbreakable span over 28, with page:line', () => {
    const { root, out } = fixture({
      'packages/modern-cmdk/README.md': [
        'Figures come from `benchmarks/size-history/1.7.0.json`.', // 1
        ...sample, // 2-4
        '```ts', // 5
        `export const wide = '${'w'.repeat(100)}';`, // 6
        '```', // 7
      ],
    });
    const result = run(root, out);
    expect(result.status).toBe(1);
    const lines: string[] = result.stderr.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(
      'packages/modern-cmdk/README.md:1: inline code `benchmarks/size-history/1.7.0.json` is 34 characters',
    );
    expect(lines[1]).toContain(
      'packages/modern-cmdk/README.md:6: fence line is 123 characters, the limit is 78',
    );
    expect(result.stdout).toContain('1 published READMEs checked for layout, 2 violations');
  });

  it('binds the three published READMEs and no other page', () => {
    const wide = ['```text', 'y'.repeat(120), '```'];
    const { root, out } = fixture({
      'packages/modern-cmdk/README.md': sample,
      'packages/create-modern-cmdk/README.md': wide,
      'packages/modern-cmdk-codemod/README.md': wide,
      'README.md': wide,
      'packages/vscode-modern-cmdk/README.md': wide,
      'guide/page.md': wide,
    });
    const result = run(root, out);
    expect(result.status).toBe(1);
    const lines: string[] = result.stderr.trim().split('\n');
    expect(lines.map((l) => l.split(':')[0]).sort()).toEqual([
      'packages/create-modern-cmdk/README.md',
      'packages/modern-cmdk-codemod/README.md',
    ]);
    expect(result.stdout).toContain('3 published READMEs checked for layout, 2 violations');
  });

  it('says nothing about layout when the scanned root holds no published README', () => {
    const { root, out } = fixture({ 'README.md': ['```text', 'z'.repeat(120), '```', ...sample] });
    const result = run(root, out);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('published READMEs');
  });
});
