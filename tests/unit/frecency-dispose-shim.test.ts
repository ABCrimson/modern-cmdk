import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// CE-30: a runtime without Symbol.dispose / Symbol.asyncDispose (Safari, which only ships them as a
// preview) makes the computed `[Symbol.dispose]` and `[Symbol.asyncDispose]` keys collapse to the
// string 'undefined', so the second method overwrites the first. Node 28 has both natively
// (non-configurable), so the test swaps globalThis.Symbol for a stand-in without them and loads
// the core entry afresh.

const RealSymbol: SymbolConstructor = globalThis.Symbol;

/** A Symbol stand-in that copies every own property of the real one except dispose and asyncDispose. */
function symbolWithoutDisposal(): SymbolConstructor {
  const standIn = function standIn(description?: string | number): symbol {
    return RealSymbol(description);
  } as unknown as SymbolConstructor;
  for (const key of Reflect.ownKeys(RealSymbol)) {
    if (key === 'dispose' || key === 'asyncDispose' || key === 'prototype') continue;
    const descriptor = Object.getOwnPropertyDescriptor(RealSymbol, key);
    if (descriptor === undefined) continue;
    // The stand-in is a plain function: its own `name` and `length` stay.
    if (key === 'name' || key === 'length') continue;
    Object.defineProperty(standIn, key, { ...descriptor, configurable: true });
  }
  Object.defineProperty(standIn, 'prototype', { value: RealSymbol.prototype });
  return standIn;
}

type Core = typeof import('../../packages/modern-cmdk/src/core/index.ts');

async function loadCoreWithoutDisposeSymbols(): Promise<Core> {
  vi.resetModules();
  globalThis.Symbol = symbolWithoutDisposal();
  try {
    return await import('../../packages/modern-cmdk/src/core/index.ts');
  } finally {
    globalThis.Symbol = RealSymbol;
  }
}

describe('CE-30: disposal keys without native Symbol.dispose', () => {
  afterEach(() => {
    globalThis.Symbol = RealSymbol;
    vi.resetModules();
  });

  it('CE-30: the stand-in really lacks the well-known disposal symbols', () => {
    const standIn = symbolWithoutDisposal();
    expect(standIn.dispose).toBeUndefined();
    expect(standIn.asyncDispose).toBeUndefined();
    expect(standIn.iterator).toBe(RealSymbol.iterator);
  });

  it.each(['FrecencyEngine', 'IdbFrecencyStorage'] as const)(
    'CE-30: %s keeps distinct registered-symbol keys for dispose and asyncDispose',
    async (name) => {
      const core = await loadCoreWithoutDisposeSymbols();
      const proto = core[name].prototype as object;
      const syncKey = RealSymbol.for('Symbol.dispose');
      const asyncKey = RealSymbol.for('Symbol.asyncDispose');

      expect(syncKey).not.toBe(asyncKey);
      expect(Reflect.ownKeys(proto)).toEqual(expect.arrayContaining([syncKey, asyncKey]));
      expect(Object.getOwnPropertyNames(proto)).not.toContain('undefined');
      const sync: unknown = Reflect.get(proto, syncKey);
      const async: unknown = Reflect.get(proto, asyncKey);
      expect(sync).toBeTypeOf('function');
      expect(async).toBeTypeOf('function');
      expect(sync).not.toBe(async);
    },
  );

  it('CE-30: no exported class of the core entry has an own prototype key "undefined"', async () => {
    // Fails if a later import order evaluates a disposal class before the shim.
    const core = await loadCoreWithoutDisposeSymbols();
    const syncKey = RealSymbol.for('Symbol.dispose');
    const exported: Record<string, unknown> = { ...core };
    const classes = Object.entries(exported).flatMap(([name, value]) => {
      if (typeof value !== 'function') return [];
      const proto: unknown = value.prototype;
      return typeof proto === 'object' && proto !== null && Reflect.ownKeys(proto).length > 1
        ? [[name, proto] as const]
        : [];
    });
    expect(classes.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        'FrecencyEngine',
        'IdbFrecencyStorage',
        'MemoryFrecencyStorage',
        'CommandRegistry',
        'KeyboardShortcutRegistry',
        'TypedEmitter',
      ]),
    );
    for (const [, proto] of classes) {
      expect(Object.getOwnPropertyNames(proto)).not.toContain('undefined');
    }
    for (const name of [
      'MemoryFrecencyStorage',
      'CommandRegistry',
      'KeyboardShortcutRegistry',
      'TypedEmitter',
    ] as const) {
      expect(Reflect.get(core[name].prototype as object, syncKey)).toBeTypeOf('function');
    }
  });

  it('CE-30: the asyncDispose method returns a promise', async () => {
    // Keep the stand-in installed for the call: the method bodies look Symbol.dispose up at call
    // time, and on a real runtime without the symbol the shim's assignment is global.
    vi.resetModules();
    globalThis.Symbol = symbolWithoutDisposal();
    try {
      const core = await import('../../packages/modern-cmdk/src/core/index.ts');
      const engine = new core.FrecencyEngine({ storage: new core.MemoryFrecencyStorage() });
      const asyncDispose = Reflect.get(
        Object.getPrototypeOf(engine) as object,
        Symbol.for('Symbol.asyncDispose'),
      ) as () => unknown;
      const result = asyncDispose.call(engine);
      expect(result).toBeInstanceOf(Promise);
      await result;
    } finally {
      globalThis.Symbol = RealSymbol;
    }
  });

  it('CE-30: the shim leaves the native well-known symbols alone', async () => {
    // Node has both natively and non-writable: a plain assignment in the shim would throw in
    // strict-mode ESM, and an overwrite would change them.
    const nativeDispose = RealSymbol.dispose;
    const nativeAsyncDispose = RealSymbol.asyncDispose;
    expect(nativeDispose).toBeTypeOf('symbol');
    expect(nativeAsyncDispose).toBeTypeOf('symbol');

    vi.resetModules();
    const core = await import('../../packages/modern-cmdk/src/core/index.ts');

    expect(core.FrecencyEngine).toBeTypeOf('function');
    expect(globalThis.Symbol).toBe(RealSymbol);
    expect(RealSymbol.dispose).toBe(nativeDispose);
    expect(RealSymbol.asyncDispose).toBe(nativeAsyncDispose);
    expect(RealSymbol.dispose).not.toBe(RealSymbol.for('Symbol.dispose'));
    expect(Reflect.get(core.FrecencyEngine.prototype, nativeDispose)).toBeTypeOf('function');
  });

  it('CE-30: core/index.ts keeps ./frecency/idb-storage.js as its first runtime import or export', () => {
    // The disposal shim sits atop that module; Biome sorts exports, so an added
    // `export { x } from './cache.js'` would sort first and evaluate a class before the shim.
    const source = readFileSync(
      join(import.meta.dirname, '../../packages/modern-cmdk/src/core/index.ts'),
      'utf8',
    );
    const first = /^(?:import|export)\s+(?!type\b)[^;]*?\sfrom\s+'([^']+)';/m.exec(source);
    expect(
      first?.[1],
      'the CE-30 shim lives atop ./frecency/idb-storage.js and must evaluate before any class with a disposal key',
    ).toBe('./frecency/idb-storage.js');
  });
});
