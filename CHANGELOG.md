# Changelog

All notable changes to modern-cmdk packages are documented here.

## [1.1.4] - 2026-03-13

### Fixed
- All 7 Biome lint/format errors: trailing zero in OKLCH, import ordering, regex line width, `useExhaustiveDependencies` dependency specificity, `expect.poll()` chain formatting, `noUncheckedIndexedAccess` narrowing
- CI workflow now passes Lint & Typecheck gate on first run

### Changed
- All GitHub Actions workflows: added explicit `permissions` (least privilege), `timeout-minutes` on all jobs
- CI summary table: status labels with descriptive text
- CodeQL: added `security-extended` query suite for deeper analysis
- Benchmarks & Release workflows: optimized build to exclude docs/playground
- Dependabot: added groups for TypeScript, Biome, Playwright, Vitest; ignore rules for pinned React versions

## [1.1.3] - 2026-03-13

### Fixed
- Virtualization DOM rendering — items now check `visibleIdSet` and only render when in viewport + overscan, reducing DOM nodes from thousands to ~30
- Latch-based auto-virtualization with hysteresis (>100 enables, <=50 disables) prevents circular dependency race conditions
- WCAG 2.1 AA contrast compliance in both light and dark themes (OKLCH color values updated)
- CSS RTL support: `transform-origin: left center` → `transform-origin: inline-start center`
- E2E test reliability: auto-retrying assertions replace snapshot reads throughout all test suites
- Virtualization E2E tests run in CI with `?count=2000` instead of being skipped

### Changed
- Replaced `Temporal.Now.instant()` / `Temporal.Duration` with `Date.now()` for cross-browser compatibility
- Replaced `Math.sumPrecise` with `+=` loops (Stage 2.7, not in browsers)
- Replaced `Map.groupBy` / `Object.groupBy` with cross-browser helper functions
- Replaced `Set.intersection` / `.difference` / `.union` / `.isSubsetOf` with helper functions
- Replaced `Promise.try` with `Promise.resolve().then()`
- Replaced `String.isWellFormed` / `.toWellFormed` with regex-based surrogate replacement
- `scrollToIndex` uses `behavior: 'instant'` for responsive keyboard navigation
- Removed `Temporal` from Biome globals list

### Retained ES2026 Features
- Iterator Helpers (`.map`, `.filter`, `.toArray`, `.forEach`, `.some`)
- `using` / `await using` (Explicit Resource Management)
- `Promise.withResolvers`
- `RegExp.escape`

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
- Incremental filtering — query-append optimization using set difference
- `FrecencyEngine` with time-based decay buckets (hour/day/week/month)
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

### ES2026 Features (native)
- Iterator Helpers (`.map`, `.filter`, `.toArray`, `.forEach`, `.some`, `.find`)
- `using` / `await using` for automatic resource cleanup
- `Promise.withResolvers()` for scheduler and worker communication
- `RegExp.escape` for keyboard shortcut parser
- `satisfies` for config validation
- `NoInfer<T>` for callback type inference
- Branded types for type-safe IDs

### Cross-browser helpers (replacing browser-incompatible APIs)
- Set operation helpers (`setIntersection`, `setDifference`, `setUnion`) replace `Set` methods
- `mapGroupBy` / `objectGroupBy` helpers replace `Map.groupBy` / `Object.groupBy`
- `Date.now()` replaces `Temporal.Now.instant()` and `Temporal.Duration`
- `Promise.resolve().then()` replaces `Promise.try()`
- `ensureWellFormed()` replaces `String.isWellFormed()`
- `+=` loops replace `Math.sumPrecise`

### Technical
- TypeScript 6.0.1-rc with `isolatedDeclarations`, `erasableSyntaxOnly`, `verbatimModuleSyntax`
- ESM-only, tree-shakeable, `sideEffects: false`
- Biome 2.4.6 (replaces ESLint + Prettier)
- Vitest 4.1.0-beta.6 with happy-dom
- Playwright 1.59.0-alpha for E2E
- tsdown 0.21.0 for builds
- pnpm 11.0.0-alpha.12 workspace
