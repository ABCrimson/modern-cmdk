---
title: Architecture Overview
description: Three-layer architecture, state machine design, data flow, and plugin system for modern-cmdk.
---

# Architecture Overview

`modern-cmdk` is built as a three-layer architecture: a framework-agnostic core engine, a React 19 adapter, and optional performance plugins. Each layer has a single responsibility and communicates through well-defined interfaces.

## Three-Layer Architecture

```mermaid
graph TB
    subgraph "Layer 3: Optional Plugins"
        WASM["modern-cmdk-search-wasm\nRust/WASM trigram index"]
        WORKER["Web Worker Engine\nOff-main-thread search"]
    end

    subgraph "Layer 2: React 19 Adapter"
        REACT["modern-cmdk/react\nCompound components"]
        HOOKS["useSyncExternalStore\nuseTransition\nuseOptimistic"]
    end

    subgraph "Layer 1: Core Engine"
        MACHINE["State Machine\nPure TypeScript"]
        SEARCH["Search Engine\nPluggable scorer"]
        FRECENCY["Frecency Engine\nTime-based decay"]
        KEYBOARD["Keyboard Registry\nShortcut parser"]
    end

    REACT --> MACHINE
    HOOKS --> MACHINE
    WASM --> SEARCH
    WORKER --> WASM
    MACHINE --> SEARCH
    MACHINE --> FRECENCY
    MACHINE --> KEYBOARD
```

### Layer 1: Core Engine (`modern-cmdk`)

Pure TypeScript state machine with no hard DOM dependency (DOM APIs are feature-detected and SSR-safe). Manages:

- **Item registry** -- Registration, deregistration, grouping
- **Search and filtering** -- Pluggable `SearchEngine` interface
- **Frecency ranking** -- Time-based decay buckets with configurable weights
- **Keyboard shortcuts** -- Shortcut string parser, conflict detection via groupBy helper
- **Navigation** -- Active item tracking, page stack, loop/no-loop
- **State snapshots** -- Immutable `CommandState` objects for efficient change detection

The core has no side effects beyond subscriber notification. It can be used with any UI framework or no framework at all.

### Layer 2: React Adapter (`modern-cmdk/react`)

Compound component API that bridges the core state machine to React 19:

- **`useSyncExternalStore`** -- Subscribes to machine state without tearing
- **`useTransition`** -- Wraps only the optimistic active-item update; `Command.Input` keeps an urgent draft value and the machine catches up on its scheduler tick, so `isPending` never reflects a search
- **`useOptimistic`** -- Optimistic active item updates for instant visual feedback
- **`ref` as prop** -- React 19 native ref forwarding (no `forwardRef`)
- **`"use client"` directive** -- All components are client-only
- **Radix UI integration** -- Dialog with focus trap, portal, overlay

### Layer 3: Optional Plugins

- **WASM Search** -- Rust trigram index compiled to WebAssembly for fuzzy search over large item sets
- **Web Worker** -- Runs WASM search off the main thread with `SharedArrayBuffer` zero-copy transfer
- **Custom storage** -- Pluggable `FrecencyStorage` implementations (memory, IndexedDB, custom)

## State Machine Flow

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Searching: SEARCH_CHANGE
    Searching --> Filtered: filter + rank
    Filtered --> Idle: results committed
    Idle --> Active: NAVIGATE / ITEM_ACTIVATE
    Active --> Selected: ITEM_SELECT
    Selected --> Idle: onSelect callback
    Active --> Active: NAVIGATE (next/prev)

    state "Dialog" as Dialog {
        Closed --> Open: OPEN / TOGGLE
        Open --> Closed: CLOSE / TOGGLE / Escape
    }

    state "Pages" as Pages {
        Root --> SubPage: PAGE_PUSH
        SubPage --> Root: PAGE_POP / Backspace
        SubPage --> SubPage: PAGE_PUSH (nested)
    }
```

### Event Processing

1. External code calls `machine.send(event)`
2. The machine processes the event synchronously
3. A new immutable `CommandState` snapshot is created
4. All subscribers are notified with the new state
5. React `useSyncExternalStore` triggers a re-render with the new snapshot

## Data Flow: Items to Rendered Output

```mermaid
flowchart LR
    ITEMS[Registered Items] --> SEARCH[Search Engine]
    QUERY[Search Query] --> SEARCH
    SEARCH --> SCORED[Scored Results]
    SCORED --> FRECENCY[Frecency Boost]
    FRECENCY --> SORTED[Sorted + Filtered]
    SORTED --> GROUPS[Grouped by GroupId]
    GROUPS --> VIRTUAL{filteredCount > 100?}
    VIRTUAL -->|Yes| VIRTUALIZER[Virtualizer]
    VIRTUAL -->|No| DOM[Full DOM Render]
    VIRTUALIZER --> RENDER[Visible Items Only]
    DOM --> RENDER
```

### Search Pipeline

1. **Registration** -- Items are registered via `REGISTER_ITEM` events (or React component mount)
2. **Query** -- User types in the input, triggering `SEARCH_CHANGE`
3. **Scoring** -- The search engine (TypeScript or WASM) scores each item against the query
4. **Frecency boost** -- If enabled, frecency bonuses are added to search scores
5. **Filtering** -- Items with score `0` or `false` are excluded
6. **Sorting** -- Results are sorted by final score (descending)
7. **Grouping** -- Results are partitioned into groups based on `groupId`
8. **Rendering** -- React adapter renders visible items, virtualizing if needed

::: tip Virtualization is latched, not a bare threshold
The `filteredCount > 100` test in the diagram above is the **turn-on** edge. Once
virtualization engages it stays engaged until the count falls to **50 or below**. That
hysteresis band stops a query hovering around 100 results from thrashing the list between
virtualized and full-DOM rendering on every keystroke. An explicit `virtualize` prop on
`<Command.List>` overrides both edges.
:::

## Component Tree

```mermaid
graph TD
    CMD["Command (Root)"]
    CMD --> INPUT["Command.Input\nrole=combobox"]
    CMD --> LIST["Command.List\nrole=listbox"]
    LIST --> GROUP1["Command.Group\nrole=group"]
    LIST --> SEP["Command.Separator\nrole=separator"]
    LIST --> GROUP2["Command.Group"]
    GROUP1 --> ITEM1["Command.Item\nrole=option"]
    GROUP1 --> ITEM2["Command.Item"]
    GROUP2 --> ITEM3["Command.Item"]
    ITEM1 --> SHORT["Command.Shortcut\nkbd element"]
    ITEM1 --> BADGE["Command.Badge\nspan element"]
    LIST --> EMPTY["Command.Empty\nrole=status"]
    LIST --> LOADING["Command.Loading\naria-busy"]
    LIST --> LIVE["aria-live region\nsr-only"]

    DIALOG["Command.Dialog"] --> OVERLAY["Radix Overlay"]
    DIALOG --> CONTENT["Radix Content"]
    CONTENT --> CMD
```

## WASM Worker Communication

```mermaid
sequenceDiagram
    participant Main as Main Thread
    participant Worker as Web Worker
    participant WASM as WASM Module

    Main->>Worker: new Worker()
    Worker->>WASM: import WASM binary
    WASM-->>Worker: Module loaded
    Worker-->>Main: { type: ready }

    Main->>Worker: { type: index, items }
    Worker->>WASM: index_items(serialized)
    WASM-->>Worker: Trigram index built
    Worker-->>Main: { type: indexed }

    Main->>Worker: { type: search, query, scoresBuffer }
    Worker->>WASM: search(query, maxResults)
    WASM-->>Worker: Raw results
    Worker->>Worker: Write scores to SharedArrayBuffer
    Worker-->>Main: { type: results-sab, ids, matches }
    Main->>Main: Read Float32Array (zero-copy)

    Main->>Worker: { type: dispose }
    Worker->>WASM: instance.free()
    Worker->>Worker: self.close()
```

When `SharedArrayBuffer` is available (cross-origin isolated), scores are written directly into shared memory. The main thread reads the `Float32Array` view without any data copying.

Without `SharedArrayBuffer`, results are transferred via structured clone (`postMessage`), which involves a copy but remains fast for typical result set sizes (< 100 items).

## Plugin Architecture

### Search Engine Interface

Any object implementing `SearchEngine` can replace the built-in TypeScript scorer:

```typescript
interface SearchEngine extends Disposable {
  index(items: readonly CommandItem[]): void;
  search(query: string, items: readonly CommandItem[]): IteratorObject<SearchResult>;
  remove(ids: ReadonlySet<ItemId>): void;
  clear(): void;
  [Symbol.dispose](): void;
}
```

::: warning `SearchEngine` extends `Disposable`
`[Symbol.dispose]()` is **required**, not optional -- a custom engine without it will not
typecheck. The machine disposes its engine when the machine itself is disposed, so this is
where you release indexes, workers, or WASM instances.
:::

### Frecency Storage Interface

Custom storage backends implement `FrecencyStorage`:

```typescript
interface FrecencyStorage extends Disposable {
  load(namespace: string): FrecencyData | Promise<FrecencyData>;
  save(namespace: string, data: FrecencyData): void | Promise<void>;
  [Symbol.dispose](): void;
}
```

Built-in implementations:
- **`MemoryFrecencyStorage`** -- In-memory `Map`, no persistence (default)
- **`IdbFrecencyStorage`** -- IndexedDB via `idb-keyval`, persists across sessions

### Extending the Architecture

To add a custom search engine:

```typescript
import { createCommandMachine, type SearchEngine } from 'modern-cmdk';

const myEngine: SearchEngine = {
  index(items) { /* build your index */ },
  *search(query, items) { /* yield SearchResult objects */ },
  remove(ids) { /* remove from index */ },
  clear() { /* clear index */ },
  [Symbol.dispose]() { /* release the index, worker, or WASM instance */ },
};

using machine = createCommandMachine({ search: myEngine });
```

To add a custom frecency storage:

```typescript
import type { FrecencyData, FrecencyStorage } from 'modern-cmdk';

class RedisFrecencyStorage implements FrecencyStorage {
  async load(namespace: string): Promise<FrecencyData> {
    /* fetch from Redis */
    return { records: new Map() };
  }
  async save(namespace: string, data: FrecencyData): Promise<void> { /* write to Redis */ }
  [Symbol.dispose]() { /* close connection */ }
}
```

## Build Output

`packages/modern-cmdk/tsdown.config.ts` holds three tsdown configs:

1. **The core** (`dist/core/index.mjs`, with declarations).
2. **The React adapter**: two entries, `modern-cmdk/react` and `modern-cmdk/react/dialog`, in one config so the code both use (context, hooks, `CommandDialog`) is emitted once as a shared chunk in `dist/react`. The core is external: the adapter imports it as `modern-cmdk`, so a bundle holds one core, not a second copy inlined into the adapter. `radix-ui` stays external too, and every output carries a `'use client'` banner. `styles.css` is copied to `dist/react/styles.css`.
3. **The codemod** (`dist/codemod`): the CLI and its transforms, bundled with their dependencies, without declarations because it is a CLI and not an importable API.

`sideEffects` in `packages/modern-cmdk/package.json` is `["./dist/react/styles.css"]` only. `Command.Dialog` is a member of the `Command` compound, so every `modern-cmdk/react` import loads `radix-ui`, and `radix-ui` is a required peer dependency (`>=1.4.0 <2.0.0`) through 1.x. See [Server-Side Rendering](/guide/ssr#tree-shaking) for the measured consequence for bundle size.

## Language Features & Editions

| Feature | Edition | Where Used | Native/Helper |
|---|---|---|---|
| Iterator Helpers (`.map`, `.filter`, `.toArray`) | ES2025 | Search pipelines, registry operations | Native |
| `Symbol.dispose` / `Symbol.asyncDispose` (`using` / `await using`) | ESNext (TS `lib` `esnext.disposable`) | Machine, engine and storage lifecycle implement the protocol, so consumers can write `using` | Native |
| `Promise.withResolvers()` | ES2024 | Worker request tracking in the unpublished `modern-cmdk-search-wasm` package | Native |
| `RegExp.escape` | ES2025 | Not used | -- |
| `Map.groupBy` / `Object.groupBy` | ES2024 | Shortcut conflict detection, item grouping | Helper functions |
| `Date.now()` | ES5 | Frecency timestamps, state `lastUpdated` | Native (replaces Temporal) |
| Set methods (`setIntersection`, etc. are the helpers) | ES2025 | Registry bulk operations | Helper functions |
| `String.prototype.toWellFormed` | ES2024 | Branded ID creation | Helper function |
| Branded types (`ItemId`, `GroupId`) | TypeScript | Type-safe ID handling | Compile-time (erased) |
| `satisfies` | TypeScript | Default configuration validation | Compile-time (erased) |
