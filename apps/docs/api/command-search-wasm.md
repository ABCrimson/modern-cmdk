---
title: "@crimson_dev/command-search-wasm API"
description: API reference for the Rust/WASM fuzzy search engine with Web Worker support and SharedArrayBuffer zero-copy transfer.
---

# @crimson_dev/command-search-wasm

Rust-based trigram fuzzy search engine compiled to WebAssembly. Provides sub-1ms search on 100K items with typo tolerance.

## Installation

::: code-group
```bash [pnpm]
pnpm add @crimson_dev/command-search-wasm
```

```bash [npm]
npm install @crimson_dev/command-search-wasm
```
:::

## `createWasmSearchEngine()`

Creates a WASM search engine that runs on the main thread. Suitable for datasets up to ~50K items.

```typescript
import { createWasmSearchEngine } from '@crimson_dev/command-search-wasm';

await using engine = await createWasmSearchEngine();
```

### Returns

`Promise<WasmSearchEngine>` -- an object implementing `SearchEngine` and `AsyncDisposable`.

### WasmSearchEngine Interface

| Property / Method | Type | Description |
|---|---|---|
| `isWasm` | `true` | Identifies this as a WASM engine |
| `index(items)` | `(items: CommandItem[]) => void` | Index items for search. Serializes and sends to WASM trigram index |
| `search(query, items)` | `(query: string, items: CommandItem[]) => IteratorObject<SearchResult>` | Synchronous fuzzy search returning scored results |
| `remove(ids)` | `(ids: Set<ItemId>) => void` | Remove items from the index (clears and re-indexes) |
| `clear()` | `() => void` | Clear the entire index |
| `[Symbol.dispose]()` | `() => void` | Free WASM memory (synchronous) |
| `[Symbol.asyncDispose]()` | `() => Promise<void>` | Free WASM memory (async, for `await using`) |

### SearchResult

```typescript
interface SearchResult {
  readonly id: ItemId;
  readonly score: number;
  readonly matches: ReadonlyArray<readonly [number, number]>;
}
```

### Usage with `await using`

The engine implements `AsyncDisposable`, so `await using` automatically frees WASM memory when the scope exits:

```typescript
async function search() {
  await using engine = await createWasmSearchEngine();

  engine.index([
    { id: 'item-1', value: 'Application Settings', keywords: ['preferences'] },
    { id: 'item-2', value: 'User Profile', keywords: ['account'] },
  ]);

  const results = engine.search('applcation', []);
  // Typo-tolerant: matches "Application Settings"
}
// WASM memory freed automatically
```

---

## `createWorkerSearchEngine(options?)`

Creates a WASM search engine that runs in a dedicated Web Worker. Keeps the main thread free for UI rendering. Best for datasets over 50K items.

```typescript
import { createWorkerSearchEngine } from '@crimson_dev/command-search-wasm';

await using engine = await createWorkerSearchEngine({
  maxResults: 100,
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `maxResults` | `number` | `50` | Maximum results per search query |

### Returns

`Promise<WorkerSearchEngine>` -- extends `WasmSearchEngine` with async search and worker properties.

### WorkerSearchEngine Interface

Inherits all `WasmSearchEngine` methods, plus:

| Property / Method | Type | Description |
|---|---|---|
| `isWorker` | `true` | Identifies this as a worker-based engine |
| `useSharedMemory` | `boolean` | Whether `SharedArrayBuffer` is in use |
| `searchAsync(query, maxResults?)` | `(query: string, maxResults?: number) => Promise<readonly SearchResult[]>` | Async search via Web Worker |

### Sync vs Async Search

The `search()` method on the worker engine yields from a cache populated by the most recent `searchAsync()` call. For worker engines, always prefer `searchAsync()`:

```typescript
// Preferred: async search
const results = await engine.searchAsync('settings');

// Fallback: sync search (reads from cache)
for (const result of engine.search('settings', items)) {
  console.log(result.id, result.score);
}
```

### SharedArrayBuffer Zero-Copy Transfer

When `SharedArrayBuffer` is available (requires cross-origin isolation), scores are written directly into shared memory without copying. Without `SharedArrayBuffer`, results are transferred via structured clone (`postMessage`).

### Cross-Origin Isolation

`SharedArrayBuffer` requires these HTTP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

::: code-group
```typescript [Vite]
// vite.config.ts
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

```typescript [Next.js]
// next.config.ts
const nextConfig = {
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
      ],
    },
  ],
};
export default nextConfig;
```
:::

### Worker Message Protocol

**Main thread to worker:**

| Message Type | Payload | Description |
|---|---|---|
| `index` | `{ items: string }` | JSON-serialized items to index |
| `search` | `{ query, maxResults, scoresBuffer? }` | Search query with optional `SharedArrayBuffer` |
| `clear` | -- | Clear the index |
| `dispose` | -- | Free WASM memory and close worker |

**Worker to main thread:**

| Response Type | Payload | Description |
|---|---|---|
| `ready` | -- | WASM module loaded |
| `indexed` | -- | Indexing complete |
| `results` | `{ results: SearchResult[] }` | Structured clone results |
| `results-sab` | `{ count, ids, matches }` | SharedArrayBuffer results (scores in shared memory) |
| `cleared` | -- | Index cleared |
| `error` | `{ message: string }` | Error occurred |

---

## Plugging into the State Machine

Both engine types implement the `SearchEngine` interface from `@crimson_dev/command`:

```typescript
import { createCommandMachine } from '@crimson_dev/command';
import { createWasmSearchEngine } from '@crimson_dev/command-search-wasm';

await using searchEngine = await createWasmSearchEngine();

using machine = createCommandMachine({
  search: searchEngine,
  items: largeDataset,
});
```

Via the React adapter:

```tsx
<Command search={wasmEngine}>
  {/* All items indexed and searched via WASM */}
</Command>
```

---

## Performance Comparison

| Dataset Size | TypeScript Scorer | WASM (main thread) | WASM (worker) |
|---|---|---|---|
| 1K items | < 1ms | < 0.1ms | < 0.2ms |
| 10K items | ~5ms | < 1ms | < 1ms |
| 50K items | ~25ms | < 2ms | < 2ms |
| 100K items | ~60ms | < 3ms | < 3ms |

::: details WASM Binary Size
The compiled WASM binary is approximately 45KB gzipped. It is loaded asynchronously and does not block initial page load.
:::

## Features

- **Fuzzy matching** -- Typo tolerance via Levenshtein distance (up to 2 edits for short queries, up to 3 for longer)
- **Trigram index** -- Pre-built index on item registration for O(1) candidate lookup
- **Match positions** -- Returns `[start, end]` ranges for highlighting via `<Command.Highlight>`
- **Incremental indexing** -- Items can be added/removed without rebuilding the full index
- **Explicit resource management** -- `await using` / `Symbol.asyncDispose` for clean WASM memory cleanup
- **Worker isolation** -- Optional Web Worker for off-main-thread search
- **SharedArrayBuffer** -- Zero-copy score transfer when cross-origin isolation is available
