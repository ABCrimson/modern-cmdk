<h1 align="center">modern-cmdk-search-wasm</h1>

<p align="center">
  <strong>WASM-accelerated fuzzy search for <code>modern-cmdk</code></strong>
  <br />
  Rust &middot; Trigram index &middot; Web Worker support &middot; SharedArrayBuffer
</p>

<p align="center">
  <a href="https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-dc2626?style=flat-square&labelColor=0a0e27" alt="license" /></a>
</p>

> **Status:** private 0.9.0, not published to npm. Build it from source with `pnpm build:wasm` (requires `wasm-pack`). It does not work yet: the factories never call the wasm-bindgen init function, so `createWasmSearchEngine()` always returns the TypeScript fallback (`isWasm: false`), and `createWorkerSearchEngine()` never receives the worker's `ready` message and falls back to that same TypeScript scorer. The examples below show the intended API, not today's behaviour.

---

## What is this?

An experimental replacement for the default search engine in `modern-cmdk` (not functional yet; see Status). Uses a Rust-compiled WASM module with trigram indexing for fuzzy search. It is experimental and has no published benchmark.

### Two execution modes

| Mode | Description | Best for |
|------|-------------|----------|
| **Main thread** | Direct WASM calls on the main thread | Smaller item sets |
| **Web Worker** | Off-main-thread search in a Web Worker; scores travel via SharedArrayBuffer when cross-origin isolated, else by structured clone | Larger item sets |

## Install (from source)

```bash
# 1. Install wasm-pack 0.15.1 (the version CI pins in .github/workflows/ci.yml)
cargo install wasm-pack --version 0.15.1 --locked

# 2. Build the WASM module
pnpm --filter modern-cmdk-search-wasm run build:wasm

# 3. Build the TypeScript wrapper
pnpm --filter modern-cmdk-search-wasm run build
```

## Usage

### Main thread

```ts
import { createCommandMachine, itemId } from 'modern-cmdk';
import { createWasmSearchEngine } from 'modern-cmdk-search-wasm';

const largeDataset = Array.from({ length: 10_000 }, (_, i) => ({
  id: itemId(`item-${i}`),
  value: `Item ${i}`,
}));

export async function main(): Promise<void> {
  const wasmEngine = await createWasmSearchEngine();

  // The machine lives as long as this scope; `using` disposes it, and the engine it was given, when
  // the function returns.
  using machine = createCommandMachine({
    search: wasmEngine,
    items: largeDataset,
  });

  // ... use the machine here
}
```

### Web Worker

`createCommandMachine` calls only the synchronous `search()`, which ignores its arguments and yields the results of the most recent `searchAsync()` call. Nothing calls `searchAsync()` for you, so call `await workerEngine.searchAsync(query)` yourself before the machine filters.

```ts
import { createCommandMachine, itemId } from 'modern-cmdk';
import { createWorkerSearchEngine } from 'modern-cmdk-search-wasm';

const massiveDataset = Array.from({ length: 100_000 }, (_, i) => ({
  id: itemId(`item-${i}`),
  value: `Item ${i}`,
}));

export async function main(): Promise<void> {
  const workerEngine = await createWorkerSearchEngine();

  // `using` disposes the machine, and the engine it was given, when the function returns.
  using machine = createCommandMachine({
    search: workerEngine,
    items: massiveDataset, // 100K items
  });

  // ... call `await workerEngine.searchAsync(query)` before the machine filters
}
```

## Architecture

```
+--------------------+     +-------------------------+
|    Main Thread      |     |      Web Worker          |
|                     |     |                          |
|  createCommand      |---->|  WASM trigram index      |
|  Machine()          |<----|  scores (SAB or clone)   |
|                     |     |                          |
+--------------------+     +-------------------------+
```

The Rust crate builds a trigram index at startup, which gives an O(1) hash lookup of each query trigram's posting list; candidates come from walking those lists. A result's score is the number of query-trigram hits in the item's `value` divided by the number of query trigrams. Results at or below 0.1 are dropped, there is no exact or prefix tier, and match ranges are exact substring hits. The edit-distance helpers in `crate/src/scorer.rs` are compiled for tests only and are not used in search.

## Peer Dependencies

- `modern-cmdk` (the workspace version; declared as `workspace:*`)

## Links

- [Core Engine](https://www.npmjs.com/package/modern-cmdk)
- [Documentation](https://abcrimson.github.io/modern-cmdk/)
- [GitHub](https://github.com/ABCrimson/modern-cmdk)

## License

[MIT](https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE)
