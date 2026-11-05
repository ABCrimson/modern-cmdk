# WASM Search

`modern-cmdk-search-wasm` is designed for large datasets (the intended range starts around 5K items). It provides a Rust-based trigram index compiled to WebAssembly. It does typo-tolerant fuzzy search.

## Installation

::: warning Experimental -- not yet published
`modern-cmdk-search-wasm` is not published to npm yet. Build it from source with `wasm-pack` (see the [package directory](https://github.com/ABCrimson/modern-cmdk/tree/main/packages/command-search-wasm)). The package-manager commands below will work once it ships; until then the built-in TypeScript scorer in `modern-cmdk` is the default.

It does not work yet: the factories never call the wasm-bindgen init function, so `createWasmSearchEngine()` always returns the TypeScript fallback (`isWasm: false`) and `createWorkerSearchEngine()` never receives the worker's `ready` message. The examples below show the intended API, not today's behaviour.
:::

::: code-group
```bash [pnpm]
pnpm add modern-cmdk-search-wasm
```

```bash [npm]
npm install modern-cmdk-search-wasm
```

```bash [yarn]
yarn add modern-cmdk-search-wasm
```
:::

## Main-Thread Usage

The simplest approach runs the WASM module directly on the main thread. Designed for datasets up to ~50K items (a design target, not a measurement):

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { createWasmSearchEngine, type FallbackSearchEngine, type WasmSearchEngine } from 'modern-cmdk-search-wasm';
import { useEffect, useState } from 'react';

function WasmSearchPalette() {
  const [engine, setEngine] = useState<WasmSearchEngine | FallbackSearchEngine | null>(null);

  useEffect(() => {
    let disposed = false;
    let engine: WasmSearchEngine | FallbackSearchEngine | null = null;

    async function init() {
      const created = await createWasmSearchEngine();
      if (disposed) {
        created[Symbol.dispose]();
        return;
      }
      engine = created;
      setEngine(created);
    }
    void init();

    return () => {
      disposed = true;
      engine?.[Symbol.dispose]();
    };
  }, []);

  if (!engine) return <div>Loading search engine...</div>;

  return (
    <Command search={engine}>
      <Command.Input placeholder="Fuzzy search 50K items..." />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>
        {/* items */}
      </Command.List>
    </Command>
  );
}
```

### `createWasmSearchEngine()`

Creates a WASM search engine instance on the main thread.

```typescript
import { itemId } from 'modern-cmdk';
import { createWasmSearchEngine } from 'modern-cmdk-search-wasm';

await using engine = await createWasmSearchEngine();

// Index items
const items = [
  { id: itemId('item-1'), value: 'Application Settings', keywords: ['preferences', 'config'] },
  { id: itemId('item-2'), value: 'User Profile', keywords: ['account'] },
];
engine.index(items);

// Search with fuzzy matching + typo tolerance
const results = engine.search('applcation', items); // trigram overlap tolerates the dropped letter: matches "Application Settings"
// => yields { id: 'item-1', score: 0.75, matches: [] }
```

::: tip
The engine implements `AsyncDisposable`, so `await using` automatically frees WASM memory when the scope exits. You can also call `engine[Symbol.asyncDispose]()` manually.
:::

## Web Worker Usage

For large datasets (50K+ items, by design), run the WASM module in a dedicated Web Worker to keep the main thread free:

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import {
  createWorkerSearchEngine,
  type MainThreadSearchEngine,
  type WorkerSearchEngine,
} from 'modern-cmdk-search-wasm';
import { useEffect, useState } from 'react';

function WorkerSearchPalette() {
  const [engine, setEngine] = useState<WorkerSearchEngine | MainThreadSearchEngine | null>(null);

  useEffect(() => {
    let disposed = false;
    let engine: WorkerSearchEngine | MainThreadSearchEngine | null = null;

    async function init() {
      const created = await createWorkerSearchEngine({ maxResults: 100 });
      if (disposed) {
        // An effect cleanup cannot await, so the disposal is fire-and-forget.
        void created[Symbol.asyncDispose]();
        return;
      }
      engine = created;
      setEngine(created);
    }
    void init();

    return () => {
      disposed = true;
      void engine?.[Symbol.asyncDispose]();
    };
  }, []);

  if (!engine) return <div>Initializing worker...</div>;

  return (
    <Command search={engine}>
      <Command.Input placeholder="Search 100K items..." />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>
        {/* items */}
      </Command.List>
    </Command>
  );
}
```

### `createWorkerSearchEngine(options?)`

Creates a WASM search engine that runs in a Web Worker. The worker module and WASM binary are resolved automatically relative to the package -- no URL configuration needed.

```typescript
import { createWorkerSearchEngine } from 'modern-cmdk-search-wasm';

await using engine = await createWorkerSearchEngine({ maxResults: 100 });

// Preferred API for worker engines — async search off the main thread
const results = await engine.searchAsync('settings');

// engine.useSharedMemory tells you whether zero-copy transfer is active
```

| Option | Type | Default | Description |
|---|---|---|---|
| `maxResults` | `number` | `50` | Maximum results returned per search query |

## SharedArrayBuffer Requirements

`SharedArrayBuffer` zero-copy score transfer is detected automatically -- when the page is cross-origin isolated (`crossOriginIsolated === true`), scores are written directly into shared memory; otherwise the engine transparently falls back to structured clone. To enable isolation, your server must send the following headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

::: warning No headers, no shared memory
Without these headers, `SharedArrayBuffer` is unavailable and the engine falls back to structured clone (`postMessage`) for score transfer. This is still fast but involves a copy. Check `engine.useSharedMemory` to see which mode is active.
:::

### Vite Configuration

```typescript
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

### Next.js Configuration

```typescript
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

## Plugging into the State Machine

The WASM search engine implements the `SearchEngine` interface from `modern-cmdk`. You can plug it into the core state machine directly:

```typescript
import { createCommandMachine, itemId } from 'modern-cmdk';
import type { CommandItem } from 'modern-cmdk';
import { createWasmSearchEngine } from 'modern-cmdk-search-wasm';

const largeDataset: readonly CommandItem[] = Array.from({ length: 50_000 }, (_, i) => ({
  id: itemId(`item-${i}`),
  value: `Item ${i}`,
}));

await using searchEngine = await createWasmSearchEngine();

using machine = createCommandMachine({
  search: searchEngine,
  items: largeDataset,
});

// The machine now uses WASM-accelerated fuzzy search for all queries
```

Or via the React adapter's `search` prop:

```tsx
import type { SearchEngine } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';

export function WasmPalette({ wasmEngine }: { readonly wasmEngine: SearchEngine }) {
  return (
    <Command search={wasmEngine}>
      {/* All child items are indexed and searched via WASM */}
    </Command>
  );
}
```

## Performance Characteristics

::: warning Design targets, not measurements
No harness measures the WASM engine (`benchmarks/baseline.json` has no wasm entry), so the WASM columns below are design targets, not measured results.
:::

| Dataset Size | TypeScript Scorer (measured) | WASM Scorer, main thread (target) | WASM Scorer, worker (target) |
|---|---|---|---|
| 1K items | not measured | < 0.1 ms | < 0.2 ms |
| 10K items | 3.46 ms median, 7.03 ms p99 (`benchmarks/history/2026-11-04-45a9134.json`) | < 1 ms | < 1 ms |
| 50K items | not measured | < 2 ms | < 2 ms |
| 100K items | not measured | < 3 ms | < 3 ms |

::: details WASM Binary Size
The compiled WASM binary is about 52 kB gzipped (about 113 kB raw). It is loaded asynchronously and does not block initial page load.
:::

## Features

- **Fuzzy matching** — trigram-overlap scoring (query-trigram hits divided by query trigram count, results at or below 0.1 dropped; no exact or prefix tier) that tolerates small typos such as a dropped letter; there is no explicit edit-distance pass yet
- **Trigram index** — Pre-built index on item registration for O(1) candidate lookup
- **Match positions** — Returns `[start, end]` ranges for use with `<Command.Highlight>`
- **Graceful fallback** — Automatically degrades to the TypeScript engine when WASM cannot load (`isWasm: false`)
- **Explicit resource management** — `await using` / `Symbol.asyncDispose` for clean WASM memory cleanup
