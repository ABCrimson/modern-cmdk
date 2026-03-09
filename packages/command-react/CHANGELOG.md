# @crimson_dev/command-react

## 1.0.0

### Minor Changes

- [`b1d073a`](https://github.com/ABCrimson/modern-cmdk/commit/b1d073a0bf541d48c8e7d6fa64009294b80a8326) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Release candidate 0.9.0 — feature-complete, API freeze.

  ### Core Engine (`@crimson_dev/command`)

  - Pure TypeScript state machine with zero DOM dependencies
  - Pluggable `SearchEngine` interface with built-in fuzzy scorer
  - Incremental filtering with `Set.difference` optimization
  - `FrecencyEngine` with `Temporal.Duration` decay buckets
  - `MemoryFrecencyStorage` and `IdbFrecencyStorage` persistence
  - `KeyboardShortcutRegistry` with `RegExp.escape` parser and `Object.groupBy` conflict detection
  - `TypedEmitter` with `WeakRef`-based GC-safe listeners
  - Batched scheduler with `requestAnimationFrame`, `scheduler.yield()`, `isInputPending()`
  - All classes implement `Disposable` / `AsyncDisposable`
  - Branded types (`ItemId`, `GroupId`) for type-safe IDs

  ### React Adapter (`@crimson_dev/command-react`)

  - 14 compound components with `"use client"` directive
  - `useSyncExternalStore` for tear-free state subscription
  - `useTransition` for non-blocking search updates
  - `useOptimistic` for instant active item feedback
  - `use()` hook for Suspense-powered async loading
  - `ref` as prop (React 19 native, no `forwardRef`)
  - Radix UI Dialog with focus trap, portal, overlay
  - GPU-composited CSS: `@starting-style`, spring `linear()`, `scroll-timeline`
  - Automatic virtualization at 100+ items with `content-visibility: auto`
  - Full WAI-ARIA combobox pattern, `forced-colors`, `prefers-reduced-motion`

  ### WASM Search (`@crimson_dev/command-search-wasm`)

  - Rust trigram index compiled to WebAssembly
  - Main-thread and Web Worker execution modes
  - `SharedArrayBuffer` zero-copy score transfer
  - Two-row DP Levenshtein (O(min(a,b)) memory)

  ### Codemods (`@crimson_dev/command-codemod`)

  - 4 transforms: import-rewrite, data-attrs, forward-ref, should-filter
  - CLI with `--dry-run`, `--transform`, file globbing

### Patch Changes

- Updated dependencies [[`b1d073a`](https://github.com/ABCrimson/modern-cmdk/commit/b1d073a0bf541d48c8e7d6fa64009294b80a8326)]:
  - @crimson_dev/command@0.10.0
