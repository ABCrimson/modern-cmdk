# WASM Search

For datasets over 5K items, `@crimson_dev/command-search-wasm` provides a Rust-based trigram index compiled to WebAssembly. It delivers sub-1ms fuzzy search on 100K items with typo tolerance.

## Installation

::: code-group
```bash [pnpm]
pnpm add @crimson_dev/command-search-wasm
```

```bash [npm]
npm install @crimson_dev/command-search-wasm
```

```bash [yarn]
yarn add @crimson_dev/command-search-wasm
```
:::

## Main-Thread Usage

The simplest approach runs the WASM module directly on the main thread. Suitable for datasets up to ~50K items:

```tsx
'use client';

import { Command } from '@crimson_dev/command-react';
import { createWasmSearchEngine } from '@crimson_dev/command-search-wasm';
import { useEffect, useState } from 'react';

function WasmSearchPalette() {
  const [engine, setEngine] = useState<Awaited<ReturnType<typeof createWasmSearchEngine>> | null>(null);

  useEffect(() => {
    let disposed = false;

    async function init() {
      await using wasmEngine = await createWasmSearchEngine();
      if (!disposed) {
        setEngine(wasmEngine);
      }
    }

    Promise.try(() => init());
    return () => { disposed = true; };
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
import { createWasmSearchEngine } from '@crimson_dev/command-search-wasm';

await using engine = await createWasmSearchEngine();

// Index items
engine.index([
  { id: 'item-1', value: 'Application Settings', keywords: ['preferences', 'config'] },
  { id: 'item-2', value: 'User Profile', keywords: ['account'] },
]);

// Search with fuzzy matching + typo tolerance
const results = engine.search('applcation'); // typo-tolerant: matches "Application Settings"
// => [{ id: 'item-1', score: 0.85, matches: [[0, 11]] }]
```

::: tip
The engine implements `AsyncDisposable`, so `await using` automatically frees WASM memory when the scope exits. You can also call `engine[Symbol.asyncDispose]()` manually.
:::

## Web Worker Usage

For the best performance with large datasets (50K+ items), run the WASM module in a dedicated Web Worker to keep the main thread free:

```tsx
'use client';

import { Command } from '@crimson_dev/command-react';
import { createWorkerSearchEngine } from '@crimson_dev/command-search-wasm';
import { useEffect, useState } from 'react';

function WorkerSearchPalette() {
  const [engine, setEngine] = useState<Awaited<ReturnType<typeof createWorkerSearchEngine>> | null>(null);

  useEffect(() => {
    let disposed = false;

    async function init() {
      const workerEngine = await createWorkerSearchEngine({
        wasmUrl: new URL(
          '@crimson_dev/command-search-wasm/pkg/command_search_wasm_bg.wasm',
          import.meta.url,
        ),
      });
      if (!disposed) setEngine(workerEngine);
    }

    Promise.try(() => init());
    return () => { disposed = true; };
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

Creates a WASM search engine that runs in a Web Worker.

```typescript
import { createWorkerSearchEngine } from '@crimson_dev/command-search-wasm';

const engine = await createWorkerSearchEngine({
  wasmUrl: new URL('./command_search_wasm_bg.wasm', import.meta.url),
  useSharedArrayBuffer: true, // zero-copy score transfer
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `wasmUrl` | `URL \| string` | bundled | URL to the WASM binary |
| `useSharedArrayBuffer` | `boolean` | `false` | Use `SharedArrayBuffer` for zero-copy score transfer |

## SharedArrayBuffer Requirements

When `useSharedArrayBuffer: true` is enabled, your server must send the following headers for cross-origin isolation:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

::: warning COOP/COEP Headers Required
Without these headers, `SharedArrayBuffer` is unavailable and the engine falls back to structured clone (postMessage) for score transfer. This is still fast but involves a copy.
:::

### Vite Configuration

```typescript
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

The WASM search engine implements the `SearchEngine` interface from `@crimson_dev/command`. You can plug it into the core state machine directly:

```typescript
import { createCommandMachine } from '@crimson_dev/command';
import { createWasmSearchEngine } from '@crimson_dev/command-search-wasm';

await using searchEngine = await createWasmSearchEngine();

using machine = createCommandMachine({
  search: searchEngine,
  items: largeDataset,
});

// The machine now uses WASM-accelerated fuzzy search for all queries
```

Or via the React adapter's `search` prop:

```tsx
<Command search={wasmEngine}>
  {/* All child items are indexed and searched via WASM */}
</Command>
```

## Performance Characteristics

| Dataset Size | TypeScript Scorer | WASM Scorer (main thread) | WASM Scorer (worker) |
|---|---|---|---|
| 1K items | < 1ms | < 0.1ms | < 0.2ms |
| 10K items | ~5ms | < 1ms | < 1ms |
| 50K items | ~25ms | < 2ms | < 2ms |
| 100K items | ~60ms | < 3ms | < 3ms |

::: details WASM Binary Size
The compiled WASM binary is approximately 45KB gzipped. It is loaded asynchronously and does not block initial page load.
:::

## Features

- **Fuzzy matching** — Typo tolerance via Levenshtein distance (up to 2 for short queries, up to 3 for longer)
- **Trigram index** — Pre-built index on item registration for O(1) candidate lookup
- **Match positions** — Returns `[start, end]` ranges for use with `<Command.Highlight>`
- **Incremental indexing** — Items can be added/removed without rebuilding the full index
- **Explicit resource management** — `await using` / `Symbol.asyncDispose` for clean WASM memory cleanup
