---
title: "modern-cmdk-search-wasm API"
description: API reference for the Rust/WASM fuzzy search engine with Web Worker support and SharedArrayBuffer zero-copy transfer.
---

# modern-cmdk-search-wasm

Rust-based trigram fuzzy search engine compiled to WebAssembly. Provides typo-tolerant trigram search. No speed figure is published for it: no benchmark of the WASM engine runs in CI.

## Installation

::: warning Experimental -- not yet published
`modern-cmdk-search-wasm` is a private workspace package (version 0.9.0) and is not published to npm. Build it from source with `wasm-pack` (see the [package directory](https://github.com/ABCrimson/modern-cmdk/tree/main/packages/command-search-wasm)). The install commands below do not work until it is published. It does not work yet: the factories never call the wasm-bindgen init function, so `createWasmSearchEngine()` always returns the TypeScript fallback (`isWasm: false`) and `createWorkerSearchEngine()` never receives the worker's `ready` message. The examples below show the intended API, not today's behaviour.
:::

::: code-group
```bash [pnpm]
pnpm add modern-cmdk-search-wasm
```

```bash [npm]
npm install modern-cmdk-search-wasm
```
:::

## `createWasmSearchEngine()`

Creates a WASM search engine that runs on the main thread.

```typescript
import { createWasmSearchEngine } from 'modern-cmdk-search-wasm';

await using engine = await createWasmSearchEngine();
```

### Returns

`Promise<WasmSearchEngine | FallbackSearchEngine>` -- an object implementing `SearchEngine` and `AsyncDisposable`. If the WASM module fails to load (CSP restrictions, unsupported browser, network error), the factory automatically falls back to the TypeScript search engine from `modern-cmdk` -- check the `isWasm` discriminant if you need to know which engine you got.

### WasmSearchEngine Interface

| Property / Method | Type | Description |
|---|---|---|
| `isWasm` | `true` | Discriminant -- `false` on the TypeScript fallback engine |
| `index(items)` | `(items: CommandItem[]) => void` | Index items for search. The main-thread engine upserts the items by id into the values it keeps (an id that is already indexed is replaced, other ids stay) and sends them to the WASM trigram index once, before the next search |
| `search(query, items)` | `(query: string, items: CommandItem[]) => IteratorObject<SearchResult>` | Synchronous fuzzy search returning scored results; a result names an id among the `items` you pass, so an empty `items` array yields nothing |
| `remove(ids)` | `(ids: Set<ItemId>) => void` | Deletes only the given ids; every other indexed id stays searchable. The WASM index is rebuilt whole before the next search. The worker engine clears and re-indexes the remaining items |
| `clear()` | `() => void` | Clear the entire index |
| `[Symbol.dispose]()` | `() => void` | Free WASM memory (synchronous) |
| `[Symbol.asyncDispose]()` | `() => Promise<void>` | Free WASM memory (async, for `await using`) |

### SearchResult

```typescript
import type { ItemId } from 'modern-cmdk';

interface SearchResult {
  readonly id: ItemId;
  readonly score: number;
  readonly matches: ReadonlyArray<readonly [number, number]>;
}
```

### Usage with `await using`

The engine implements `AsyncDisposable`, so `await using` automatically frees WASM memory when the scope exits. Disposing twice, by either protocol, frees once, and after disposal the main-thread WASM engine's `index`, `search`, `remove` and `clear` throw a "disposed" error (the TypeScript fallback does not):

```typescript
import { itemId } from 'modern-cmdk';
import { createWasmSearchEngine } from 'modern-cmdk-search-wasm';

async function search() {
  await using engine = await createWasmSearchEngine();

  engine.index([
    { id: itemId('item-1'), value: 'Application Settings', keywords: ['preferences'] },
    { id: itemId('item-2'), value: 'User Profile', keywords: ['account'] },
  ]);

  // `search` returns only ids among the items you pass
  const items = [
    { id: itemId('item-1'), value: 'Application Settings' },
    { id: itemId('item-2'), value: 'User Profile' },
  ];
  const results = [...engine.search('applcation', items)];
  // Intended: trigram overlap tolerates the dropped letter and matches "Application Settings". Today the TypeScript fallback engine runs and its scorer ranks the results
  console.log(results.length);
}
// WASM memory freed automatically
```

---

## `createWorkerSearchEngine(options?)`

Creates a WASM search engine that runs in a dedicated Web Worker, so search work runs off the main thread.

```typescript
import { createWorkerSearchEngine } from 'modern-cmdk-search-wasm';

await using engine = await createWorkerSearchEngine({
  maxResults: 100,
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `maxResults` | `number` | `50` | Maximum results per search query |

### Returns

`Promise<WorkerSearchEngine | MainThreadSearchEngine>` -- a `SearchEngine` and `AsyncDisposable` with async search and worker properties. When the Worker cannot be created or fails before it signals ready, the factory returns the main-thread engine instead (`isWorker: false`, `useSharedMemory: false`; its `isWasm` is `false` when that engine is itself the TypeScript fallback); check `isWorker` if you need to know which you got.

### WorkerSearchEngine Interface

Has the `SearchEngine` methods and `isWasm: true` of `WasmSearchEngine`, plus:

| Property / Method | Type | Description |
|---|---|---|
| `isWorker` | `true` | Identifies this as a worker-based engine |
| `useSharedMemory` | `boolean` | Whether `SharedArrayBuffer` is in use |
| `searchAsync(query, maxResults?)` | `(query: string, maxResults?: number) => Promise<readonly SearchResult[]>` | Async search via Web Worker |

### Sync vs Async Search

The `search()` method on the worker engine yields from a cache populated by the most recent `searchAsync()` call. For worker engines, always prefer `searchAsync()`:

```typescript
import { itemId } from 'modern-cmdk';
import type { CommandItem } from 'modern-cmdk';
import { createWorkerSearchEngine } from 'modern-cmdk-search-wasm';

const items: CommandItem[] = [{ id: itemId('settings'), value: 'Settings' }];

await using engine = await createWorkerSearchEngine();
engine.index(items);

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
export default {
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
};
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

Both engine types implement the `SearchEngine` interface from `modern-cmdk`. The machine uses the engine's results as returned: a `filter` function is not consulted when `searchEngine` is given (`filter: false` still lists every item), and frecency, when enabled, re-ranks the engine's results. The machine disposes only a search engine it created itself: an engine you pass as `searchEngine` (or the deprecated `search`) is yours to dispose, and it survives the machine's dispose, suspend and resume. Dispose it when you are done with it, after the machine; the `await using` below does so, because `await using` disposes in reverse order of declaration. A worker engine's synchronous `search()` reads the cache of the last `searchAsync()` call and the machine never calls `searchAsync()`, so a machine over a worker engine searches only what you have already fetched with `searchAsync()`:

```typescript
import type { CommandItem } from 'modern-cmdk';
import { createCommandMachine, itemId } from 'modern-cmdk';
import { createWasmSearchEngine } from 'modern-cmdk-search-wasm';

const largeDataset: CommandItem[] = Array.from({ length: 10_000 }, (_, i) => ({
  id: itemId(`item-${i}`),
  value: `Item ${i}`,
}));

export async function main(): Promise<void> {
  await using searchEngine = await createWasmSearchEngine();

  using machine = createCommandMachine({
    searchEngine,
    items: largeDataset,
  });

  // ... use the machine here; when the function returns, the machine is disposed first, then the engine, which is yours to dispose
}
```

Via the React adapter:

```tsx
import type { SearchEngine } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';

function Palette({ wasmEngine }: { wasmEngine: SearchEngine }) {
  return (
    <Command searchEngine={wasmEngine}>
      {/* Intended: items indexed and searched via WASM; today the TypeScript fallback runs */}
    </Command>
  );
}
```

---

::: details WASM Binary Size
The compiled WASM binary is about 52 kB gzipped (about 113 kB raw). It is loaded asynchronously and does not block initial page load.
:::

## Features

- **Fuzzy matching** -- trigram-overlap scoring (query-trigram hits divided by query trigram count, results at or below 0.1 dropped; no exact or prefix tier) that tolerates small typos such as a dropped letter; there is no explicit edit-distance pass yet
- **Trigram index** -- Pre-built index on item registration for O(1) candidate lookup
- **Match positions** -- Returns `[start, end]` ranges for highlighting via `<Command.Highlight>`
- **Graceful fallback** -- Automatically degrades to the TypeScript engine when WASM cannot load (`isWasm: false`)
- **Explicit resource management** -- `await using` / `Symbol.asyncDispose` for clean WASM memory cleanup
- **Worker isolation** -- Optional Web Worker for off-main-thread search
- **SharedArrayBuffer** -- Zero-copy score transfer when cross-origin isolation is available
