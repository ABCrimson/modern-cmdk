# Architecture

This document describes the technical architecture of `modern-cmdk` -- a ground-up rewrite of `cmdk` as a framework-agnostic, headless command palette engine.

---

## Table of Contents

- [Overview](#overview)
- [Layered Design](#layered-design)
- [Core Engine](#core-engine)
  - [State Machine](#state-machine)
  - [Command Registry](#command-registry)
  - [Event Emitter](#event-emitter)
  - [Scheduler](#scheduler)
- [Search Pipeline](#search-pipeline)
  - [Default Scorer](#default-scorer)
  - [Incremental Filtering](#incremental-filtering)
  - [Frecency Re-Ranking](#frecency-re-ranking)
  - [WASM Search Engine](#wasm-search-engine)
- [Keyboard System](#keyboard-system)
  - [Parser](#parser)
  - [Matcher](#matcher)
  - [Registry](#keyboard-shortcut-registry)
  - [Conflict Detection](#conflict-detection)
- [React 19 Adapter](#react-19-adapter)
  - [Store Integration](#store-integration)
  - [Compound Components](#compound-components)
  - [Concurrent Features](#concurrent-features)
- [Event Flow](#event-flow)
- [CSS Architecture](#css-architecture)
  - [GPU-Composited Animations](#gpu-composited-animations)
  - [Scroll-Driven Animations](#scroll-driven-animations)
  - [Content Visibility](#content-visibility)
  - [Accessibility Media Queries](#accessibility-media-queries)
- [Performance Budget](#performance-budget)
- [Design Decisions](#design-decisions)

---

## Overview

```mermaid
flowchart TB
    App["Application Layer"]

    React["modern-cmdk/react<br/>React 19 · Compound Components"]
    Future["(future)<br/>Svelte / Vue / Solid adapters"]

    subgraph core ["modern-cmdk — Framework-Agnostic Core"]
        direction TB
        SM["State Machine<br/>Pure TS · Disposable<br/>Immutable snapshots"]
        SE["Search Engine<br/>Pluggable scorer fn<br/>Incremental filtering"]
        FE["Frecency Engine<br/>Exponential time decay<br/>Pluggable storage · Disposable"]
        REG["Command Registry<br/>Items (Map) · Groups (Map) · Order (Array + Set)<br/>setIntersection / setDifference / setUnion helpers<br/>Iterator Helpers · objectGroupBy · Disposable"]
        KB["Keyboard Shortcut Registry<br/>Parser (RegExp.escape) · Matcher<br/>Conflicts (mapGroupBy) · Disposable"]
        SCH["Scheduler<br/>rAF batching (browser) · microtask (Node.js)<br/>Promise.withResolvers · Disposable"]
        SM --> REG
        SE --> REG
        FE --> REG
        REG --> KB
        REG --> SCH
    end

    WASM["modern-cmdk-search-wasm<br/>Rust / wasm-pack · Trigram index + scorer<br/>Sub-1ms on 100K items"]

    App --> React
    App -.-> Future
    React -->|"useSyncExternalStore<br/>useTransition / useOptimistic"| core
    core -.->|"Optional drop-in replacement"| WASM
```

---

## Layered Design

The architecture follows strict layering rules:

1. **Core layer** (`modern-cmdk`) -- Pure TypeScript. No DOM APIs. No framework imports. No side effects beyond subscriber notification. Runs in Node.js, Deno, Bun, or any browser.

2. **Adapter layer** (`modern-cmdk/react`) -- Thin React 19 wrapper. Consumes the core via `useSyncExternalStore`. Renders JSX. Handles DOM events. Has `"use client"` directives.

3. **Extension layer** (`modern-cmdk-search-wasm`) -- Optional WASM search engine. Drop-in replacement for the default TypeScript scorer. Ships a Rust crate compiled with `wasm-pack`.

Dependencies flow strictly downward. The core never imports from adapters or extensions.

---

## Core Engine

### State Machine

**File:** `packages/modern-cmdk/src/core/machine.ts`

The state machine is the central coordinator. It implements the `CommandMachine` interface and the `Disposable` protocol.

```
createCommandMachine(options)
         |
         v
+------------------+
|  CommandMachine   |
|                   |
|  getState()      -+-> Returns immutable CommandState snapshot
|  send(event)     -+-> Dispatches CommandEvent through scheduler
|  subscribe(fn)   -+-> useSyncExternalStore-compatible (returns () => void)
|  subscribeState  -+-> Returns Disposable for `using` pattern
|  getRegistry()   -+-> Access the CommandRegistry
|  getKeyboard..() -+-> Access the KeyboardShortcutRegistry
|  [Symbol.dispose] +-> Cleans up all subsystems
+------------------+
```

**State shape** (`CommandState`):

| Field | Type | Description |
|---|---|---|
| `search` | `string` | Current search query |
| `activeId` | `ItemId \| null` | Currently highlighted item |
| `filteredIds` | `readonly ItemId[]` | Ordered list of visible item IDs |
| `groupedIds` | `ReadonlyMap<GroupId, readonly ItemId[]>` | Items bucketed by group |
| `filteredCount` | `number` | Total visible items |
| `loading` | `boolean` | Whether async items are loading |
| `page` | `string` | Current page name |
| `pageStack` | `readonly string[]` | Page navigation history |
| `open` | `boolean` | Dialog open state |
| `lastUpdated` | `number` | Timestamp of last state change (epoch ms) |

**Event types** (`CommandEvent`):

| Event | Payload | Effect |
|---|---|---|
| `SEARCH_CHANGE` | `query: string` | Re-filters, re-ranks, updates `activeId` |
| `ITEM_SELECT` | `id: ItemId` | Fires `onSelect`, records frecency, emits to listeners |
| `ITEM_ACTIVATE` | `id: ItemId` | Sets `activeId` if item is in filtered set |
| `NAVIGATE` | `direction: next \| prev \| first \| last` | Moves `activeId` with optional loop wrapping |
| `PAGE_PUSH` | `page: string` | Pushes current page to stack, sets new page |
| `PAGE_POP` | -- | Pops page stack |
| `OPEN` / `CLOSE` / `TOGGLE` | -- | Controls dialog visibility |
| `ITEMS_LOADED` | `items: readonly CommandItem[]` | Registers items from async source |
| `REGISTER_ITEM` | `item: CommandItem` | Registers a single item + its shortcut |
| `UNREGISTER_ITEM` | `id: ItemId` | Removes item from registry, search index, keyboard registry |
| `REGISTER_GROUP` / `UNREGISTER_GROUP` | group/id | Manages group lifecycle |

All state transitions produce a new immutable `CommandState` object. The machine never mutates state in place.

### Command Registry

**File:** `packages/modern-cmdk/src/core/registry.ts`

The registry manages item and group storage with O(1) lookup performance.

```
CommandRegistry
  |
  +-- #items: Map<ItemId, CommandItem>      -- O(1) lookup
  +-- #groups: Map<GroupId, CommandGroup>    -- O(1) lookup
  +-- #itemOrder: ItemId[]                  -- insertion order
  +-- #itemOrderSet: Set<ItemId>            -- O(1) duplicate check
  |
  +-- registerItem(item) -> Disposable      -- `using` auto-deregister
  +-- registerItems(items) -> Disposable    -- batch registration
  +-- unregisterItem(id) -> void            -- single removal
  +-- unregisterItems(ids: Set) -> void     -- setDifference for pruning
  +-- registerGroup(group) -> Disposable    -- group lifecycle
  +-- unregisterGroup(id) -> void
  +-- getItem(id) / getGroup(id)            -- O(1) Map lookup
  +-- getItems() -> readonly CommandItem[]  -- Iterator Helpers pipeline, cached
  +-- getGroups() -> readonly CommandGroup[]-- sorted by priority, cached
  +-- getGroupedItems() -> ReadonlyMap      -- mapGroupBy, emitted in group-priority order
  +-- getItemIds() -> ReadonlySet<ItemId>   -- internal set, zero allocation
  +-- intersectWith / differenceFrom / unionWith / symmetricDifferenceWith
  +-- isSubsetOf / isSupersetOf / isDisjointFrom
  +-- size / groupCount (getters) · clear()
```

Cross-browser set operation helpers (`setIntersection`, `setDifference`, `setUnion`) back the set methods above -- they are used for efficient bulk ID operations during filtering and registration.

`getItems()` and `getGroups()` memoize their results and invalidate the cache on the next mutation, so repeated reads inside a single filter pass are free. `getGroupedItems()` buckets with `mapGroupBy` and then re-emits groups in `priority` order, appending an `__ungrouped` bucket last.

### Event Emitter

**File:** `packages/modern-cmdk/src/core/utils/event-emitter.ts`

A typed, GC-safe event emitter using `WeakRef` for listener storage and Iterator Helpers for pipeline operations.

Key characteristics:
- Listeners are stored as `WeakRef<Function>` -- if the consumer is garbage collected, the listener is automatically pruned on the next `emit()`.
- `.on(event, listener)` returns a `Disposable` for the `using` pattern.
- `.has(event)` and `.listenerCount(event)` use Iterator Helpers (`.some()`, `.filter().toArray().length`).
- Implements `Disposable` -- `[Symbol.dispose]()` clears all listeners.

### Scheduler

**File:** `packages/modern-cmdk/src/core/utils/scheduler.ts`

The scheduler coalesces state updates to prevent redundant re-renders:

```
Browser environment:
  schedule(update) -> pending[] -> requestAnimationFrame -> executeBatch()

Node.js / test environment:
  schedule(update) -> pending[] -> queueMicrotask -> executeBatch()
```

- Uses `Promise.withResolvers` (ES2024) for the `flush()` method.
- Uses nullish assignment (`??=`) for single-rAF coalescing: `rafId ??= requestAnimationFrame(...)`.
- Implements `Disposable` -- cancels pending rAF and clears the queue.

---

## Search Pipeline

```mermaid
flowchart LR
    A["User types query"] --> B["SEARCH_CHANGE event"]
    B --> C{"Incremental?"}
    C -->|"Query extends previous"| D["Filter previous result set only"]
    C -->|"New query"| E["Score all items"]
    D --> F["Scorer: score(query, item)"]
    E --> F
    F --> G["Sort by score descending"]
    G --> H{"Frecency enabled?"}
    H -->|Yes| I["Get frecency bonuses"]
    I --> J["Re-sort by score + bonus"]
    H -->|No| K["Final result set"]
    J --> K
    K --> L["Update filteredIds + activeId"]
    L --> M["Emit stateChange"]
```

### Default Scorer

**File:** `packages/modern-cmdk/src/core/search/default-scorer.ts`

The built-in scorer performs fuzzy matching against the item's `value` and `keywords` fields. It returns a `SearchResult` with:
- `id: ItemId` -- the matched item
- `score: number` -- relevance score (higher is better)
- `matches: ReadonlyArray<readonly [number, number]>` -- character ranges for highlighting

The scorer is pluggable -- pass a custom `filter` function to `createCommandMachine()` to replace it entirely.

### Incremental Filtering

**File:** `packages/modern-cmdk/src/core/search/index.ts`

When the user appends characters to the search query (e.g., "cop" -> "copy"), the engine only re-scores items that matched the previous query. This is tracked via:
- `previousQuery: string` -- the last query string
- `previousResults: Set<ItemId>` -- the IDs that matched

If the new query starts with the previous query, candidates are narrowed to `previousResults` before scoring. This reduces work from O(n) to O(k) where k << n.

Bulk removal uses `Set.difference` (ES2026) to efficiently prune the incremental cache.

### Frecency Re-Ranking

**File:** `packages/modern-cmdk/src/core/frecency/index.ts`

After scoring, results are optionally re-ranked by frecency bonus:

```
Final rank = search_score + frecency_bonus
```

The frecency bonus is computed using exponential decay buckets based on elapsed time since last use:

| Time Since Last Use | Weight |
|---|---|
| < 1 hour | 4.0 |
| < 1 day | 2.0 |
| < 1 week | 1.5 |
| < 1 month | 1.0 |
| Older | 0.5 |

```
frecency_bonus = frequency_count * recency_weight
```

Time elapsed is computed using `(Date.now() - lastUsed) / 3_600_000` for hours. The `FrecencyEngine` implements `Disposable` -- on dispose, it flushes dirty data to storage (best-effort for async storage).

**Storage interface:**

```ts
interface FrecencyStorage extends Disposable {
  load(namespace: string): FrecencyData | Promise<FrecencyData>;
  save(namespace: string, data: FrecencyData): void | Promise<void>;
  [Symbol.dispose](): void;
}
```

Ships with `MemoryFrecencyStorage` (in-memory, no persistence) and `IdbFrecencyStorage` (IndexedDB persistence via `idb-keyval`, which is lazy-loaded on first use so non-persisting consumers never pay for it).

### WASM Search Engine

**File:** `packages/command-search-wasm/crate/src/`

The optional WASM engine provides:
- **Trigram indexing** -- pre-computes 3-character subsequences for O(1) candidate lookup
- **Rust scorer** -- native performance for fuzzy matching
- **Sub-1ms on 100K items** -- orders of magnitude faster than the TypeScript scorer at scale

The WASM engine implements the same `ScorerFn` interface and is a drop-in replacement.

---

## Keyboard System

```mermaid
flowchart TB
    A["Shortcut string<br/>e.g. 'Mod+Shift+K'"] --> B["Parser<br/>parseShortcut()"]
    B --> C["ParsedShortcut<br/>{key, meta, ctrl, shift, alt, normalized}"]
    C --> D["Registry<br/>KeyboardShortcutRegistry"]
    D --> E["Global keydown listener"]
    E --> F["Matcher<br/>matchesShortcut(event, parsed)"]
    F -->|Match| G["Execute handler<br/>preventDefault + stopPropagation"]
    F -->|No match| H["Pass through"]

    D --> I["Conflict detection<br/>detectConflicts()"]
    I --> J["mapGroupBy(shortcuts, s => s.normalized)"]
    J --> K["Map of conflicts<br/>(normalized -> shortcuts[])"]
```

### Parser

**File:** `packages/modern-cmdk/src/core/keyboard/parser.ts`

Parses human-readable shortcut strings into structured `ParsedShortcut` objects:

- `"Mod+K"` -- resolves `Mod` to `Meta` on macOS, `Ctrl` on Windows/Linux
- `"Ctrl+Shift+P"` -- explicit modifier specification
- `"Alt+Enter"` -- named key support
- Aliases: `Cmd`/`Command` -> `meta`, `Option`/`Opt` -> `alt`, `Control` -> `ctrl`

Uses `RegExp.escape` (ES2026) for safe pattern construction from user-provided strings.

The `normalized` field produces a deterministic modifier ordering (`meta+ctrl+shift+alt+key`) for deduplication and conflict comparison.

`formatShortcut()` renders platform-appropriate display labels (Mac symbols vs. Windows text).

### Matcher

**File:** `packages/modern-cmdk/src/core/keyboard/matcher.ts`

Compares `KeyboardEvent` properties against `ParsedShortcut` fields. All four modifier keys (`metaKey`, `ctrlKey`, `shiftKey`, `altKey`) must match exactly -- no partial matching.

### Keyboard Shortcut Registry

**File:** `packages/modern-cmdk/src/core/keyboard/index.ts`

Global shortcut management:

- `.register(shortcutStr, itemId, handler)` returns a `Disposable` -- enables `using` for automatic deregistration when the owning component unmounts.
- Attaches a single `document.addEventListener('keydown', ...)` listener.
- Safe in SSR -- checks `typeof document` before attaching.
- Implements `Disposable` -- removes the global listener and clears all bindings.

### Conflict Detection

Uses the `mapGroupBy` helper to group shortcuts by normalized form:

```ts
const grouped = mapGroupBy(shortcuts, (s) => s.normalized);
// Any group with length > 1 is a conflict
return new Map(grouped.entries().filter(([, group]) => group.length > 1));
```

---

## React 19 Adapter

### Store Integration

```mermaid
flowchart LR
    A["CommandMachine"] -->|"subscribe(listener)"| B["useSyncExternalStore"]
    A -->|"getState()"| B
    B --> C["React re-render"]
    C --> D["Compound components<br/>read context"]
```

The machine's `.subscribe()` returns an unsubscribe function -- the exact signature `useSyncExternalStore` expects. No wrapper needed.

The machine's `.getState()` returns the same object reference until the next state change -- this satisfies `useSyncExternalStore`'s identity check.

### Compound Components

All components consume the machine via React context using `use(CommandContext)` (React 19):

| Component | Role | Key Props |
|---|---|---|
| `Command` | Root -- creates machine, provides context | `label`, `filter`, `loop`, `frecency` |
| `Command.Dialog` | Radix Dialog wrapper with overlay and portal | `open`, `onOpenChange` |
| `Command.Input` | Search input bound to machine state | `placeholder`, `value`, `onValueChange` |
| `Command.List` | Scrollable list with auto-virtualization and `aria-live` | `virtualize` |
| `Command.Item` | Selectable item -- registers/unregisters on mount/unmount | `value`, `onSelect`, `shortcut`, `disabled` |
| `Command.Group` | Logical group with heading | `heading` |
| `Command.Empty` | Rendered when `filteredCount === 0` | -- |
| `Command.Loading` | Rendered when `state.loading === true` | -- |
| `Command.Separator` | Visual divider | -- |
| `Command.Highlight` | Fuzzy match character highlighting | -- |
| `Command.Badge` | Status badge on items | -- |
| `Command.Shortcut` | Keyboard shortcut display (platform-aware) | -- |
| `Command.Page` | Nested page for hierarchical navigation | `id` |
| `Command.AsyncItems` | Suspense-powered async data loading | `items` (a `Promise<readonly CommandItem[]>`), `fallback`, `children` (render fn) |
| `Command.Activity` | React Activity API state preservation (falls back to conditional rendering) | `mode` |

All components:
- Have `"use client"` directives
- Accept `ref` as a prop (React 19 -- no `forwardRef`)
- Use `useId()` for stable, SSR-safe ARIA IDs

### Concurrent Features

| React 19 Feature | Usage |
|---|---|
| `useSyncExternalStore` | Subscribe to machine state without tearing |
| `useTransition` | Wrap search updates -- keeps input responsive during heavy filtering |
| `useOptimistic` | Optimistic `activeId` updates -- instant visual feedback on navigation |
| `useId` | Generate stable IDs for `aria-labelledby`, `aria-controls`, `aria-activedescendant` |
| `use()` | Consume `CommandContext` (replaces `useContext`) |
| `ref` as prop | All components accept `ref` directly -- no `forwardRef` wrapper |

---

## Event Flow

Complete cycle from user action to re-render:

```mermaid
sequenceDiagram
    participant User
    participant React as React Adapter
    participant Machine as State Machine
    participant Search as Search Engine
    participant Frecency as Frecency Engine
    participant Scheduler

    User->>React: Types in Input
    React->>React: useTransition(() => ...)
    React->>Machine: send({ type: 'SEARCH_CHANGE', query })
    Machine->>Scheduler: schedule(handleEvent)
    Scheduler->>Machine: executeBatch()
    Machine->>Search: search(query, items)
    Search->>Search: Incremental filter (if applicable)
    Search->>Search: Score candidates via scorer fn
    Search-->>Machine: Iterator<SearchResult>
    Machine->>Frecency: getAllBonuses()
    Frecency-->>Machine: Map<ItemId, number>
    Machine->>Machine: Sort by score + bonus
    Machine->>Machine: Build groupedIds, select activeId
    Machine->>Machine: setState(newState) -- new immutable snapshot
    Machine->>React: emit('stateChange', state)
    React->>React: useSyncExternalStore triggers re-render
    React->>React: useOptimistic resolves activeId
    React->>User: Updated UI
```

---

## CSS Architecture

### GPU-Composited Animations

**File:** `packages/modern-cmdk/src/react/styles.css`

All animations use compositor-only properties (`opacity`, `scale`, `translate`) to avoid layout thrashing:

```
Dialog open:
  @starting-style { opacity: 0; scale: 0.96; translate: 0 8px; }
  -> opacity: 1; scale: 1; translate: 0 0;
  -> opacity 200ms spring linear() easing
  -> scale/translate 250ms bouncy spring linear() easing (slight overshoot)
  -> display/overlay: allow-discrete

Dialog close:
  -> opacity: 0; scale: 0.96; translate: 0 4px;
  -> 150ms cubic-bezier(0.4, 0, 1, 1)  // quicker, no spring overshoot

Item active:
  -> background-color transition 120ms, linear() eased
  -> content-visibility: auto skips off-screen item rendering
```

The spring easings are `linear()` approximations of a critically-damped spring (stiffness 100, damping 15) -- real spring physics with zero JavaScript.

`@starting-style` (CSS Nesting level) enables entry animations without JavaScript -- the browser interpolates from the starting style to the final style on first render.

`display` and `overlay` transitions use `allow-discrete` for animating to/from `display: none`.

### Scroll-Driven Animations

`styles.css` declares a `scroll-timeline` on the list and a matching progress-indicator
rule driven by it:

```css
[data-command-list] {
  scroll-timeline: --list-scroll block;
}

[data-command-scroll-indicator] {
  animation: scroll-progress linear;
  animation-timeline: --list-scroll;
}
```

No JavaScript scroll event listeners. Zero main-thread cost.

> [!NOTE]
> The timeline is declared, but **no built-in component renders a
> `[data-command-scroll-indicator]` element** -- the rule is a styling hook for consumers
> who want a progress bar. Render your own element with that attribute inside
> `<Command.List>` and it picks up the timeline with no JavaScript.

### Content Visibility

All items (and virtualized items) use `content-visibility: auto` with `contain-intrinsic-size`:

```css
[data-command-item],
[data-command-virtual-item] {
  content-visibility: auto;
  contain-intrinsic-size: auto var(--command-item-height); /* 44px */
}
```

The browser skips rendering off-screen items entirely. Combined with the auto-virtualization threshold, this provides smooth scrolling even with 100K+ items.

### Accessibility Media Queries

| Media Query | Behavior |
|---|---|
| `prefers-reduced-motion: reduce` | Disables all animations and transitions |
| `prefers-contrast: more` | Thicker outlines (3px) on active/focused items |
| `forced-colors: active` | Uses system `Highlight`/`HighlightText` colors, disables `forced-color-adjust` |

CSS custom properties (`@property`) are registered for `--command-list-height` and `--command-count` with proper syntax and initial values, enabling animatable custom properties.

---

## Performance Budget

| Metric | Target | Enforcement |
|---|---|---|
| Core bundle (minified + gzipped) | ≤ 6.5 kB | `size-limit` in CI |
| React adapter bundle (minified + gzipped; react/react-dom/radix-ui externalized) | ≤ 12 kB | `size-limit` in CI |
| WASM search (minified + gzipped) | ≤ 50 KB | Target only (package unpublished, not in `size-limit`) |
| Search latency (10K items, TS scorer) | < 16 ms | Vitest bench |
| Search latency (100K items, WASM scorer) | < 1 ms | Vitest bench |
| Time to first render | < 50 ms | Playwright performance trace |
| State update cycle (send -> re-render) | < 4 ms | Vitest bench |
| Filter 10K items (incremental) | < 2 ms | Vitest bench |
| Memory per 10K items | < 5 MB | Playwright heap snapshot |
| Coverage threshold | 80% statements/lines, 75% functions, 70% branches | `pnpm test:coverage` (Vitest V8) |

Bundle sizes are enforced on every push via the `size` CI job. Benchmarks run in a dedicated CI workflow with `pnpm bench:ci`.

---

## Design Decisions

### Why `useSyncExternalStore` over React Context for state?

React Context triggers re-renders in all consumers when any value changes. The machine exposes a single state object that changes on every event. Using context would cause every `Command.Item` to re-render on every keystroke.

`useSyncExternalStore` integrates with React's concurrent rendering pipeline. It guarantees no tearing, supports selective subscription, and the identity check on `getState()` means React can bail out of re-renders when the snapshot reference hasn't changed.

### Why a pure TypeScript core with no framework code?

1. **Testability** -- The core can be tested with Vitest in a Node.js environment, no DOM simulation needed. Tests run in milliseconds, not seconds.
2. **Portability** -- A Svelte, Vue, or Solid adapter can wrap the same core. The state machine logic is written once.
3. **Bundle efficiency** -- Users who only need the core (e.g., for a CLI tool or a non-React app) get a ~6.3 KB (gzipped) bundle whose only runtime dependency, `idb-keyval`, is lazy-loaded and tree-shaken away unless IndexedDB frecency persistence is used.
4. **Separation of concerns** -- Framework quirks (React's batching, Svelte's reactivity) are isolated in the adapter layer.

### Why `Date.now()` for timestamps?

- Simple epoch milliseconds (`number`) fit the immutable state model with zero serialization overhead.
- Elapsed hours computed via `(Date.now() - lastUsed) / 3_600_000` -- straightforward and cross-browser compatible.
- No polyfill or runtime dependency required (Temporal API was previously used but is not yet available in browsers).

### Why ES2026 target?

The project targets Node.js 26.4.0+, which ships many ES2026 features natively. Benefits:

- **Iterator Helpers** (`map`, `filter`, `toArray`, `some`, `forEach`) -- pipeline operations on Map/Set iterators without intermediate arrays.
- **`using` / `await using`** -- Explicit Resource Management prevents leaked listeners, timers, and storage connections. Every class implements `Disposable`.
- **`Promise.withResolvers`** -- Clean scheduler flush implementation.
- **`RegExp.escape`** -- Safe pattern construction from user-provided shortcut strings.

Some ES2026 features (Set methods, `Map.groupBy`, `Object.groupBy`, `Promise.try`, `Temporal`, `Math.sumPrecise`) are replaced with cross-browser helper functions to ensure compatibility with current browsers via the tsdown build pipeline.

### Why `Disposable` everywhere?

Every stateful object (machine, registry, emitter, scheduler, frecency engine, keyboard registry) implements `[Symbol.dispose]()`. This enables:

```ts
// Automatic cleanup -- no manual teardown
using machine = createCommandMachine({ ... });
// machine is disposed when the block exits

// In React components
useEffect(() => {
  const sub = machine.subscribeState(listener);
  return () => sub[Symbol.dispose]();
}, []);
```

Without `Disposable`, cleanup relies on convention. With it, the compiler and runtime enforce it.

### Why Radix UI for the React adapter dialog?

The `Command.Dialog` component wraps Radix UI's Dialog primitive for:
- Portal rendering (escapes z-index stacking contexts)
- Focus trapping and restoration
- Scroll locking
- Escape key handling
- Overlay click-to-close

Building a production-quality dialog from scratch would add significant bundle size and maintenance burden. Radix provides these behaviors in a well-tested, accessible package.

### Why Vite 8 for the playground?

The interactive playground uses **Vite 8.2.2** with `@vitejs/plugin-react` 6.1.0. Key benefits:

- **ES2026 build target** -- No downleveling of Iterator Helpers, Set methods, or `using` syntax.
- **Native CSS nesting** -- Vite 8 passes through CSS nesting, `@layer`, and `@starting-style` without transformation.
- **Environment API** -- Vite 8's new Environment API enables better dev/prod parity.
- **HMR warmup** -- Frequently used modules are pre-transformed for instant HMR feedback.

### Why `@starting-style` over JavaScript animations?

`@starting-style` enables CSS-only entry animations:
- Zero JavaScript execution for animation setup
- Compositor-thread only -- no main thread blocking
- Works with `display: none` transitions via `allow-discrete`
- Gracefully degrades in older browsers (no animation, but no breakage)
- Respects `prefers-reduced-motion` via a single CSS rule

JavaScript animation libraries (Framer Motion, React Spring) would add 10-30 KB to the bundle and require main-thread execution.

### Why branded types for IDs?

```ts
type ItemId = string & { readonly __brand: unique symbol };
type GroupId = string & { readonly __brand: unique symbol };
```

This prevents accidentally passing a `GroupId` where an `ItemId` is expected. The runtime cost is zero -- brands are erased by the compiler. TypeScript 7's improved `unique symbol` inference makes this pattern ergonomic.

### Why a scoped `sideEffects` array?

`package.json` declares `"sideEffects": ["./dist/react/styles.css", "./dist/react/index.mjs"]`. Listing only the React entry and its stylesheet tells bundlers (Vite, webpack, Rollup) that *every other* module -- the entire framework-agnostic core -- is side-effect-free and can be tree-shaken when its exports are unused. Consumers who only import `createCommandMachine` do not pay for `KeyboardShortcutRegistry` or `FrecencyEngine`, while the listed entries are preserved so `import "modern-cmdk/styles.css"` is never dropped.

---

## File Map

```
packages/modern-cmdk/src/core/
  index.ts               -- Public API exports
  types.ts               -- Branded types, interfaces, defaults
  machine.ts             -- State machine (createCommandMachine)
  registry.ts            -- Item/group registry (Map + Set)
  telemetry.ts           -- Telemetry middleware hooks
  es2026.d.ts            -- Ambient declarations for ES2026 features
  search/
    types.ts             -- SearchEngine, SearchResult, ScorerFn
    index.ts             -- Search engine factory (incremental filtering)
    default-scorer.ts    -- Built-in fuzzy scorer
    fuzzy-scorer.ts      -- Async scorer
  frecency/
    index.ts             -- FrecencyEngine (Date.now, Disposable)
    storage.ts           -- FrecencyStorage interface
    memory-storage.ts    -- In-memory storage implementation
    idb-storage.ts       -- IndexedDB storage (idb-keyval, lazy-loaded)
  keyboard/
    parser.ts            -- Shortcut string parser (RegExp.escape)
    matcher.ts           -- KeyboardEvent matcher
    index.ts             -- KeyboardShortcutRegistry (Disposable)
  utils/
    event-emitter.ts     -- TypedEmitter (WeakRef, Iterator Helpers)
    scheduler.ts         -- rAF/microtask batching (Promise.withResolvers)
    set-ops.ts           -- Cross-browser Set operation helpers
    group-by.ts          -- mapGroupBy / objectGroupBy helpers
    string-wellformed.ts -- ensureWellFormed()

packages/modern-cmdk/src/react/
  index.ts               -- Public API exports
  command.tsx            -- <Command> root component
  context.ts             -- React context definitions
  dialog.tsx             -- <Command.Dialog> (Radix)
  input.tsx              -- <Command.Input>
  list.tsx               -- <Command.List> (virtualization, ResizeObserver)
  item.tsx               -- <Command.Item> (register/unregister lifecycle)
  group.tsx              -- <Command.Group>
  empty.tsx              -- <Command.Empty>
  loading.tsx            -- <Command.Loading>
  separator.tsx          -- <Command.Separator>
  highlight.tsx          -- <Command.Highlight> (match ranges)
  badge.tsx              -- <Command.Badge>
  shortcut.tsx           -- <Command.Shortcut> (platform-aware)
  page.tsx               -- <Command.Page>
  activity.tsx           -- <Command.Activity> (Activity API)
  async-items.tsx        -- <Command.AsyncItems> (Suspense)
  error-boundary.tsx     -- <CommandErrorBoundary>
  primitives.ts          -- Shared primitive utilities
  styles.css             -- GPU-composited animations
  hooks/
    use-command.ts       -- useCommand hook
    use-command-setup.ts -- Machine creation + wiring for <Command>
    use-command-state.ts -- useCommandState hook
    use-register.ts      -- useRegisterItem, useRegisterGroup
    use-virtualizer.ts   -- useVirtualizer hook
    use-keyboard.ts      -- createKeydownHandler
    use-devtools.ts      -- useCommandDevtools hook

packages/modern-cmdk/src/codemod/
  cli.ts                 -- Codemod CLI runner (bin: modern-cmdk)
  transforms/            -- import-rewrite, data-attrs, forward-ref, should-filter

packages/command-search-wasm/
  src/
    index.ts             -- TypeScript entry point
    wasm-engine.ts       -- Main-thread WASM engine wrapper
    worker-engine.ts     -- Web Worker engine wrapper
    worker.ts            -- Worker entry
  crate/
    Cargo.toml           -- Rust crate configuration (edition 2024)
    src/
      lib.rs             -- WASM entry point
      trigram.rs          -- Trigram index implementation
      scorer.rs           -- Rust fuzzy scorer
```
