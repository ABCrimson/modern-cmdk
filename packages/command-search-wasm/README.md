<h1 align="center">@crimson_dev/command-search-wasm</h1>

<p align="center">
  <strong>WASM-accelerated fuzzy search for <code>@crimson_dev/command</code></strong>
  <br />
  Rust &middot; Trigram index &middot; Web Worker support &middot; SharedArrayBuffer
</p>

<p align="center">
  <a href="https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@crimson_dev/command-search-wasm?style=flat-square" alt="license" /></a>
</p>

> **Status:** Not yet published. Requires `wasm-pack` to build from source. The package is marked `private` until the WASM build is integrated into CI.

---

## What is this?

A drop-in replacement for the default search engine in `@crimson_dev/command`. Uses a Rust-compiled WASM module with trigram indexing for sub-millisecond fuzzy search on datasets of 100K+ items.

### Two execution modes

| Mode | Description | Best for |
|------|-------------|----------|
| **Main thread** | Direct WASM calls, zero latency | < 10K items |
| **Web Worker** | Off-main-thread search via `SharedArrayBuffer` | 10K+ items, keeps UI at 60fps |

## Install (from source)

```bash
# 1. Install wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

# 2. Build the WASM module
pnpm --filter @crimson_dev/command-search-wasm run build:wasm

# 3. Build the TypeScript wrapper
pnpm --filter @crimson_dev/command-search-wasm run build
```

## Usage

### Main thread

```ts
import { createCommandMachine } from '@crimson_dev/command';
import { createWasmSearchEngine } from '@crimson_dev/command-search-wasm';

const wasmEngine = await createWasmSearchEngine();

using machine = createCommandMachine({
  search: wasmEngine,
  items: largeDataset,
});
```

### Web Worker

```ts
import { createWorkerSearchEngine } from '@crimson_dev/command-search-wasm';

const workerEngine = await createWorkerSearchEngine();

using machine = createCommandMachine({
  search: workerEngine,
  items: massiveDataset, // 100K+ items
});
```

## Architecture

```
┌────────────────────┐     ┌─────────────────────────┐
│    Main Thread      │     │      Web Worker          │
│                     │     │                          │
│  createCommand      │────▶│  WASM trigram index      │
│  Machine()          │◀────│  SharedArrayBuffer       │
│                     │     │  results                 │
└────────────────────┘     └─────────────────────────┘
```

The Rust crate builds a trigram index at startup, enabling O(1) candidate lookup per query trigram. Scoring uses the same multi-strategy approach as the default engine (exact > prefix > substring > fuzzy).

## Peer Dependencies

- `@crimson_dev/command` >= 0.9.0

## Links

- [Core Engine](https://www.npmjs.com/package/@crimson_dev/command)
- [React Adapter](https://www.npmjs.com/package/@crimson_dev/command-react)

## License

MIT
