// @vitest-environment node
// Tests for the idempotent dispose of the WASM search engines (ledger DG-35).
// Runs without pkg/: the wasm-bindgen module is replaced with vi.doMock, and the fallback path
// gets a fake modern-cmdk engine, so nothing here loads real WASM.

import type { ItemId } from 'modern-cmdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FallbackSearchEngine, WasmSearchEngine } from './wasm-engine.js';

// pkg/ (gitignored wasm-pack output) may be absent. Without it the import in wasm-engine.ts is unresolvable, stays
// root-relative at runtime, and vi.doMock keys on the resolved path, so the mock would never match.
// tests/vitest-plugins/wasm-pkg-virtual.ts resolves that specifier to one virtual module with or without pkg/.

const PKG_ID = '../pkg/command_search_wasm.js';

/** Counts the calls that reach the (fake) wasm-bindgen instance. */
const calls = { free: 0, clear: 0, indexItems: 0, search: 0 };

/** The payloads `index_items` received, in call order. */
const payloads: string[] = [];

/** The limits `search` received, and what the fake crate returns for it. */
const searchLimits: number[] = [];
let searchReturns: unknown[] = [{ id: 'a', score: 1, matches: [[0, 1]] }];

class FakeWasmInstance {
  free(): void {
    calls.free++;
  }
  clear(): void {
    calls.clear++;
  }
  index_items(items: string): void {
    calls.indexItems++;
    payloads.push(items);
  }
  search(_query: string, max: number): unknown[] {
    calls.search++;
    searchLimits.push(max);
    return searchReturns;
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
  payloads.length = 0;
  searchLimits.length = 0;
  searchReturns = [{ id: 'a', score: 1, matches: [[0, 1]] }];
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

describe('WASM engine index map', () => {
  const a = { id: 'a' as ItemId, value: 'Alpha' };
  const b = { id: 'b' as ItemId, value: 'Beta' };
  const c = { id: 'c' as ItemId, value: 'Gamma' };

  it('CE-116: index() upserts into the kept map and hands the crate every indexed item', async () => {
    const engine = await loadWasmEngine();
    engine.index([a, b]);
    engine.index([c]);
    expect(payloads.map((p) => JSON.parse(p))).toEqual([
      [
        ['a', 'Alpha'],
        ['b', 'Beta'],
      ],
      [
        ['a', 'Alpha'],
        ['b', 'Beta'],
        ['c', 'Gamma'],
      ],
    ]);
  });

  it('CE-116: index() replaces the value of an id that is already indexed, in place', async () => {
    const engine = await loadWasmEngine();
    engine.index([a, b]);
    engine.index([{ id: 'a' as ItemId, value: 'Alpha 2' }]);
    expect(JSON.parse(payloads.at(-1) ?? '[]')).toEqual([
      ['a', 'Alpha 2'],
      ['b', 'Beta'],
    ]);
  });

  it('CE-116: remove() deletes only the given ids and re-indexes the rest', async () => {
    const engine = await loadWasmEngine();
    engine.index([a, b, c]);
    engine.remove(new Set(['b' as ItemId, 'missing' as ItemId]));
    expect(calls.clear).toBe(0);
    expect(JSON.parse(payloads.at(-1) ?? '[]')).toEqual([
      ['a', 'Alpha'],
      ['c', 'Gamma'],
    ]);
  });

  it('CE-116: clear() empties the kept map and the crate index', async () => {
    const engine = await loadWasmEngine();
    engine.index([a, b]);
    engine.clear();
    expect(calls.clear).toBe(1);
    engine.index([c]);
    expect(JSON.parse(payloads.at(-1) ?? '[]')).toEqual([['c', 'Gamma']]);
  });
});

describe('WASM engine search candidates', () => {
  const hit = (id: string, score: number): unknown => ({ id, score, matches: [[0, 1]] });
  const a = { id: 'a' as ItemId, value: 'Alpha' };
  const b = { id: 'b' as ItemId, value: 'Beta' };

  it('W44: search() returns only ids among the passed items', async () => {
    const engine = await loadWasmEngine();
    engine.index([
      { id: 'a' as ItemId, value: 'Alpha' },
      { id: 'b' as ItemId, value: 'Beta' },
      { id: 'c' as ItemId, value: 'Gamma' },
    ]);
    searchReturns = [hit('c', 1), hit('a', 0.8), hit('b', 0.5)];
    const ids = [...engine.search('x', [a, b])].map((r) => r.id);
    expect(ids).toEqual(['a', 'b']);
  });

  it('W44: the result limit is not starved by the filtered-out ids', async () => {
    const engine = await loadWasmEngine();
    engine.index([
      { id: 'a' as ItemId, value: 'Alpha' },
      { id: 'b' as ItemId, value: 'Beta' },
      { id: 'c' as ItemId, value: 'Gamma' },
    ]);
    [...engine.search('x', [a])];
    expect(searchLimits).toEqual([3]);
  });
});

describe('fallback engine dispose', () => {
  async function loadFallback(): Promise<{
    engine: FallbackSearchEngine;
    tsDispose: ReturnType<typeof vi.fn>;
  }> {
    const tsDispose = vi.fn();
    vi.resetModules();
    vi.doMock(PKG_ID, () => ({
      WasmSearchEngine: class {
        constructor() {
          throw new Error('no wasm');
        }
      },
    }));
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
