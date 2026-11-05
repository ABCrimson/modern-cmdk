---
title: Architecture Internals
description: Monorepo-level view of the modern-cmdk architecture — package graph, core subsystems, virtualization internals, and ES feature usage.
---

# Architecture Internals

::: tip Looking for the high-level tour?
Start with the [Architecture Overview](/architecture/overview) — this page drills into the monorepo package graph and per-subsystem internals.
:::

`modern-cmdk` is built as a three-layer architecture: a framework-agnostic **core engine**, a **React adapter**, and an optional **WASM search** acceleration layer.

## Package Dependency Graph

```mermaid
graph TD
    A["modern-cmdk<br/>(Core Engine)"] --> B["modern-cmdk/react<br/>(React 19 Adapter)"]
    A --> C["modern-cmdk-search-wasm<br/>(WASM Trigram Search)"]
    B --> D["apps/docs<br/>(VitePress)"]
    B --> E["apps/playground<br/>(React 19 Demo)"]
    C -.->|optional| B
```

## Core Engine (`modern-cmdk`)

The core is a **pure TypeScript state machine** with no framework dependency and no hard DOM dependency (DOM APIs are feature-detected and SSR-safe). It manages search, filtering, keyboard navigation, frecency ranking, and keyboard shortcuts.

```mermaid
stateDiagram-v2
    [*] --> Closed
    Closed --> Open: OPEN
    Open --> Closed: CLOSE
    Closed --> Open: TOGGLE
    Open --> Closed: TOGGLE
```

The machine has no named search or navigation states. It holds one `CommandState` record (read it with `machine.getState()`), and each event updates fields of it: `SEARCH_CHANGE` updates `search`, `filteredIds`, `groupedIds`, `filteredCount` and `activeId`; `NAVIGATE` and `ITEM_ACTIVATE` update `activeId`; `ITEM_SELECT` changes no state field (it calls the item's and the machine's `onSelect`, emits `select` and records the selection in the frecency engine); and `PAGE_PUSH` / `PAGE_POP` update `page` and `pageStack`. Only `open` behaves like a state.

### Key Subsystems

| Module | Responsibility |
|--------|---------------|
| `machine.ts` | State transitions, subscriber notification |
| `registry.ts` | Item/group registration with set operation helpers (union/intersection/difference) |
| `search/default-scorer.ts` | Fuzzy matching and scoring |
| `search/index.ts` | Search engine factory, pluggable scorer interface |
| `frecency/index.ts` | Time-based decay buckets (Date.now) |
| `frecency/idb-storage.ts` | IndexedDB persistence via idb-keyval |
| `keyboard/parser.ts` | Shortcut string parsing |
| `keyboard/matcher.ts` | Event matching + conflict detection via groupBy helper |
| `utils/scheduler.ts` | Update batching -- `requestAnimationFrame` in browsers, microtask in Node.js |
| `utils/event-emitter.ts` | Type-safe pub/sub with Disposable cleanup |

### Data Flow: Search Pipeline

```mermaid
flowchart LR
    A[User Input] --> B[SEARCH_CHANGE event]
    B --> C[Search Engine]
    C --> D[Score & Rank]
    D --> E[Frecency Boost]
    E --> F[filteredIds]
    F --> G[React re-render<br/>via useSyncExternalStore]
```

## React Adapter (`modern-cmdk/react`)

The React adapter exposes 15 compound components (the `Command` root plus 14 subcomponents) that bind to the core state machine:

```mermaid
graph TD
    CMD["Command (root)"] --> INP["Command.Input"]
    CMD --> LST["Command.List"]
    CMD --> DLG["Command.Dialog"]
    LST --> GRP["Command.Group"]
    LST --> ITM["Command.Item"]
    LST --> SEP["Command.Separator"]
    LST --> EMP["Command.Empty"]
    LST --> LDG["Command.Loading"]
    GRP --> ITM2["Command.Item"]
    DLG --> CMD2["Command (nested)"]
```

### React 19 Integration Points

- **`useSyncExternalStore`** — Subscribe to the core state machine without tearing
- **`useTransition`** — Wraps only the optimistic active-item update; `Command.Input` keeps an urgent draft value and the machine catches up on its scheduler tick, so `isPending` never reflects a search
- **`useOptimistic`** — Optimistic `activeId` updates for instant navigation feedback
- **`ref` as prop** — No `forwardRef` needed (React 19 native)
- **Activity API** — `CommandActivity` for keep-alive state preservation

### Virtualization

The list component auto-virtualizes when filtered items exceed a threshold. The virtualizer uses:

- `ResizeObserver` for dynamic item height measurement
- `requestIdleCallback` for deferred measurement
- the `translate` property for transform-based positioning, off the layout path
- `content-visibility: auto` for off-screen rendering skip

## WASM Search (`modern-cmdk-search-wasm`)

Optional Rust-compiled trigram index for large datasets (10K+ items).

```mermaid
sequenceDiagram
    participant Main as Main Thread
    participant Worker as Web Worker
    participant WASM as WASM Module

    Worker-->>Main: postMessage({ type: 'ready' })

    Main->>Worker: postMessage({ type: 'index', items })
    Worker->>WASM: index_items(serialized)
    WASM-->>Worker: indexed
    Worker-->>Main: postMessage({ type: 'indexed' })

    Main->>Worker: postMessage({ type: 'search', query, maxResults })
    Worker->>WASM: search(query, maxResults)
    WASM-->>Worker: results[]
    Worker-->>Main: postMessage({ type: 'results', results })
    Note over Worker,Main: with a SharedArrayBuffer the reply is { type: 'results-sab' }
```

### Two Execution Modes

| Mode | Function | Thread | Use Case |
|------|----------|--------|----------|
| Main thread | `createWasmSearchEngine()` | Main | Simple setup, designed for up to ~50K items (a design target) |
| Worker thread | `createWorkerSearchEngine()` | Web Worker | Large datasets, non-blocking UI |

Both implement the `SearchEngine` interface from the core package and support `AsyncDisposable` for `await using` cleanup.

## Resource Management

All engines implement `Disposable` or `AsyncDisposable` for automatic cleanup:

```typescript
import { createSearchEngine, itemId } from 'modern-cmdk';
import type { CommandItem } from 'modern-cmdk';
import { createWasmSearchEngine } from 'modern-cmdk-search-wasm';

const items: readonly CommandItem[] = [
  { id: itemId('copy'), value: 'Copy' },
  { id: itemId('paste'), value: 'Paste' },
];

// Synchronous — using
{
  using engine = createSearchEngine();
  engine.index(items);
  engine.search('query', items).toArray();
} // engine[Symbol.dispose]() called automatically

// Asynchronous — await using
{
  await using engine = await createWasmSearchEngine();
  engine.index(items);
  // ...
} // engine[Symbol.asyncDispose]() called automatically
```

## Build Output

`packages/modern-cmdk/tsdown.config.ts` holds three tsdown configs:

1. **The core** (`dist/core/index.mjs`, with declarations).
2. **The React adapter**: two entries, `modern-cmdk/react` and `modern-cmdk/react/dialog`, in one config so the code both use (context, hooks, `CommandDialog`) is emitted once as a shared chunk in `dist/react`. The core is external: the adapter imports it as `modern-cmdk`, so a bundle holds one core, not a second copy inlined into the adapter. `radix-ui` stays external too, and the two React outputs (`react/index.mjs`, `react/dialog.mjs`) begin with `'use client'`: the banner comes from this config, and no file under `src/react` carries the directive. `styles.css` is copied to `dist/react/styles.css`.
3. **The codemod** (`dist/codemod`): the deprecated `modern-cmdk` bin. Its source lives in the sibling package `packages/modern-cmdk-codemod` (bin `modern-cmdk-codemod`); this config builds `cli.mjs`, the worker and the transforms from that source, bundled with jscodeshift and its parser tree (ten packages), behind the shim `dist/codemod/bin.mjs`, which warns once and keeps the 1.x exit codes and 1.4 file discovery until 2.0. `modern-cmdk` ships `THIRD-PARTY-NOTICES.md` for the bundled code (`pnpm check:notices`). Neither `modern-cmdk` nor `modern-cmdk-codemod` ships declarations for the codemod, because it is a CLI and not an importable API.

`sideEffects` in `packages/modern-cmdk/package.json` is `["./dist/react/styles.css"]` only. `Command.Dialog` is a member of the `Command` compound, so every `modern-cmdk/react` import loads `radix-ui`, and `radix-ui` is a required peer dependency (`>=1.4.0 <2.0.0`) through 1.x. See [Server-Side Rendering](/guide/ssr#tree-shaking) for the measured consequence for bundle size.

## Language Features & Editions

| Feature | Edition | Where Used | Native/Helper |
|---------|---------|-----------|---------------|
| Iterator Helpers | ES2025 | Search pipelines, registry operations, frecency bonuses | Native |
| `Symbol.dispose` / `Symbol.asyncDispose` (`using` / `await using`) | ESNext (TS `lib` `esnext.disposable`) | Engines, storages and the machine implement the protocol, so consumers can write `using` | Native |
| `Promise.withResolvers` | ES2024 | Worker communication in the unpublished `modern-cmdk-search-wasm` package | Native |
| `RegExp.escape` | ES2025 | Not used | -- |
| Set methods (`union`, `intersection`, `difference`) | ES2025 | Registry union/intersection/difference for group operations | Helper functions (`set-ops.ts`) |
| `Map.groupBy` / `Object.groupBy` | ES2024 | Shortcut conflict detection, item grouping | Helper functions (`group-by.ts`) |
| `Date.now()` | ES5 | Frecency timestamps, state `lastUpdated` | Native (replaces Temporal) |
| `String.prototype.toWellFormed` | ES2024 | Branded ID creation | Helper function (`string-wellformed.ts`) |
