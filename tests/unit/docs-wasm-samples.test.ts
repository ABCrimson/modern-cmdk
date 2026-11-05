// tests/unit/docs-wasm-samples.test.ts
// DG-132: the two React samples of apps/docs/guide/wasm-search.md must dispose the engine on both paths:
// the effect cleanup disposes an engine it holds, and an init that resolves after the cleanup disposes what it received.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root: string = resolve(import.meta.dirname, '../..');
const PAGE = 'apps/docs/guide/wasm-search.md';

/** Every tsx fence of the page (opening line `tsx`, closing line a bare fence). */
function tsxFences(markdown: string): string[] {
  const found: string[] = [];
  const lines: string[] = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^```tsx\b/.test(lines[i] ?? '')) continue;
    const body: string[] = [];
    let j: number = i + 1;
    for (; j < lines.length && (lines[j] ?? '').trim() !== '```'; j++) body.push(lines[j] ?? '');
    found.push(body.join('\n'));
    i = j;
  }
  return found;
}

/** The effect cleanup: the `return () => { ... };` block. */
function cleanupOf(code: string): string {
  return /return \(\) => \{([\s\S]*?)\};/.exec(code)?.[1] ?? '';
}

/** The `if (disposed) { ... }` block of the init path. */
function lateBranchOf(code: string): string {
  return /if \(disposed\) \{([\s\S]*?)\}/.exec(code)?.[1] ?? '';
}

describe('docs wasm-search samples', () => {
  it('DG-132: both wasm-search.md engine samples dispose the engine in the cleanup and when init resolves after it', () => {
    const samples: string[] = tsxFences(readFileSync(resolve(root, PAGE), 'utf8'));
    const main: string | undefined = samples.find((code) =>
      code.includes('createWasmSearchEngine'),
    );
    const worker: string | undefined = samples.find((code) =>
      code.includes('createWorkerSearchEngine'),
    );
    expect(main).toBeDefined();
    expect(worker).toBeDefined();

    const cases: [string, string, string][] = [
      [main ?? '', 'engine?.[Symbol.dispose]()', 'created[Symbol.dispose]()'],
      [worker ?? '', 'engine?.[Symbol.asyncDispose]()', 'created[Symbol.asyncDispose]()'],
    ];
    for (const [code, held, received] of cases) {
      const cleanup: string = cleanupOf(code);
      expect.soft(cleanup).toContain('disposed = true');
      expect.soft(cleanup).toContain(held);
      const late: string = lateBranchOf(code);
      expect.soft(late).toContain(received);
      expect.soft(late).toContain('return;');
    }
  });
});
