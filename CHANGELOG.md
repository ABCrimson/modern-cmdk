# Changelog

All notable changes to `@crimson_dev/command` packages are documented here.

## [0.10.0] - 2026-03-09

### Changed
- `@crimson_dev/command` — 0.9.0 → 0.10.0 (minor)
- `@crimson_dev/command-react` — 0.9.0 → 1.0.0 (major)
- `@crimson_dev/command-codemod` — 0.9.0 → 0.10.0 (minor)

### Fixed
- Resolved dual React instance issue (pnpm overrides for single canary version)
- Fixed all Biome lint violations across the entire codebase (~60 errors)
- Fixed CI bundle size job (heredoc for multi-line JSON in GITHUB_OUTPUT)
- Fixed changeset release for private WASM package
- Updated lockfile for release version bump

### Improved
- All `!` non-null assertions replaced with safe `as Type` casts
- Explicit return/parameter types on all exports (isolatedDeclarations compliance)
- Optimized search scorer to outperform cmdk on all benchmarks

---

## [0.9.0] - 2026-03-07

### Added — Core Engine (`@crimson_dev/command`)
- Pure TypeScript state machine with zero DOM dependencies
- Pluggable `SearchEngine` interface with built-in fuzzy scorer
- Incremental filtering — query-append optimization using `Set.difference`
- `FrecencyEngine` with `Temporal.Duration` decay buckets (hour/day/week/month)
- `MemoryFrecencyStorage` (in-memory) and `IdbFrecencyStorage` (IndexedDB persistence)
- `KeyboardShortcutRegistry` with `RegExp.escape` parser and `Object.groupBy` conflict detection
- `TypedEmitter` with `WeakRef`-based GC-safe listeners
- Batched scheduler with `requestAnimationFrame`, `scheduler.yield()`, `isInputPending()`
- `FinalizationRegistry` dev-only leak detection for search engines
- All classes implement `Disposable` / `AsyncDisposable` for `using` / `await using`
- Branded types (`ItemId`, `GroupId`) for type-safe ID handling

### Added — React Adapter (`@crimson_dev/command-react`)
- 14 compound components: Command, Input, List, Item, Group, Empty, Loading, Separator, Dialog, Highlight, Shortcut, Badge, Page, AsyncItems
- `useSyncExternalStore` for tear-free state subscription
- `useTransition` for non-blocking search updates
- `useOptimistic` for instant active item visual feedback
- `useInsertionEffect` for paint-before-commit item registration
- `use()` hook for Suspense-powered async data loading
- `ref` as prop (React 19 native, no `forwardRef`)
- `"use client"` directive on all components
- Radix UI Dialog with focus trap, portal, overlay
- GPU-composited CSS animations: `@starting-style`, spring `linear()` easing, `scroll-timeline`
- Automatic virtualization when `filteredCount > 100`
- Full WAI-ARIA: combobox pattern, `aria-live`, `forced-colors`, `prefers-reduced-motion`, `prefers-contrast`
- `content-visibility: auto` for off-screen rendering skip
- Activity API (`<Offscreen>`) for state preservation

### Added — WASM Search (`@crimson_dev/command-search-wasm`)
- Rust trigram index compiled to WebAssembly
- `createWasmSearchEngine()` — main thread WASM search
- `createWorkerSearchEngine()` — Web Worker off-main-thread search
- `SharedArrayBuffer` zero-copy score transfer when cross-origin isolated
- Structured clone fallback for non-isolated contexts

### Added — Codemods (`@crimson_dev/command-codemod`)
- `import-rewrite` — `cmdk` to `@crimson_dev/command-react`
- `data-attrs` — `[cmdk-*]` to `[data-command-*]`
- `forward-ref` — Remove `forwardRef` wrappers
- `should-filter` — `shouldFilter` to `filter` prop rename
- CLI with `--dry-run`, `--transform`, file globbing

### ES2026 Features
- Iterator Helpers (`.map`, `.filter`, `.toArray`, `.forEach`, `.some`, `.find`)
- Set methods (`.intersection`, `.difference`, `.union`)
- `Math.sumPrecise` for floating-point-safe score aggregation
- `Object.groupBy` for shortcut conflict detection and item grouping
- `Temporal.Now.instant()` and `Temporal.Duration` for frecency
- `RegExp.escape` for keyboard shortcut parser
- `Promise.withResolvers()` for scheduler and worker communication
- `Promise.try()` for safe async scoring
- `using` / `await using` for automatic resource cleanup
- `satisfies` for config validation
- `NoInfer<T>` for callback type inference
- Branded types for type-safe IDs

### Technical
- TypeScript 6.0.1-rc with `isolatedDeclarations`, `erasableSyntaxOnly`, `verbatimModuleSyntax`
- ESM-only, tree-shakeable, `sideEffects: false`
- Biome 2.4.6 (replaces ESLint + Prettier)
- Vitest 4.1.0-beta.6 with happy-dom
- Playwright 1.59.0-alpha for E2E
- tsdown 0.21.0 for builds
- pnpm 11.0.0-alpha.12 workspace
