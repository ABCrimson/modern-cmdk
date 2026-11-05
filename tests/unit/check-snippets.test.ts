// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the strings are VS Code snippet syntax, not templates
// tests/unit/check-snippets.test.ts
// CV-43: the snippet gate. expandBody is pure; the 'check-snippets runs' suite spawns the script with real tsc on a
// throwaway package (--package) and harness (--harness) into a directory under node_modules/.cache (--out).

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { expandBody, snippetFiles } from '../../scripts/check-snippets.ts';

const ROOT: string = resolve(import.meta.dirname, '../..');
const SCRIPT: string = join(ROOT, 'scripts/check-snippets.ts');
const scratch: string = mkdtempSync(join(tmpdir(), 'check-snippets-'));
const outDir: string = join(ROOT, 'node_modules/.cache', `check-snippets-test-${process.pid}`);

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
  rmSync(outDir, { recursive: true, force: true });
});

function run(
  packageDir: string,
  harness: string,
): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync(
    process.execPath,
    [SCRIPT, '--package', packageDir, '--harness', harness, '--out', outDir],
    { cwd: ROOT, encoding: 'utf8' },
  );
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

function fixture(
  name: string,
  snippets: Record<string, unknown>,
  harness: Record<string, unknown>,
): {
  packageDir: string;
  harness: string;
} {
  const packageDir: string = join(scratch, name);
  mkdirSync(join(packageDir, 'src'), { recursive: true });
  writeFileSync(
    join(packageDir, 'package.json'),
    JSON.stringify({
      contributes: { snippets: [{ language: 'typescriptreact', path: './src/s.json' }] },
    }),
  );
  writeFileSync(join(packageDir, 'src/s.json'), JSON.stringify(snippets));
  const harnessPath: string = join(packageDir, 'harness.json');
  writeFileSync(harnessPath, JSON.stringify(harness));
  return { packageDir, harness: harnessPath };
}

describe('check-snippets expandBody', () => {
  it('CV-43: placeholders, choices, nested defaults and variables expand', () => {
    expect(expandBody('function ${1:Name}() {}')).toBe('function Name() {}');
    expect(expandBody('storage: ${1|new A(),new B()|};')).toBe('storage: new A();');
    expect(expandBody('${1:outer ${2:inner} tail}')).toBe('outer inner tail');
    expect(expandBody('onSelect: () => ${3:{}}')).toBe('onSelect: () => {}');
    expect(expandBody('a $1 b ${2} c $0')).toBe('a  b  c ');
    expect(expandBody('${TM_FILENAME_BASE} $TM_SELECTED_TEXT ${TM_DIRECTORY:fallback}')).toBe(
      'Example Example Example',
    );
    expect(expandBody(['line one', '${1:two}'])).toBe('line one\ntwo');
    expect(expandBody(String.raw`cost \$5 \${1:kept}`)).toBe('cost $5 ${1:kept}');
    expect(() => expandBody('${1:unterminated')).toThrow(/unterminated/);
    expect(() => expandBody('$HOME')).toThrow(/unsupported snippet variable/);
  });

  it('CV-43: the real manifest lists snippets.json as tsx and snippets-core.json as ts', () => {
    const files = snippetFiles();
    expect(files.map((f) => [f.path.split(/[\\/]/).pop(), f.extension])).toEqual([
      ['snippets.json', 'tsx'],
      ['snippets-core.json', 'ts'],
    ]);
    expect(readFileSync(files[0]?.path ?? '', 'utf8')).toContain('cmd-basic');
  });
});

describe('check-snippets runs', () => {
  const snippets = {
    Frag: { prefix: 'cmd-frag', body: ['<div>${1:x}</div>'] },
  };

  it('CV-43: a fragment without a harness entry fails the check', () => {
    const { packageDir, harness } = fixture('missing', snippets, {});
    const result = run(packageDir, harness);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'cmd-frag: a fragment (no import or export) needs a harness entry',
    );
  });

  it('passes a fragment once its harness entry wraps it, and reports an entry that names no snippet', () => {
    const wrapper = ['export const Probe = () => (', '{{body}}', ');'];
    const ok = fixture('wrapped', snippets, { Frag: { wrapper } });
    const pass = run(ok.packageDir, ok.harness);
    expect(pass.stderr).toBe('');
    expect(pass.status).toBe(0);
    expect(pass.stdout).toContain('1 snippets checked');

    const stale = fixture('stale', snippets, { Frag: { wrapper }, Gone: { wrapper } });
    const result = run(stale.packageDir, stale.harness);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('harness entry "Gone" names no snippet');
  });

  it('prints a type error as <prefix>:<line> counted in the expanded body', () => {
    const bad = fixture(
      'bad',
      { Bad: { prefix: 'cmd-bad', body: ['export const a = 1;', 'export const b: string = a;'] } },
      {},
    );
    const result = run(bad.packageDir, bad.harness);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^cmd-bad:2: error TS2322/m);
  });

  it('exits 2 on an unknown flag and on an --out outside node_modules/.cache', () => {
    const flag = spawnSync(process.execPath, [SCRIPT, '--nope'], { cwd: ROOT, encoding: 'utf8' });
    expect(flag.status).toBe(2);
    const out = spawnSync(process.execPath, [SCRIPT, '--out', scratch], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(out.status).toBe(2);
  });
});
