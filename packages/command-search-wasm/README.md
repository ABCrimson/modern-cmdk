<h1 align="center">modern-cmdk-search-wasm</h1>

<p align="center">
  <strong>WASM-accelerated fuzzy search for <code>modern-cmdk</code></strong>
  <br />
  Rust &middot; Trigram index &middot; Web Worker support &middot; SharedArrayBuffer
</p>

<p align="center">
  <a href="https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-dc2626?style=flat-square&labelColor=0a0e27" alt="license" /></a>
</p>

> **Status:** private 0.9.0, not published to npm. Build it from source with `pnpm build:wasm` (requires `wasm-pack`).

---

## What is this?

A drop-in replacement for the default search engine in `modern-cmdk`. Uses a Rust-compiled WASM module with trigram indexing for fuzzy search. It is experimental and has no published benchmark.

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
import { createCommandMachine } from 'modern-cmdk';
import { createWasmSearchEngine } from 'modern-cmdk-search-wasm';

const wasmEngine = await createWasmSearchEngine();

using machine = createCommandMachine({
  search: wasmEngine,
  items: largeDataset,
});
```

### Web Worker

```ts
import { createWorkerSearchEngine } from 'modern-cmdk-search-wasm';

const workerEngine = await createWorkerSearchEngine();

using machine = createCommandMachine({
  search: workerEngine,
  items: massiveDataset, // 100K+ items
});
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

The Rust crate builds a trigram index at startup, which gives an O(1) hash lookup of each query trigram's posting list; candidates come from walking those lists. Scoring uses the same multi-strategy approach as the default engine (exact > prefix > substring > fuzzy).

## Peer Dependencies

- `modern-cmdk` (the workspace version; declared as `workspace:*`)

## Links

- [Core Engine](https://www.npmjs.com/package/modern-cmdk)
- [Documentation](https://abcrimson.github.io/modern-cmdk/)
- [GitHub](https://github.com/ABCrimson/modern-cmdk)

## License

[MIT](https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE)
