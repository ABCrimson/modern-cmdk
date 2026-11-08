// @vitest-environment node
// Tests for the idempotent dispose of the WASM search engines (ledger DG-35).
// Runs without pkg/: the wasm-bindgen module is replaced with vi.doMock, and the fallback path
// gets a fake modern-cmdk engine, so nothing here loads real WASM.

import type { ItemId } from 'modern-cmdk';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FallbackSearchEngine, WasmSearchEngine } from './wasm-engine.js';

// Vite's import analysis resolves the literal import of pkg/command_search_wasm.js in wasm-engine.ts when it
// transforms the file, and fails when pkg/ (gitignored wasm-pack output) is absent. vi.doMock cannot help
// there, so the suite plants an empty placeholder when pkg/ has no module and removes it afterwards;
// every test replaces the module through vi.doMock, so the placeholder is never executed.
// No @types/node in this package, so node:fs comes from process.getBuiltinModule (typed locally).
type Fs = {
  existsSync(p: URL): boolean;
  mkdirSync(p: URL, o: { recursive: true }): string | undefined;
  writeFileSync(p: URL, data: string): void;
  rmSync(p: URL, o: { recursive?: true; force: true }): void;
};
const fs = (
  globalThis as unknown as { process: { getBuiltinModule(id: 'node:fs'): Fs } }
).process.getBuiltinModule('node:fs');
const pkgDir = new URL('../pkg/', import.meta.url);
const placeholder = new URL('command_search_wasm.js', pkgDir);
let plantedPkgDir = false;
let plantedPlaceholder = false;

beforeAll(() => {
  if (fs.existsSync(placeholder)) return;
  plantedPkgDir = !fs.existsSync(pkgDir);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(placeholder, 'export class WasmSearchEngine {}\n');
  plantedPlaceholder = true;
});

afterAll(() => {
  if (plantedPkgDir) fs.rmSync(pkgDir, { recursive: true, force: true });
  else if (plantedPlaceholder) fs.rmSync(placeholder, { force: true });
});

const PKG_ID = '../pkg/command_search_wasm.js';

/** Counts the calls that reach the (fake) wasm-bindgen instance. */
const calls = { free: 0, clear: 0, indexItems: 0, search: 0 };

class FakeWasmInstance {
  free(): void {
    calls.free++;
  }
  clear(): void {
    calls.clear++;
  }
  index_items(_items: string): void {
    calls.indexItems++;
  }
  search(_query: string, _max: number): unknown[] {
    calls.search++;
    return [{ id: 'a', score: 1, matches: [[0, 1]] }];
  }
}

async function loadWasmEngine(): Promise<WasmSearchEngine> {
  vi.resetModules();
  vi.doMock(PKG_ID, () => ({ WasmSearchEngine: FakeWasmInstance }));
  const { createWasmSearchEngine } = await import('./wasm-engine.js');
  const engine = await createWasmSearchEngine();
  if (!engine.isWasm) throw new Error('expected the WASM engine');
  return engine;
}

beforeEach(() => {
  calls.free = calls.clear = calls.indexItems = calls.search = 0;
});

afterEach(() => {
  vi.doUnmock(PKG_ID);
  vi.doUnmock('modern-cmdk');
});

describe('WASM engine dispose', () => {
  it('frees the instance once for sync then sync', async () => {
    const engine = await loadWasmEngine();
    engine[Symbol.dispose]();
    engine[Symbol.dispose]();
    expect(calls.free).toBe(1);
  });

  it('frees the instance once for async then async', async () => {
    const engine = await loadWasmEngine();
    await engine[Symbol.asyncDispose]();
    await engine[Symbol.asyncDispose]();
    expect(calls.free).toBe(1);
  });

  it('frees the instance once for sync then async', async () => {
    const engine = await loadWasmEngine();
    engine[Symbol.dispose]();
    await engine[Symbol.asyncDispose]();
    expect(calls.free).toBe(1);
  });

  it('frees the instance once for async then sync', async () => {
    const engine = await loadWasmEngine();
    await engine[Symbol.asyncDispose]();
    engine[Symbol.dispose]();
    expect(calls.free).toBe(1);
  });

  it('frees the instance once when `await using` follows a manual dispose', async () => {
    const engine = await loadWasmEngine();
    {
      await using scoped = engine;
      scoped[Symbol.dispose]();
    }
    expect(calls.free).toBe(1);
  });

  it('search after dispose throws a clear error without touching the instance', async () => {
    const engine = await loadWasmEngine();
    engine[Symbol.dispose]();
    expect(() => [...engine.search('a', [{ id: 'a' as ItemId, value: 'a' }])]).toThrow(/disposed/);
    expect(calls.search).toBe(0);
  });

  it('index, remove and clear after dispose throw without touching the instance', async () => {
    const engine = await loadWasmEngine();
    engine[Symbol.dispose]();
    expect(() => engine.index([{ id: 'a' as ItemId, value: 'a' }])).toThrow(/disposed/);
    expect(() => engine.remove(new Set())).toThrow(/disposed/);
    expect(() => engine.clear()).toThrow(/disposed/);
    expect(calls.indexItems).toBe(0);
    expect(calls.clear).toBe(0);
  });

  it('still searches before dispose', async () => {
    const engine = await loadWasmEngine();
    const results = [...engine.search('a', [{ id: 'a' as ItemId, value: 'a' }])];
    expect(results).toEqual([{ id: 'a', score: 1, matches: [[0, 1]] }]);
    expect(calls.search).toBe(1);
  });
});

describe('fallback engine dispose', () => {
  async function loadFallback(): Promise<{
    engine: FallbackSearchEngine;
    tsDispose: ReturnType<typeof vi.fn>;
  }> {
    const tsDispose = vi.fn();
    vi.resetModules();
    vi.doMock(PKG_ID, () => {
      throw new Error('no wasm');
    });
    vi.doMock('modern-cmdk', () => ({
      createSearchEngine: () => ({
        index: () => {},
        search: function* (): Generator<never> {},
        remove: () => {},
        clear: () => {},
        [Symbol.dispose]: tsDispose,
      }),
    }));
    const { createWasmSearchEngine } = await import('./wasm-engine.js');
    const engine = await createWasmSearchEngine();
    if (engine.isWasm) throw new Error('expected the fallback engine');
    return { engine, tsDispose };
  }

  it('forwards a double sync dispose once', async () => {
    const { engine, tsDispose } = await loadFallback();
    engine[Symbol.dispose]();
    engine[Symbol.dispose]();
    expect(tsDispose).toHaveBeenCalledTimes(1);
  });

  it('forwards sync then async dispose once', async () => {
    const { engine, tsDispose } = await loadFallback();
    engine[Symbol.dispose]();
    await engine[Symbol.asyncDispose]();
    expect(tsDispose).toHaveBeenCalledTimes(1);
  });

  it('forwards async then sync dispose once', async () => {
    const { engine, tsDispose } = await loadFallback();
    await engine[Symbol.asyncDispose]();
    engine[Symbol.dispose]();
    expect(tsDispose).toHaveBeenCalledTimes(1);
  });

  it('forwards a double async dispose once', async () => {
    const { engine, tsDispose } = await loadFallback();
    await engine[Symbol.asyncDispose]();
    await engine[Symbol.asyncDispose]();
    expect(tsDispose).toHaveBeenCalledTimes(1);
  });
});
