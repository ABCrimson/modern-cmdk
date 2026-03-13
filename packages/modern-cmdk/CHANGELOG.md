# modern-cmdk

## 1.1.5

### Patch Changes

- **fix(ci): remove `--coverage` from sharded tests** — Vitest coverage thresholds are incompatible with sharding; removed flag to fix CI failures.

- **fix: pre-launch readiness** — Aligned package exports, `engines` field, and docs across `modern-cmdk` and `command-search-wasm`. Fixed bundle size limits in root `package.json` and benchmarks documentation (25 KB -> 25.5 KB for React bundle).

- **docs: comprehensive API reference expansion** — Expanded `apps/docs/api/command.md` with full core engine documentation covering state machine, search engine, frecency, keyboard registry, telemetry, and branded types.

- **chore: docs and build cleanup** — Fixed `Iterator.range` bug in virtualization guide, aligned tsdown targets across packages, updated README bundle sizes and pnpm version.

## 1.1.4

### Patch Changes

- **fix(ci): resolve all 7 Biome lint/format errors** — Trailing zero in OKLCH value, import ordering (value before type), regex line width wrapping, `useExhaustiveDependencies` dependency extraction, `expect.poll()` chain formatting, `noUncheckedIndexedAccess` narrowing in `objectGroupBy`.

- **chore(ci): modernize all GitHub Actions workflows** — Added explicit `permissions` blocks (principle of least privilege) and `timeout-minutes` to all jobs across ci.yml, benchmarks.yml, codeql.yml, docs.yml, and release.yml. Improved CI summary table with status labels. Added `security-extended` query suite to CodeQL. Optimized build commands in benchmarks and release workflows.

- **chore(deps): enhance Dependabot configuration** — Added dependency groups for TypeScript, Biome, Playwright, and Vitest. Added ignore rules to prevent major version bumps on pinned React pre-releases.

## 1.1.3

### Patch Changes

- **fix(react): virtualization now removes off-screen items from the DOM** — Items check `visibleIdSet` before rendering, reducing DOM nodes from thousands to ~30 in virtualized lists. Latch-based auto-virtualization with hysteresis prevents race conditions.

- **fix(core): replace browser-incompatible ES2026 APIs with cross-browser helpers** — Replaced `Temporal.Now.instant()` / `Temporal.Duration` with `Date.now()`, `Math.sumPrecise` with `+=` loops, `Map.groupBy` / `Object.groupBy` with helper functions, `Set.intersection` / `.difference` / `.union` / `.isSubsetOf` with set operation helpers, `Promise.try` with `Promise.resolve().then()`, `String.isWellFormed` with regex-based surrogate replacement. All Iterator Helpers, `using`/`await using`, `Promise.withResolvers`, and `RegExp.escape` remain (supported in target browsers).

- **fix(css): WCAG 2.1 AA contrast compliance** — Updated OKLCH color values in dark mode (`--text-muted: oklch(0.83)`, `--text-secondary: oklch(0.75)`) and light mode (`--text-secondary: oklch(0.38)`, `--text-muted: oklch(0.48)`, `--accent: oklch(0.45)`) to meet 4.5:1 contrast ratio requirements. Re-enabled axe-core color-contrast checks in E2E tests.

- **fix(css): RTL support** — Changed `transform-origin: left center` to `transform-origin: inline-start center` for logical property compliance.

- **fix(e2e): test reliability improvements** — Replaced snapshot reads (`getAttribute`) with auto-retrying assertions (`toHaveAttribute`, `expect.poll()`) throughout virtualization, accessibility, and keyboard test suites. Virtualization tests use `?count=2000` instead of being skipped in CI.

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
  - `npx modern-cmdk migrate <transform> <glob>` — codemods

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
