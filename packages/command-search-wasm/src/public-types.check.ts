// packages/command-search-wasm/src/public-types.check.ts
// ARCH-57: type-level only, checked by `tsc --noEmit`. Not a *.test.ts file, so Vitest never loads ../pkg.
// The engine types are nameable from the package index, and createWasmSearchEngine resolves to their union.

import type { createWasmSearchEngine, FallbackSearchEngine, WasmSearchEngine } from './index.js';

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type Expect<T extends true> = T;

export type CreateResolvesToTheUnion = Expect<
  Equals<
    Awaited<ReturnType<typeof createWasmSearchEngine>>,
    WasmSearchEngine | FallbackSearchEngine
  >
>;
