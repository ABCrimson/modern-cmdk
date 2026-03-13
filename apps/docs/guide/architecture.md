---
title: Architecture Overview
description: Three-layer architecture of the modern-cmdk monorepo
---

# Architecture Overview

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

The core is a **pure TypeScript state machine** with zero DOM or framework dependencies. It manages search, filtering, keyboard navigation, frecency ranking, and keyboard shortcuts.

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Searching: SEARCH_CHANGE
    Searching --> Idle: query cleared
    Searching --> Searching: query updated

    Idle --> Navigating: ARROW_DOWN / ARROW_UP
    Searching --> Navigating: ARROW_DOWN / ARROW_UP
    Navigating --> Idle: SEARCH_CHANGE

    Navigating --> Selected: ENTER
    Selected --> Idle: item callback fired
```

### Key Subsystems

| Module | Responsibility |
|--------|---------------|
| `machine.ts` | State transitions, subscriber notification |
| `registry.ts` | Item/group registration with set operation helpers (union/intersection/difference) |
| `search/default-scorer.ts` | Fuzzy matching and scoring |
| `search/index.ts` | Search engine factory, pluggable scorer interface |
| `frecency/index.ts` | Time-based decay buckets (Date.now) |
| `frecency/idb-storage.ts` | IndexedDB persistence via idb-keyval |
| `keyboard/parser.ts` | Shortcut string parsing with RegExp.escape |
| `keyboard/matcher.ts` | Conflict detection via groupBy helper |
| `utils/scheduler.ts` | Microtask batching for state updates |
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

The React adapter exposes 14 compound components that bind to the core state machine:

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
- **`useTransition`** — Wrap search updates for concurrent rendering
- **`useOptimistic`** — Show optimistic input values during transitions
- **`ref` as prop** — No `forwardRef` needed (React 19 native)
- **Activity API** — `CommandActivity` for keep-alive state preservation

### Virtualization

The list component auto-virtualizes when filtered items exceed a threshold. The virtualizer uses:

- `ResizeObserver` for dynamic item height measurement
- `requestIdleCallback` for deferred measurement
- `translate3d` transforms for GPU-composited positioning
- `content-visibility: auto` for off-screen rendering skip

## WASM Search (`modern-cmdk-search-wasm`)

Optional Rust-compiled trigram index for large datasets (10K+ items).

```mermaid
sequenceDiagram
    participant Main as Main Thread
    participant Worker as Web Worker
    participant WASM as WASM Module

    Main->>Worker: postMessage({ type: 'INDEX', items })
    Worker->>WASM: index_items(serialized)
    WASM-->>Worker: indexed
    Worker-->>Main: postMessage({ type: 'INDEXED' })

    Main->>Worker: postMessage({ type: 'SEARCH', query })
    Worker->>WASM: search(query, limit)
    WASM-->>Worker: results[]
    Worker-->>Main: postMessage({ type: 'RESULTS', results })
```

### Two Execution Modes

| Mode | Function | Thread | Use Case |
|------|----------|--------|----------|
| Main thread | `createWasmSearchEngine()` | Main | Simple setup, < 5K items |
| Worker thread | `createWorkerSearchEngine()` | Web Worker | Large datasets, non-blocking UI |

Both implement the `SearchEngine` interface from the core package and support `AsyncDisposable` for `await using` cleanup.

## Resource Management

All engines implement `Disposable` or `AsyncDisposable` for automatic cleanup:

```typescript
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

## ES2026 & Cross-Browser Features

| Feature | Where Used | Native/Helper |
|---------|-----------|---------------|
| Iterator Helpers | Search pipelines, registry operations, frecency bonuses | Native ES2026 |
| `using` / `await using` | Engine lifecycle, subscription cleanup | Native ES2026 |
| `Promise.withResolvers` | Worker communication, async engine initialization | Native ES2026 |
| `RegExp.escape` | Keyboard shortcut parser | Native ES2026 |
| Set operations | Registry union/intersection/difference for group operations | Helper functions (`set-ops.ts`) |
| `mapGroupBy` / `objectGroupBy` | Shortcut conflict detection, item grouping | Helper functions (`group-by.ts`) |
| `Date.now()` | Frecency timestamps, state `lastUpdated` | Native (replaces Temporal) |
| `ensureWellFormed` | Branded ID creation | Helper function (`string-wellformed.ts`) |
