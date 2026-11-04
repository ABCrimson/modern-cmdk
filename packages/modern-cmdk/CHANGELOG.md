# modern-cmdk

## 1.3.0

### Minor Changes

- [#57](https://github.com/ABCrimson/modern-cmdk/pull/57) [`840d18f`](https://github.com/ABCrimson/modern-cmdk/commit/840d18fdf92540ac20c312d1cd3d3f7fa4cc2136) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Only green, honest gates: the CLIs print again, the docs stop claiming what the code does not do, and the default stylesheet's muted text meets WCAG 1.4.3.
  
  **CLIs**
  
  - The codemod bin (`npx modern-cmdk`) and `npm create modern-cmdk` print usage, per-file results, dry-run lists and errors again. This restores the documented output.
  - New `--strict` flag on both CLIs: usage errors exit 2 and file errors exit 1. Without `--strict` the 1.x default exit codes are unchanged for well-formed commands; the exceptions are the malformed options and the `--template <name>` form below.
  - Unknown options are warned about and ignored when the required arguments are present; without them they are a usage error (exit 0). With `--strict` an unknown option always exits 2.
  - A malformed known option (codemod `--concurrency` with no value, `--dry-run=yes`, create `--template` with no value) is now a usage error that writes nothing and exits 0 (2 with `--strict`). 1.2.x ignored the option and ran, so `--dry-run=yes` performed a real write. Because the usage error comes before the run, a codemod call that 1.2.x ran to exit 1 (no matching files, or an unknown transform) exits 0 when it also carries one of these options. Both CLIs print the exact `parseArgs` wording for these errors.
  - `create-modern-cmdk` honours the space form `--template <name>`. An unknown template given that way now exits 1; 1.2.2 silently scaffolded `react-basic`. This is the one case where a default exit code rises (0 to 1).
  - The `react-dialog` template now opens with Mod+K (Cmd+K on macOS, Ctrl+K elsewhere).
  
  **React**
  
  - `Command.Input` no longer drops keystrokes under rapid typing, and `Command.Loading` no longer flashes or announces (`role="status"`, `aria-live`) on every keystroke: search updates no longer run in a transition.
  
  **Styles**
  
  - The default stylesheet's muted text (group headings, shortcuts, the empty state, the placeholder) uses the new `--command-muted-color` token instead of opacity, so it meets WCAG 1.4.3. Override the token to restyle it.
  - The token defaults to `light-dark()`. On a dark theme, set `color-scheme` (for example `color-scheme: dark` on `:root`) or override `--command-muted-color`; otherwise muted text takes the light value and is hard to read on a dark surface.
  
  **Documentation**
  
  - Docs live at https://abcrimson.github.io/modern-cmdk/; the old domain is gone, and the wiki is retired: every page points at the docs site.
  - The README, package READMEs and docs no longer claim `RegExp.escape`, `WeakRef` listeners, exponential decay, sub-millisecond WASM search or other features the code does not have. The repository description no longer claims WASM, GPU, ES2026, TypeScript 6 or benchmark wins. Earlier CHANGELOG entries that list `RegExp.escape` (keyboard parser) and `NoInfer<T>` (callback typing) as shipped features describe code the packages do not have; they stay as release history and this entry corrects them.
  - The README and the docs benchmarks page take their figures from a committed, CPU-stamped results file (`benchmarks/history/2026-11-04-45a9134.json`).
  
  The Playwright e2e default is now Chromium only; Firefox and WebKit run with `E2E_ENGINES=all` until 1.8.0. CI and test tooling changed beyond that; none of it affects the packages.

## 1.2.3

### Patch Changes

- [#52](https://github.com/ABCrimson/modern-cmdk/pull/52) [`e55cce7`](https://github.com/ABCrimson/modern-cmdk/commit/e55cce780aaab5a3da922432a0918b6c54614e25) Thanks [@ABCrimson](https://github.com/ABCrimson)! - `useCommandDevtools` no longer throws `ReferenceError: __DEV__ is not defined` in published builds. Development-only code (the devtools bridge and the search-engine leak detector) is now gated on `process.env.NODE_ENV`, with a safe production fallback when no bundler replaces it; the leak detector stays off during SSR.

- [#42](https://github.com/ABCrimson/modern-cmdk/pull/42) [`541a5d7`](https://github.com/ABCrimson/modern-cmdk/commit/541a5d7e961ff36bcc5aa68329f0dd6f5e617368) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Republish built with the current toolchain (TypeScript 7.1, tsdown 0.23.5 with oxc declaration emit). The `core` and `react` entry points are runtime- and type-identical to the previous build apart from comments; the bundled codemod CLI (`dist/codemod/cli.mjs`) picks up newer versions of its bundled dependencies (glob matching and file-walking helpers).

## 1.2.2

### Patch Changes

- [`05d3b74`](https://github.com/ABCrimson/modern-cmdk/commit/05d3b74868419c5076452bcdf23d9b7bc6a3fabd) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Evergreen dependency refresh: bump runtime dependency `idb-keyval` to 6.3.0; rebuild with TypeScript 7.0.2, tsdown 0.23.0-rc.0, and React 19.3 canary 20260826 toolchain.

- docs: refresh npm README + modernized toolchain — disclose the sole runtime dependency (`idb-keyval`, lazy-loaded only for IndexedDB frecency persistence), note ESM-only + `engines.node >= 26.4.0` and the unpublished/experimental WASM engine, and correct the virtualization threshold to `virtualizeThreshold` (default 100).

## 1.2.1

### Patch Changes

- **docs: documentation accuracy pass** — Corrected the codemod CLI usage everywhere to its real positional form `npx modern-cmdk <transform> <glob>` (one transform per run; only `--dry-run` and `--concurrency=N` are accepted). The previous `migrate` / `--transform` / `--verbose` / `--extensions` / `--ignore` forms never matched the implementation. Replaced the inaccurate `sideEffects: false` claim with the actual scoped array (`./dist/react/styles.css`, `./dist/react/index.mjs`), and clarified that the optional `modern-cmdk-search-wasm` engine is experimental and not yet published to npm. No code, API, or behavior changes — republished so the corrected README ships to npm.

- **docs: repository docs** — The root README packages table was corrected (`vscode-command` to `vscode-modern-cmdk`, the unpublished WASM package flagged), `CONTRIBUTING.md`'s project-structure tree was rewritten to the merged single-package layout (`packages/modern-cmdk/src/{core,react,codemod}`) and `ARCHITECTURE.md`'s stale `packages/command` and `packages/command-react` paths were fixed. Carried from the root CHANGELOG's 1.2.1 section ([`cf6ede7`](https://github.com/ABCrimson/modern-cmdk/commit/cf6ede7)).

## 1.2.0

### Minor Changes

- **chore: bleeding-edge evergreen upgrade** — Moved the entire toolchain and dependencies to their newest releases: TypeScript 7.0.1-rc (native compiler), React 19.3 canary, radix-ui 1.6.0, Vite 8.1, Vitest 5, Playwright 1.62, Biome 2.5.1, pnpm 11.9, tsdown 0.22.3, and the Rust/WASM crate to edition 2024 + wasm-bindgen 0.2.126. Raised `engines.node` to `>=26.4.0` and bumped the `idb-keyval` runtime dependency to 6.2.5. No public API or behavior changes.

- **chore: size-limit measures own code** — The React adapter budget now externalizes the `react`/`react-dom`/`radix-ui` peers and reports the adapter's own gzipped size (~10.2 KB), so the gate stays stable across peer version bumps.

- **chore: CI and test fixes** — CI actions moved to checkout v7, pnpm/action-setup v6, codeql v4, upload-pages-artifact v5 and deploy-pages v5. Fixed the Vitest 5 benchmark migration (fixture API with `.run()`, `it.sequential` to `it`, oxc transform), radix 1.6 dialog dismissal in the unit tests (a full outside click is dispatched) and the WASM build guard (Node `existsSync` instead of the POSIX `[ -f ]`). CI runs Node 26.4.0 on `ubuntu-26.04`; VitePress moved to 2.0.0-alpha.17; wasm-pack 0.15 builds the crate with wasm-opt feature flags; the React size-limit budget is 12 KB. Carried from the root CHANGELOG's 1.2.0 section ([`bd772ce`](https://github.com/ABCrimson/modern-cmdk/commit/bd772ce)).

- **docs: full accuracy pass** — Corrected every version reference, bundle-size figure, and API example across the README, npm page, and the documentation site to match the upgraded code (including the real `FrecencyEngine`, `KeyboardShortcutRegistry`, and `ParsedShortcut` signatures).

## 1.1.5

### Patch Changes

- **fix(ci): remove `--coverage` from sharded tests** — Vitest coverage thresholds are incompatible with sharding; removed flag to fix CI failures.

- **fix: pre-launch readiness** — Aligned package exports, `engines` field, and docs across `modern-cmdk` and `command-search-wasm`. Fixed bundle size limits in root `package.json` and benchmarks documentation (25 KB -> 25.5 KB for React bundle).

- **docs: comprehensive API reference expansion** — Expanded `apps/docs/api/command.md` with full core engine documentation covering state machine, search engine, frecency, keyboard registry, telemetry, and branded types.

- **test: coverage thresholds** — Coverage thresholds were added to `vitest.config.ts` for CI enforcement ([`394652f`](https://github.com/ABCrimson/modern-cmdk/commit/394652f), carried from the root CHANGELOG's 1.1.5 section).

- **chore: docs and build cleanup** — Fixed `Iterator.range` bug in virtualization guide, aligned tsdown targets across packages, updated README bundle sizes and pnpm version.

## 1.1.4

### Patch Changes

- **fix(ci): resolve all 7 Biome lint/format errors** — Trailing zero in OKLCH value, import ordering (value before type), regex line width wrapping, `useExhaustiveDependencies` dependency extraction, `expect.poll()` chain formatting, `noUncheckedIndexedAccess` narrowing in `objectGroupBy`.

- **chore(ci): modernize all GitHub Actions workflows** — Added explicit `permissions` blocks (principle of least privilege) and `timeout-minutes` to all jobs across ci.yml, benchmarks.yml, codeql.yml, docs.yml, and release.yml. Improved CI summary table with status labels. Added `security-extended` query suite to CodeQL. Optimized build commands in benchmarks and release workflows.

- **chore(deps): enhance Dependabot configuration** — Added dependency groups for TypeScript, Biome, Playwright, and Vitest. Added ignore rules to prevent major version bumps on pinned React pre-releases.

## 1.1.3

### Patch Changes

- **fix(react): virtualization now removes off-screen items from the DOM** — Items check `visibleIdSet` before rendering, reducing DOM nodes from thousands to ~30 in virtualized lists. Latch-based auto-virtualization with hysteresis (more than 100 items enables it, 50 or fewer disables it) prevents race conditions ([`6b340b4`](https://github.com/ABCrimson/modern-cmdk/commit/6b340b4)).

- **fix(core): replace browser-incompatible ES2026 APIs with cross-browser helpers** — Replaced `Temporal.Now.instant()` / `Temporal.Duration` with `Date.now()`, `Math.sumPrecise` with `+=` loops, `Map.groupBy` / `Object.groupBy` with helper functions, `Set.intersection` / `.difference` / `.union` / `.isSubsetOf` with set operation helpers, `Promise.try` with `Promise.resolve().then()`, `String.isWellFormed` / `.toWellFormed` with regex-based surrogate replacement. All Iterator Helpers, `using`/`await using`, `Promise.withResolvers`, and `RegExp.escape` remain (supported in target browsers).

- **fix(css): WCAG 2.1 AA contrast compliance** — Updated OKLCH color values in dark mode (`--text-muted: oklch(0.83)`, `--text-secondary: oklch(0.75)`) and light mode (`--text-secondary: oklch(0.38)`, `--text-muted: oklch(0.48)`, `--accent: oklch(0.45)`) to meet 4.5:1 contrast ratio requirements. Re-enabled axe-core color-contrast checks in E2E tests.

- **chore: scroll and lint housekeeping** — `scrollToIndex` uses `behavior: 'instant'` for responsive keyboard navigation ([`022f441`](https://github.com/ABCrimson/modern-cmdk/commit/022f441)), and `Temporal` is removed from the Biome globals list ([`5b42c7b`](https://github.com/ABCrimson/modern-cmdk/commit/5b42c7b)); both carried from the root CHANGELOG's 1.1.3 section.

- **fix(css): RTL support** — Changed `transform-origin: left center` to `transform-origin: inline-start center` for logical property compliance.

- **fix(e2e): test reliability improvements** — Replaced snapshot reads (`getAttribute`) with auto-retrying assertions (`toHaveAttribute`, `expect.poll()`) throughout virtualization, accessibility, and keyboard test suites. Virtualization tests use `?count=2000` instead of being skipped in CI.

> **Version 1.1.2 was never published.** `1.1.2` is absent from the npm `time` and `versions` records of `modern-cmdk` (`npm view modern-cmdk versions --json` lists 1.1.1 then 1.1.3), and no `modern-cmdk@1.1.2` tag exists.

## 1.1.1

Backfilled from the GitHub release body of `modern-cmdk@1.1.1` (published 2026-03-12) and the tag commit [`ff345bf`](https://github.com/ABCrimson/modern-cmdk/commit/ff345bf); no changeset produced this entry.

### Patch Changes

- [`ff345bf`](https://github.com/ABCrimson/modern-cmdk/commit/ff345bf) **fix: resolve CI failures — bundle size limit and E2E build config** — The core bundle-size limit was raised from 6 KB to 6.5 KB (the release body gives the measured size as 6.12 KB gzip), and the CI E2E job's build step now includes the playground, which the `--filter '!playground'` build had excluded.

- **test: E2E and unit-test reliability (listed in the release body, landed after the tag)** — The release body also lists the axe-core `color-contrast` rule disabled, the `aria-expanded` test fixed, `pressSequentially` delays raised to 50 ms, wait-for-empty-state guards, auto-retrying Playwright assertions, disabled items skipped during ArrowDown navigation, virtualization E2E skipped in CI, Chromium-only CI runs, stress-test timeouts raised to 15 s and a sequential E2E build order. Those commits ([`dc9f087`](https://github.com/ABCrimson/modern-cmdk/commit/dc9f087), [`9dbe275`](https://github.com/ABCrimson/modern-cmdk/commit/9dbe275), [`683a8d7`](https://github.com/ABCrimson/modern-cmdk/commit/683a8d7), [`0e017fa`](https://github.com/ABCrimson/modern-cmdk/commit/0e017fa), [`fe4cb8b`](https://github.com/ABCrimson/modern-cmdk/commit/fe4cb8b), [`559c533`](https://github.com/ABCrimson/modern-cmdk/commit/559c533)) were made after the `modern-cmdk@1.1.1` tag and first appear in the `modern-cmdk@1.1.3` tag.

- [`ae956ad`](https://github.com/ABCrimson/modern-cmdk/commit/ae956ad) **docs: head-to-head benchmark comparison** — Added to the docs site.

## 1.1.0

Backfilled from the GitHub release body of `modern-cmdk@1.1.0` (published 2026-03-11) and the tag commit [`061dc07`](https://github.com/ABCrimson/modern-cmdk/commit/061dc07); no changeset produced this entry.

### Minor Changes

- [`061dc07`](https://github.com/ABCrimson/modern-cmdk/commit/061dc07) **feat: v1.1.0 — publish-ready with full modernization and head-to-head benchmarks** — The release body (52 files changed) lists these critical fixes: the codemod CLI extension changed from `.js` to `.mjs` for ESM compatibility; `idb-keyval` is imported lazily and dynamically, so no browser-only code runs at top level (SSR-safe); `radix-ui` moved from a hard dependency to an optional peer dependency.

- High-priority fixes listed in the body: `IS_REACT_ACT_ENVIRONMENT` set in the test setup, stronger performance and accuracy test assertions, a memory-leak test that checks search still works after 100 create/dispose cycles, `declaration: true` restored in `tsconfig.base.json` (required by `isolatedDeclarations`), and JSDoc on all public exports.

- Medium-priority fixes listed in the body: a configurable `description` prop on `Command.Dialog`, an i18n-ready `announceResults` prop on `Command.List` for the `aria-live` text, `FinalizationRegistry` leak detection that warns on undisposed search engines, `FrecencyEngine` dispose flush failures logged instead of silenced, JSDoc on the exported React components and hooks, and tautological test assertions replaced.

- Build: a single unified tsdown array config, to prevent double-build artifact corruption (release body, "Unified build config").

## 1.0.2

### Patch Changes

- [`f5576bb`](https://github.com/ABCrimson/modern-cmdk/commit/f5576bb917e8d254aae20b419ea02dccfbcab7cd) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Performance: split React context to prevent all-item re-renders, O(1) filtered set lookup, single-pass index build, lazy iterators. Fix CSS sideEffects, invalid transform-origin, GPU will-change misuse. Fix broken docs examples and README links.

## 1.0.1

### Patch Changes

- [`f6a9294`](https://github.com/ABCrimson/modern-cmdk/commit/f6a9294d0f868b4848cfad40770f455f3745d56e) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Fix lint issues, O(1) navigate lookup, error-resilient fuzzy scorer, and modernize branding

## 1.0.0

### Major Changes

- [`f00ac85`](https://github.com/ABCrimson/modern-cmdk/commit/f00ac85f23a9823234f507015c423d0aa066a12c) Thanks [@ABCrimson](https://github.com/ABCrimson)! - modern-cmdk 1.0.0 — consolidated package replacing @crimson_dev/command + @crimson_dev/command-react + @crimson_dev/command-codemod.

  ### Import paths

  - `import { createCommandMachine } from 'modern-cmdk'` — core engine
  - `import { Command } from 'modern-cmdk/react'` — React 19 adapter
  - `import 'modern-cmdk/styles.css'` — default styles
  - `npx modern-cmdk <transform> <glob>` — codemods

  ### Highlights

  - Pure TypeScript state machine with zero DOM dependencies
  - 14 React 19 compound components with Radix UI Dialog
  - Built-in fuzzy search with incremental filtering
  - Frecency ranking with time-based decay
  - Keyboard shortcut registry
  - GPU-composited CSS animations
  - Full WAI-ARIA combobox pattern
  - Automatic virtualization at 100+ items
  - ES2026: Iterator Helpers, Explicit Resource Management, cross-browser helpers

## Before the rename (@crimson_dev/command)

Before 1.0.0 this library shipped as `@crimson_dev/command`, `@crimson_dev/command-react` and `@crimson_dev/command-codemod`. The `0.10.0` and `0.9.0` sections below are carried verbatim from the repository's former root CHANGELOG; the `v0.1.0` to `v0.8.0` milestones are documented only as GitHub releases (https://github.com/ABCrimson/modern-cmdk/releases), tagged `v0.1.0` to `v0.8.0`.

### [0.10.0] - 2026-03-09

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

### [0.9.0] - 2026-03-07

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
