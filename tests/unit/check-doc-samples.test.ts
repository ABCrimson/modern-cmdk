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
