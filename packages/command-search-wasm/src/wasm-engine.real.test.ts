// CE-116: the main-thread engine against the real wasm-pack build in pkg/ (gitignored build output).
// Skips without pkg/; MODERN_CMDK_REQUIRE_WASM_PKG=1 turns that skip into a failure, so the CI job that builds pkg/
// proves these tests ran. No @types/node in this package, so node:fs comes from process.getBuiltinModule.
// The default happy-dom environment stays: the machine's scheduler batches on requestAnimationFrame, which node lacks.
import { createCommandMachine, type ItemId, itemId } from 'modern-cmdk';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WasmSearchEngine } from './wasm-engine.js';

type Fs = { existsSync(p: string): boolean; readFileSync(p: string): Uint8Array };
type Process = {
  env: Record<string, string | undefined>;
  getBuiltinModule(id: 'node:fs'): Fs;
  getBuiltinModule(id: 'node:url'): { fileURLToPath(url: string): string };
};
const proc: Process = (globalThis as unknown as { process: Process }).process;
const fs = proc.getBuiltinModule('node:fs');

const PKG_ID = '../pkg/command_search_wasm.js';
// Plain paths: happy-dom replaces the global URL class, which node:fs does not accept as a file URL.
const pkgDir = `${proc
  .getBuiltinModule('node:url')
  .fileURLToPath(import.meta.url)
  .replace(/[/\\][^/\\]*$/, '')}/../pkg`;
const gluePath = `${pkgDir}/command_search_wasm.js`;
const wasmPath = `${pkgDir}/command_search_wasm_bg.wasm`;
const hasPkg = fs.existsSync(gluePath) && fs.existsSync(wasmPath);
const required = proc.env.MODERN_CMDK_REQUIRE_WASM_PKG === '1';
// Required and absent: the tests run and fail in requirePkg() instead of skipping.
const skip = !hasPkg && !required;

function requirePkg(): void {
  expect(hasPkg, 'packages/command-search-wasm/pkg is missing: run `pnpm build:wasm` first').toBe(
    true,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock(PKG_ID);
});

/**
 * Builds the engine over the real wasm module. The unit project resolves the pkg/ specifier to a placeholder module
 * (tests/vitest-plugins/wasm-pkg-virtual.ts), so the real glue is imported under a query the plugin does not match and
 * handed to wasm-engine.ts through vi.doMock. The `--target web` glue also needs its wasm instantiated before
 * `new WasmSearchEngine()` works (createWasmSearchEngine does not do that yet, ledger W01), so `initSync` runs here;
 * without it the constructor throws and the engine silently falls back to the TypeScript scorer.
 */
async function realEngine(): Promise<WasmSearchEngine> {
  requirePkg();
  const real = (await import(
    /* @vite-ignore */ `${gluePath}?real`
  )) as typeof import('../pkg/command_search_wasm.js');
  real.initSync({ module: fs.readFileSync(wasmPath) });
  vi.resetModules();
  vi.doMock(PKG_ID, () => real);
  const { createWasmSearchEngine } = await import('./wasm-engine.js');
  const engine = await createWasmSearchEngine();
  if (!engine.isWasm) throw new Error('expected the real WASM engine, got the TypeScript fallback');
  return engine;
}

const entry = (id: string, value: string): { id: ItemId; value: string } => ({
  id: itemId(id),
  value,
});

it.skipIf(skip)(
  'CE-116: two index() batches through the machine are both searchable in the real wasm build',
  async () => {
    const engine = await realEngine();
    using machine = createCommandMachine({ search: engine });

    // First batch through ITEMS_LOADED, second one item at a time through REGISTER_ITEM (each calls index())
    machine.send({
      type: 'ITEMS_LOADED',
      items: [entry('apple', 'Apple pie'), entry('banana', 'Banana bread')],
    });
    machine.send({ type: 'REGISTER_ITEM', item: entry('cherry', 'Cherry tart') });
    machine.send({ type: 'REGISTER_ITEM', item: entry('date', 'Date cake') });
    machine.send({ type: 'SEARCH_CHANGE', query: 'apple' });
    vi.advanceTimersToNextFrame();

    expect(machine.getState().search).toBe('apple');
    expect(machine.getState().filteredIds).toEqual([itemId('apple')]);

    machine.send({ type: 'SEARCH_CHANGE', query: 'cherry' });
    vi.advanceTimersToNextFrame();
    expect(machine.getState().filteredIds).toEqual([itemId('cherry')]);
  },
);

it.skipIf(skip)('W05: remove() drops only the given ids', async () => {
  const engine = await realEngine();
  using _engine = engine;
  const items = [
    entry('apple', 'Apple pie'),
    entry('apricot', 'Apricot jam'),
    entry('banana', 'Banana bread'),
  ];
  engine.index(items);
  engine.remove(new Set([itemId('apple')]));

  const ids = (query: string): string[] => [...engine.search(query, items)].map((r) => r.id);
  expect(ids('apple')).toEqual([]);
  expect(ids('apricot')).toEqual(['apricot']);
  expect(ids('banana')).toEqual(['banana']);
});

it.skipIf(skip)('W44: search() returns only ids among the passed items', async () => {
  const engine = await realEngine();
  using _engine = engine;
  // For 'apple', x scores 1.0 and a and b 2/3: under a crate limit of items.length (2), x takes a slot and b is lost
  const items = [entry('x', 'apple'), entry('a', 'appl'), entry('b', 'pple')];
  engine.index(items);

  const ids = [...engine.search('apple', items.slice(1))].map((r) => r.id);
  expect(ids.toSorted()).toEqual([itemId('a'), itemId('b')]);
});
