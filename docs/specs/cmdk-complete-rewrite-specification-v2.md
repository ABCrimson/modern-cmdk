# `@crimson_dev/command` — Complete Rewrite Specification for cmdk

> **Scope:** Ground-up recreation of `cmdk` (pacocoursey/cmdk) as a framework-agnostic, headless command palette engine with a React 19 primary adapter — targeting bleeding-edge 2026 tooling, maximum performance, and production-grade accessibility.
>
> **Spec Date:** March 6, 2026
> **Target Package:** `@crimson_dev/command`
> **Replaces:** `cmdk@1.1.1` (pacocoursey)
> **Spec Revision:** v2.0.0 — Full version audit + granular 0.0.1→1.0.0 roadmap
>
> **Note (2026-11-04):** This is a historical document. The docs site lives at https://abcrimson.github.io/modern-cmdk/; the `command.crimson.dev` host named in the text below is dead.

---

## Table of Contents

1. [Forensic Analysis of cmdk@1.1.1](#1-forensic-analysis-of-cmdk111)
2. [Architectural Deficiencies](#2-architectural-deficiencies)
3. [Remastered Architecture Overview](#3-remastered-architecture-overview)
4. [Complete Dependency Stack — Original vs. Remastered](#4-complete-dependency-stack--original-vs-remastered)
5. [Exact Version Manifest — Remastered 2026 Stack](#5-exact-version-manifest--remastered-2026-stack)
6. [Package Structure & Monorepo Layout](#6-package-structure--monorepo-layout)
7. [Core Engine — Framework-Agnostic State Machine](#7-core-engine--framework-agnostic-state-machine)
8. [Search & Filtering Engine](#8-search--filtering-engine)
9. [React 19 Adapter — `@crimson_dev/command-react`](#9-react-19-adapter--crimson_devcommand-react)
10. [Virtualization Layer](#10-virtualization-layer)
11. [Accessibility Architecture](#11-accessibility-architecture)
12. [Frecency & Persistence Engine](#12-frecency--persistence-engine)
13. [Keyboard Shortcut Registry](#13-keyboard-shortcut-registry)
14. [Animation & View Transitions](#14-animation--view-transitions)
15. [Build Pipeline & Configuration Files](#15-build-pipeline--configuration-files)
16. [Testing Strategy](#16-testing-strategy)
17. [Documentation Site](#17-documentation-site)
18. [GitHub Infrastructure](#18-github-infrastructure)
19. [Performance Targets](#19-performance-targets)
20. [Migration Path from cmdk](#20-migration-path-from-cmdk)
21. [Granular Release Roadmap — 0.0.1 → 1.0.0](#21-granular-release-roadmap--001--100)
22. [Version Audit Changelog — What Changed From Spec v1](#22-version-audit-changelog--what-changed-from-spec-v1)

---

## 1. Forensic Analysis of cmdk@1.1.1

### 1.1 Repository Structure

```
pacocoursey/cmdk/
├── .github/             # GitHub Actions workflows
├── .husky/              # Git hooks (pre-commit)
├── cmdk/                # The actual library source
│   ├── src/
│   │   └── index.tsx    # ~1,200 lines — ENTIRE library in ONE file
│   ├── package.json     # Library-level package.json
│   └── tsconfig.json
├── test/                # Playwright E2E tests + test fixtures (Next.js app)
├── website/             # Demo site (Next.js)
├── package.json         # Root workspace package.json
├── pnpm-workspace.yaml  # pnpm workspace config
├── playwright.config.ts
├── .prettierrc.js
├── .prettierignore
├── ARCHITECTURE.md
├── LICENSE.md
└── README.md
```

**Critical observation:** The entire library — all components, state management, filtering, keyboard handling, accessibility, and the `useCmdk` hook — lives in a single `index.tsx` file of approximately 1,200 lines. There is no separation of concerns, no modular architecture, no independent testing of subsystems.

### 1.2 Runtime Dependencies (cmdk/package.json)

| Dependency | Version | Purpose | Problem |
|---|---|---|---|
| `@radix-ui/react-dialog` | `^1.1.2` | Dialog overlay for `Command.Dialog` | Heavy transitive tree (pulls in `@radix-ui/react-dismissable-layer`, `react-focus-guards`, `react-focus-scope`, `react-portal`, `react-presence`, `react-slot`, `react-use-controllable-state`, `aria-hidden`, `react-remove-scroll`) |
| `@radix-ui/react-id` | `^1.1.0` | `useId` polyfill | **Unnecessary** — React 18+ has native `useId`, React 19 has improved version |
| `@radix-ui/react-primitive` | `^2.0.0` | `Primitive` component for polymorphic element rendering | Adds `@radix-ui/react-slot` transitively, could be replaced with simpler `asChild` pattern |
| `use-sync-external-store` | `^1.2.2` | `useSyncExternalStore` shim for React <18 | **Unnecessary** — React 18+ has native `useSyncExternalStore`, React 19 has it built-in |

### 1.3 Peer Dependencies

| Peer | Version Spec | Notes |
|---|---|---|
| `react` | `^18 \|\| ^19 \|\| ^19.0.0-rc` | Broad range, but code doesn't use any React 19 features |
| `react-dom` | `^18 \|\| ^19 \|\| ^19.0.0-rc` | Required for Dialog portal rendering |

### 1.4 Dev Dependencies (Root workspace)

| Dependency | Version | Status in 2026 |
|---|---|---|
| `@playwright/test` | `1.51.0` | **Outdated** — 1.59.0-alpha available; 8 minor versions behind |
| `husky` | `^8.0.1` | **Outdated** — replaced by lefthook 2.x (faster, zero npm deps, YAML config) |
| `lint-staged` | `15.2.0` | **Outdated** — replaced by Biome 2.x organize-on-save + lefthook integration |
| `prettier` | `2.7.1` | **Severely outdated** — Prettier 3.x has been stable for 2+ years; Biome 2.4.6 is the modern replacement with 35× faster formatting |
| `tsup` | `8.0.1` | **Outdated** — tsdown 0.21.0 is the recommended successor (tsup officially unmaintained: "Please consider using tsdown instead") |
| `typescript` | `4.6.4` | **Critically outdated** — TypeScript 6.0.1-rc is current; TS 4.6 is from March 2022 (4 years old), missing `satisfies`, `const` type parameters, `using`/`await using`, decorator support, and hundreds of type inference improvements |
| `pnpm` | `8.8.0` (packageManager) | **Outdated** — pnpm 10.x stable / 11.x alpha available |

### 1.5 Transitive Dependency Count

A fresh install of `cmdk@1.1.1` pulls in **23 transitive packages** via the Radix UI dialog chain:

```
@radix-ui/react-dialog
├── @radix-ui/primitive
├── @radix-ui/react-compose-refs
├── @radix-ui/react-context
├── @radix-ui/react-dismissable-layer
├── @radix-ui/react-focus-guards
├── @radix-ui/react-focus-scope
├── @radix-ui/react-id
├── @radix-ui/react-portal
├── @radix-ui/react-presence
├── @radix-ui/react-primitive
├── @radix-ui/react-slot
├── @radix-ui/react-use-callback-ref
├── @radix-ui/react-use-controllable-state
├── @radix-ui/react-use-escape-keydown
├── @radix-ui/react-use-layout-effect
├── aria-hidden
├── react-remove-scroll
├── react-remove-scroll-bar
├── react-style-singleton
├── tslib
└── use-callback-ref
    └── use-sidecar
```

For a "fast, unstyled command menu component," this is a **massive** dependency surface. The core command palette logic (filtering, keyboard nav, selection) requires zero of these — they're all for the Dialog overlay feature.

### 1.6 Internal Architecture (index.tsx)

The single source file contains:

- **State Store:** A custom external store using `useSyncExternalStore` (via the shim) with a mutable `Map`-based state that tracks: search query, active value, filtered item counts per group, and a "commandScore" for each item.
- **Filtering:** An inlined `commandScore` function (originally from `command-score` package, vendored in v0.2.0) that performs basic substring matching with character-position scoring. Runs synchronously on the main thread for every keystroke against every registered item.
- **Item Registration:** Items register themselves on mount via `useLayoutEffect`, writing to the external store. De-register on unmount. Group membership is tracked via a parallel `Map`. All items remain in the DOM (hidden via `[hidden]` attribute) — no virtualization.
- **Keyboard Navigation:** Hardcoded `keydown` listener on the root `[cmdk-root]` element. Handles ArrowUp/Down, Home/End, Enter, plus optional vim bindings (j/k/n/p). Navigation is index-based via `document.querySelectorAll('[cmdk-item]')` — a **live DOM query on every key press**.
- **Height Animation:** Sets `--cmdk-list-height` CSS custom property by reading `offsetHeight` from the list element — a synchronous layout-triggering DOM read.
- **Dialog:** Thin wrapper around `@radix-ui/react-dialog` with overlay, portal, and content forwarding.
- **Context:** Uses React context (`createContext`) for parent-child communication between Command.Root, Command.List, Command.Group, Command.Item, etc.

---

## 2. Architectural Deficiencies

### 2.1 Performance

| Issue | Impact | Severity |
|---|---|---|
| Synchronous O(n) filtering on main thread | UI jank at 2K+ items, blocks input responsiveness | Critical |
| `document.querySelectorAll('[cmdk-item]')` on every arrow key | Forces full DOM traversal; O(n) per keystroke | High |
| All items rendered in DOM (hidden, not virtualized) | Memory bloat, slow mount/unmount for large datasets | Critical |
| `offsetHeight` read on every filter change | Forces synchronous layout reflow | Medium |
| No `requestAnimationFrame` batching for state updates | Multiple synchronous re-renders per keystroke | Medium |
| `commandScore` runs per-item per-keystroke with no caching | Redundant computation when query changes incrementally | Medium |

### 2.2 React Compatibility

| Issue | Impact |
|---|---|
| Ships `use-sync-external-store` shim despite requiring React 18+ | Dead dependency weight |
| Ships `@radix-ui/react-id` despite React 18+ having native `useId` | Dead dependency weight |
| No `useEffectEvent` usage — `onSelect`, `onValueChange` callbacks need `useCallback` wrapping | Stale closure bugs in consumer code |
| No React Compiler annotations or compatibility | Cannot benefit from automatic memoization in React 19+ |
| No `"use client"` directive — breaks RSC boundary detection | Causes bundler warnings in Next.js 14+/15+ App Router |
| No `use()` for async item sources | Cannot suspend on data loading |
| No `useOptimistic` for optimistic selection | Selection feels slower than it needs to |
| No `useTransition` for search input deferral | Typing blocks rendering of results |

### 2.3 Accessibility

| Issue | WAI-ARIA Pattern Violation |
|---|---|
| No `aria-live` region announcing result count changes | Screen reader users don't know how many results match |
| No `aria-keyshortcuts` on items that have keyboard shortcuts | Discoverable shortcuts missing |
| No announced loading state (`aria-busy`) | Async loading invisible to screen readers |
| `Command.Empty` has no `role="status"` | "No results" not announced |
| No roving `tabindex` — all keyboard nav is via `aria-activedescendant` | Partially correct, but inconsistently applied |
| No screen reader announcement for page changes (multi-page palettes) | Page transitions silent |

### 2.4 Missing Features

| Feature | Status in cmdk | Industry Standard |
|---|---|---|
| Fuzzy search with typo tolerance | ❌ Basic substring scoring | VS Code, Raycast, Alfred all have fuzzy matching |
| Frecency ranking | ❌ Not implemented | Raycast, Alfred, Spotlight rank by recent/frequent use |
| Virtualization | ❌ "Not implemented, up to 2-3K items" | Required for any production palette with dynamic data |
| Async item sources | ❌ Static items only | Every modern command palette supports async search |
| Keyboard shortcut registry | ❌ Not even ⌘K — "do it yourself" | Expected feature of a command palette library |
| Framework-agnostic core | ❌ React-only | cmdk-sv (Svelte), @ngxpert/cmdk (Angular) are divergent forks |
| Route discovery | ❌ Manual registration only | cmdk-engine exists as a third-party bolt-on |
| Nested/hierarchical commands | ❌ Manual page management | Native support expected |
| Theming system | ❌ Raw data attributes | No design token integration |

---

## 3. Remastered Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    @crimson_dev/command                      │
│                  (Framework-Agnostic Core)                   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ State Machine │  │ Search Engine│  │ Frecency Engine   │ │
│  │ (Pure TS)     │  │ (WASM opt.)  │  │ (IndexedDB)       │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘ │
│         │                 │                    │            │
│  ┌──────┴─────────────────┴────────────────────┴──────────┐ │
│  │              Command Registry & Router                  │ │
│  │   (Items, Groups, Pages, Shortcuts, Async Sources)      │ │
│  └─────────────────────────┬──────────────────────────────┘ │
└────────────────────────────┼────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
   ┌──────────▼──────┐ ┌────▼────┐ ┌──────▼──────┐
   │ command-react    │ │ (future)│ │ (future)    │
   │ React 19 Adapter │ │ Svelte  │ │ Vue/Solid   │
   │ + Dialog         │ │ Adapter │ │ Adapters    │
   │ + Virtualization  │ │         │ │             │
   └─────────────────┘ └─────────┘ └─────────────┘
```

**Guiding principles:**

1. **Zero framework code in the core.** The core engine is pure TypeScript — no React, no JSX, no DOM APIs. It exports a state machine that receives events and produces state snapshots.
2. **React adapter is thin.** The React package wraps the core state machine in hooks and renders JSX. Dialog, portal, focus management are implemented here — not in core.
3. **Search is pluggable.** Default: fast TypeScript substring scorer. Optional: WASM-accelerated fuzzy search for 10K+ item datasets.
4. **Everything ships ESM-only.** No CJS. No UMD. `"type": "module"` throughout.
5. **Zero runtime dependencies for core.** React adapter depends only on `radix-ui` (the new unified package, `1.4.4-rc`) for Dialog.
6. **ES2026 target everywhere.** All code leverages `Promise.try`, Iterator Helpers, `Math.sumPrecise`, `using`/`await using` explicit resource management, `Temporal` for time-based frecency, and Set methods for efficient ID operations.

---

## 4. Complete Dependency Stack — Original vs. Remastered

### 4.1 Runtime Dependencies

| | cmdk@1.1.1 | @crimson_dev/command (core) | @crimson_dev/command-react |
|---|---|---|---|
| `@radix-ui/react-dialog` | ^1.1.2 | — | ❌ Replaced by unified `radix-ui` |
| `@radix-ui/react-id` | ^1.1.0 | — | ❌ Removed (React 19 native `useId`) |
| `@radix-ui/react-primitive` | ^2.0.0 | — | ❌ Removed (custom `Primitive` component, 12 lines) |
| `use-sync-external-store` | ^1.2.2 | — | ❌ Removed (React 19 native) |
| `radix-ui` | — | — | `1.4.4-rc.1766004502650` (unified package, Dialog + VisuallyHidden only) |
| **Total transitive deps** | **23** | **0** | **~8** (Radix unified is much flatter) |

### 4.2 Peer Dependencies

| | cmdk@1.1.1 | @crimson_dev/command | @crimson_dev/command-react |
|---|---|---|---|
| `react` | ^18 ∣∣ ^19 | — | `19.3.0-canary-46103596-20260305` |
| `react-dom` | ^18 ∣∣ ^19 | — | `19.3.0-canary-46103596-20260305` |
| `@crimson_dev/command` | — | — | `workspace:*` |

---

## 5. Exact Version Manifest — Remastered 2026 Stack

> **Audit date:** March 6, 2026 — Every version below is pinned to the exact npm registry tag/version verified against the live registry on this date. URLs are authoritative sources.

### 5.1 Languages & Standards

| Technology | Version | Registry Link | Justification |
|---|---|---|---|
| TypeScript | `6.0.1-rc` | [npm](https://www.npmjs.com/package/typescript/v/6.0.1-rc) | Release candidate of TS 6.0 — the last JS-based compiler before Go-native TS 7.0; surfaces deprecation warnings for TS 7.0 breaking changes; `satisfies`, `using`/`await using`, decorator metadata, `const` type params, `NoInfer<T>`, isolated declarations, `erasableSyntaxOnly` |
| ECMAScript Target | `ES2026` / `ESNext` | — | `Promise.try`, Iterator Helpers (`Iterator.prototype.map/filter/take/drop/flatMap/reduce/toArray/forEach/some/every/find`), `Math.sumPrecise`, Set methods (`union/intersection/difference/symmetricDifference/isSubsetOf/isSupersetOf/isDisjointFrom`), Explicit Resource Management (`using`/`await using`), `Temporal` (Stage 3, shipping in V8/SpiderMonkey), `RegExp.escape`, `Atomics.pause` — all stable or shipping in target runtimes (Node 25.8, Chrome 131+, Firefox 135+) |
| Node.js (build-only) | `25.8.0` | [npm](https://www.npmjs.com/package/node/v/25.8.0) | Native TS execution (type stripping needs no flag since Node 23.6; the bench scripts run with plain `node`), `node:` protocol enforced, built-in `fetch` + `WebSocket`, `navigator.hardwareConcurrency`, `Temporal` global, `using`/`await using` support |
| Module Format | ESM-only | — | `"type": "module"`, no CJS dual-publish |

### 5.2 Runtime Dependencies (React Adapter)

| Package | Version | Registry Link | Purpose |
|---|---|---|---|
| `radix-ui` | `1.4.4-rc.1766004502650` | [npm](https://www.npmjs.com/package/radix-ui/v/1.4.4-rc.1766004502650) | Unified Radix package — `Dialog`, `VisuallyHidden` primitives only. Tree-shakeable; replaces 15+ individual `@radix-ui/react-*` packages. RC tag aligns with latest React 19 canary compatibility. |

### 5.3 Optional Runtime Dependencies

| Package | Version | Registry Link | Purpose | When Needed |
|---|---|---|---|---|
| `@crimson_dev/command-search-wasm` | `0.1.0` | — (internal) | WASM-accelerated fuzzy search (Rust trigram index) | Datasets >5K items |
| `idb-keyval` | `6.2.2` | [npm](https://www.npmjs.com/package/idb-keyval/v/6.2.2) | Lightweight IndexedDB wrapper for frecency persistence | When frecency enabled |

### 5.4 Dev Dependencies — Build & Bundling

| Package | Version | Registry Link | Replaces | Justification |
|---|---|---|---|---|
| `tsdown` | `0.21.0` | [npm](https://www.npmjs.com/package/tsdown/v/0.21.0) | tsup 8.0.1 | Rolldown/Oxc-powered; ESM-first; `--isolated-declarations` for fast .d.ts; tsup officially unmaintained ("Please consider using tsdown instead"). Stable release — no longer beta. |
| `typescript` | `6.0.1-rc` | [npm](https://www.npmjs.com/package/typescript/v/6.0.1-rc) | TypeScript 4.6.4 | 4-year jump; gains `satisfies`, `using`, decorators, `NoInfer`, `const` type params, module resolution improvements, `erasableSyntaxOnly`, isolated declarations |
| `@biomejs/biome` | `2.4.6` | [npm](https://www.npmjs.com/package/@biomejs/biome/v/2.4.6) | Prettier 2.7.1 | 35× faster; multi-file analysis; type inference (~85% coverage); GritQL custom lint rules; replaces both ESLint and Prettier in one binary. Latest stable patch. |
| `pnpm` | `11.0.0-alpha.12` | [npm](https://www.npmjs.com/package/pnpm/v/11.0.0-alpha.12) | pnpm 8.8.0 | Next-gen content-addressable store; `pnpm catalogs` for workspace version sync; improved `--frozen-lockfile` performance |

### 5.5 Dev Dependencies — Testing

| Package | Version | Registry Link | Replaces | Justification |
|---|---|---|---|---|
| `vitest` | `4.1.0-beta.6` | [npm](https://www.npmjs.com/package/vitest/v/4.1.0-beta.6) | (none — cmdk has no unit tests) | Vite 8/Rolldown-powered; `--detect-async-leaks`; OpenTelemetry context propagation; same Rolldown substrate as tsdown; **built-in `bench` subcommand** (no separate `@vitest/bench` package needed) |
| `@vitest/coverage-v8` | `4.1.0-beta.6` | [npm](https://www.npmjs.com/package/@vitest/coverage-v8/v/4.1.0-beta.6) | — | V8 native coverage; no Istanbul overhead |
| `@testing-library/react` | `16.3.2` | [npm](https://www.npmjs.com/package/@testing-library/react/v/16.3.2) | — | React 19 compatible; `renderHook` support; `act()` improvements |
| `@testing-library/user-event` | `14.6.1` | [npm](https://www.npmjs.com/package/@testing-library/user-event/v/14.6.1) | — | Realistic user interaction simulation |
| `happy-dom` | `20.8.3` | [npm](https://www.npmjs.com/package/happy-dom/v/20.8.3) | — | Fast DOM environment for unit tests (5× faster than jsdom); major version jump from 16.x → 20.x brings `Temporal` support, improved `MutationObserver`, `ResizeObserver`, `IntersectionObserver` mocks, Web Worker support, and `structuredClone` |
| `@playwright/test` | `1.59.0-alpha-2026-03-06` | [npm](https://www.npmjs.com/package/@playwright/test/v/1.59.0-alpha-2026-03-06) | @playwright/test 1.51.0 | 8 minor versions ahead — gains `aria` snapshot testing, clock API improvements, `locator.pressSequentially()`, component test improvements, trace viewer enhancements, WebSocket interception |
| `tinybench` | `6.0.0` | [npm](https://www.npmjs.com/package/tinybench/v/6.0.0) | — | Standalone microbenchmarking (alternative to vitest built-in bench for isolated CI measurement); `Bench.run()` returns `Task[]` with statistics including `p75`, `p99`, `margin`, `throughput` |

> **Note:** `@vitest/bench` has been absorbed into `vitest` itself as of v4.x. The `vitest bench` subcommand is the primary benchmarking interface. `tinybench` is available for standalone or CI-specific benchmark scripts.

### 5.6 Dev Dependencies — Documentation

| Package | Version | Registry Link | Purpose |
|---|---|---|---|
| `vitepress` | `2.0.0-alpha.16` | [npm](https://www.npmjs.com/package/vitepress/v/2.0.0-alpha.16) | Docs site — Vite 7/8 powered, Vue 3.5+, built-in search, dark mode, View Transitions API, improved sitemap generation |
| `shiki` | `4.0.1` | [npm](https://www.npmjs.com/package/shiki/v/4.0.1) | Syntax highlighting — major jump from 3.x to 4.x; WASM-based TextMate grammars, 200+ languages; new `createHighlighterCore` for tree-shakeable bundles; `@shikijs/engine-javascript` RegExp engine eliminates WASM requirement for SSG builds |
| `@shikijs/twoslash` | `4.0.1` | [npm](https://www.npmjs.com/package/@shikijs/twoslash/v/4.0.1) | TypeScript hover information in code blocks; matched to Shiki 4.x |
| `svgo` | `4.0.1` | [npm](https://www.npmjs.com/package/svgo/v/4.0.1) | SVG optimization for architecture diagrams; v4 brings ES module exports, new plugin API, improved path optimization |

### 5.7 Dev Dependencies — GitHub Automation

| Package | Version | Registry Link | Purpose |
|---|---|---|---|
| `@changesets/cli` | `3.0.0-next.1` | [npm](https://www.npmjs.com/package/@changesets/cli/v/3.0.0-next.1) | Version management & changelog generation; v3 brings ESM-only output, improved workspace protocol support, `pnpm catalogs` integration |
| `@changesets/changelog-github` | `1.0.0-next.1` | [npm](https://www.npmjs.com/package/@changesets/changelog-github/v/1.0.0-next.1) | GitHub-linked changelogs; v1 aligns with changesets v3 |
| `size-limit` | `12.0.1` | [npm](https://www.npmjs.com/package/size-limit/v/12.0.1) | Bundle size enforcement in CI; v12 gains `--why` tree visualization, improved monorepo support |
| `@size-limit/preset-small-lib` | `12.0.1` | [npm](https://www.npmjs.com/package/@size-limit/preset-small-lib/v/12.0.1) | Preset for small library bundles; matched to size-limit v12 |
| `lefthook` | `2.1.2` | [npm](https://www.npmjs.com/package/lefthook/v/2.1.2) | Git hooks — v2 brings parallel hook execution, improved glob matching, `skip` conditions with environment variables, zero npm deps, YAML config (replaces husky 8.x + lint-staged) |

### 5.8 React Peer Dependencies

| Package | Version | Registry Link |
|---|---|---|
| `react` | `19.3.0-canary-46103596-20260305` | [npm](https://www.npmjs.com/package/react/v/19.3.0-canary-46103596-20260305) |
| `react-dom` | `19.3.0-canary-46103596-20260305` | [npm](https://www.npmjs.com/package/react-dom/v/19.3.0-canary-46103596-20260305) |

> **Why canary?** React 19.2.4 is the latest stable, but 19.3.0-canary brings the Activity API (`<Activity>`), `useEffectEvent` stabilization, improved React Compiler output, and `prefetchDNS`/`preconnect`/`preinit` resource hints — all of which this library depends on for maximum performance. The canary channel is stable enough for library development that will ship when 19.3.0 goes stable.

---

## 6. Package Structure & Monorepo Layout

```
@crimson_dev/command/
├── packages/
│   ├── command/                          # Core engine (framework-agnostic)
│   │   ├── src/
│   │   │   ├── index.ts                  # Public API barrel export — `export type` for all types (TS 6 verbatimModuleSyntax)
│   │   │   ├── machine.ts                # Core state machine — pure functions, `using` for subscription cleanup
│   │   │   ├── types.ts                  # All TypeScript types & interfaces — `satisfies`, `NoInfer<T>`, `const` type params
│   │   │   ├── registry.ts               # Command/item registration — Set methods (union/intersection) for ID management
│   │   │   ├── search/
│   │   │   │   ├── index.ts              # Search engine interface — `Iterator.prototype.map/filter` for result pipelines
│   │   │   │   ├── default-scorer.ts     # Built-in substring + position scorer — `Math.sumPrecise` for score aggregation
│   │   │   │   ├── fuzzy-scorer.ts       # Advanced fuzzy matcher (pure TS) — `Promise.try` for safe async scoring
│   │   │   │   └── types.ts              # SearchResult, ScorerFn types — branded types with `satisfies`
│   │   │   ├── frecency/
│   │   │   │   ├── index.ts              # Frecency ranking — `Temporal.Now.instant()` for precise time-based decay
│   │   │   │   ├── storage.ts            # Pluggable persistence — `await using` for IndexedDB transaction cleanup
│   │   │   │   └── memory-storage.ts     # In-memory storage (default) — `Map` with `Iterator.prototype.toArray()`
│   │   │   ├── keyboard/
│   │   │   │   ├── index.ts              # Keyboard shortcut registry — `using` for listener cleanup
│   │   │   │   ├── parser.ts             # Shortcut string parser ("Mod+K") — `RegExp.escape` for safe pattern construction
│   │   │   │   └── matcher.ts            # KeyboardEvent → Shortcut matcher — `Object.groupBy` for modifier grouping
│   │   │   └── utils/
│   │   │       ├── scheduler.ts          # rAF-batched state updates — `Promise.withResolvers` for flush coordination
│   │   │       └── event-emitter.ts      # Tiny typed event emitter — `using` for auto-unsubscribe, `WeakRef` for listener GC
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsdown.config.ts
│   │
│   ├── command-react/                    # React 19 adapter
│   │   ├── src/
│   │   │   ├── index.ts                  # Public API barrel — `"use client"` on every component file
│   │   │   ├── command.tsx               # <Command.Root> — `useTransition` for search, React Compiler compatible
│   │   │   ├── input.tsx                 # <Command.Input> — `useEffectEvent` for stable callbacks, `useOptimistic` for instant feedback
│   │   │   ├── list.tsx                  # <Command.List> — auto-virtualization, `ResizeObserver` for height, GPU-composited scrolling
│   │   │   ├── item.tsx                  # <Command.Item> — `ref` as prop (no `forwardRef`), `useId` for ARIA
│   │   │   ├── group.tsx                 # <Command.Group> — `useId` for `aria-labelledby`
│   │   │   ├── empty.tsx                 # <Command.Empty> — `role="status"`, `aria-live="polite"`
│   │   │   ├── loading.tsx               # <Command.Loading> — `aria-busy`, Suspense boundary integration
│   │   │   ├── separator.tsx             # <Command.Separator> — `role="separator"`
│   │   │   ├── dialog.tsx                # <Command.Dialog> — Radix `1.4.4-rc` Dialog, `@starting-style` animations
│   │   │   ├── hooks/
│   │   │   │   ├── use-command.ts        # Core hook — `useSyncExternalStore` (native), stable snapshot selector
│   │   │   │   ├── use-command-state.ts  # Derived state selectors — React Compiler auto-memoizes
│   │   │   │   ├── use-register.ts       # Item/group registration — `useInsertionEffect` for paint-before-commit
│   │   │   │   ├── use-keyboard.ts       # Keyboard shortcut activation — `useEffectEvent` for stable handlers
│   │   │   │   └── use-virtualizer.ts    # Virtualization hook — `ResizeObserver` + `requestIdleCallback` for measurement
│   │   │   ├── context.ts               # React context definitions — `use()` for consuming in Suspense boundaries
│   │   │   └── primitives.ts            # Minimal Primitive/Slot — 12 lines, replaces `@radix-ui/react-primitive`
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsdown.config.ts
│   │
│   └── command-search-wasm/              # Optional WASM fuzzy search
│       ├── crate/                        # Rust source (edition = "2024")
│       │   ├── src/
│       │   │   ├── lib.rs                # WASM entry point — `wasm-bindgen 0.2.100+`
│       │   │   ├── trigram.rs            # Trigram index — `rayon` parallel indexing, SIMD-accelerated comparison
│       │   │   └── scorer.rs             # Fuzzy scoring — Levenshtein with SIMD distance computation
│       │   └── Cargo.toml
│       ├── src/
│       │   └── index.ts                  # JS wrapper — `await using` for WASM module lifecycle, Web Worker with `Float32Array` SharedArrayBuffer
│       ├── package.json
│       └── tsdown.config.ts
│
├── apps/
│   ├── docs/                             # VitePress 2.0.0-alpha.16 documentation site
│   │   ├── .vitepress/
│   │   │   ├── config.ts                 # Shiki 4.0.1, @shikijs/twoslash 4.0.1, View Transitions
│   │   │   └── theme/
│   │   │       ├── index.ts              # Custom theme — OKLCH tokens, GPU-composited animations
│   │   │       └── styles/
│   │   │           ├── vars.css          # OKLCH design tokens, variable fonts, @property for animated gradients
│   │   │           └── custom.css        # Custom overrides — @starting-style, scroll-driven animations
│   │   ├── guide/
│   │   ├── api/
│   │   ├── examples/
│   │   └── index.md
│   │
│   └── playground/                       # Interactive demo (React 19.3.0-canary)
│       ├── src/
│       ├── package.json
│       └── vite.config.ts
│
├── tests/
│   ├── e2e/                              # Playwright 1.59.0-alpha E2E tests
│   │   ├── basic.spec.ts
│   │   ├── keyboard.spec.ts
│   │   ├── accessibility.spec.ts
│   │   ├── virtualization.spec.ts
│   │   └── fixtures/                     # Test app (React 19.3.0-canary + Vite)
│   └── unit/                             # Vitest 4.1.0-beta.6 unit tests (for core engine)
│       ├── machine.test.ts
│       ├── search.test.ts
│       ├── frecency.test.ts
│       ├── keyboard.test.ts
│       └── registry.test.ts
│
├── benchmarks/
│   ├── search.bench.ts                   # Search scoring benchmarks — vitest bench subcommand
│   ├── filter-10k.bench.ts              # Filter 10K items benchmark
│   ├── filter-100k.bench.ts             # Filter 100K items benchmark
│   ├── render.bench.ts                  # React render benchmarks
│   └── standalone/
│       └── ci-bench.ts                   # Standalone tinybench 6.0.0 script for CI regression tracking
│
├── biome.json                            # Biome 2.4.6 config — GritQL rules, type inference, organized imports
├── pnpm-workspace.yaml
├── package.json                          # Root workspace — pnpm 11.0.0-alpha.12 packageManager
├── tsconfig.base.json                    # Shared TS 6.0.1-rc config — ES2026 target
├── playwright.config.ts
├── lefthook.yml                          # Lefthook 2.1.2 — parallel hooks, skip conditions
├── .changeset/
│   └── config.json                       # Changesets 3.0.0-next.1 — ESM-only, workspace protocol
├── .github/
│   └── workflows/
│       ├── ci.yml                        # Lint + test + build + size-limit (Node 25.8.0)
│       ├── release.yml                   # Changeset-based npm publish
│       ├── docs.yml                      # VitePress deploy to GitHub Pages
│       └── benchmarks.yml                # Performance regression tracking (tinybench CI)
├── ARCHITECTURE.md                       # Visual diagrams — Mermaid + SVGO 4.0.1 optimized SVGs
├── CONTRIBUTING.md                       # Dev setup guide — pnpm 11, Node 25.8, TS 6.0.1-rc
├── LICENSE
└── README.md                             # Hero section with OKLCH-themed badges, animated install snippet
```

---

## 7. Core Engine — Framework-Agnostic State Machine

### 7.1 State Shape

```typescript
// packages/command/src/types.ts
// TypeScript 6.0.1-rc — ES2026 target — all modern type features

/** Branded type for command item IDs — prevents accidental string mixing */
type ItemId = string & { readonly __brand: unique symbol };
/** Branded type for group IDs */
type GroupId = string & { readonly __brand: unique symbol };

export interface CommandState {
  /** Current search query */
  readonly search: string;
  /** ID of the currently active (highlighted) item */
  readonly activeId: ItemId | null;
  /** Ordered list of visible item IDs after filtering + sorting — readonly tuple via `as const` inference */
  readonly filteredIds: readonly ItemId[];
  /** Map of group ID → filtered item IDs within that group — ReadonlyMap for immutability */
  readonly groupedIds: ReadonlyMap<GroupId, readonly ItemId[]>;
  /** Total count of visible items */
  readonly filteredCount: number;
  /** Whether async sources are loading */
  readonly loading: boolean;
  /** Current page in multi-page navigation */
  readonly page: string;
  /** Page history stack for back navigation */
  readonly pageStack: readonly string[];
  /** Whether the command palette is open (for Dialog mode) */
  readonly open: boolean;
  /** Temporal instant of last state change — for frecency decay calculation */
  readonly lastUpdated: Temporal.Instant;
} satisfies Record<string, unknown>;
```

### 7.2 Event System

```typescript
// ES2026 discriminated union with `const` type parameter for narrowing

export type CommandEvent =
  | { readonly type: 'SEARCH_CHANGE'; readonly query: string }
  | { readonly type: 'ITEM_SELECT'; readonly id: ItemId }
  | { readonly type: 'ITEM_ACTIVATE'; readonly id: ItemId }
  | { readonly type: 'NAVIGATE'; readonly direction: 'next' | 'prev' | 'first' | 'last' }
  | { readonly type: 'PAGE_PUSH'; readonly page: string }
  | { readonly type: 'PAGE_POP' }
  | { readonly type: 'OPEN' }
  | { readonly type: 'CLOSE' }
  | { readonly type: 'TOGGLE' }
  | { readonly type: 'ITEMS_LOADED'; readonly items: readonly CommandItem[] }
  | { readonly type: 'REGISTER_ITEM'; readonly item: CommandItem }
  | { readonly type: 'UNREGISTER_ITEM'; readonly id: ItemId }
  | { readonly type: 'REGISTER_GROUP'; readonly group: CommandGroup }
  | { readonly type: 'UNREGISTER_GROUP'; readonly id: GroupId };
```

### 7.3 Machine API

```typescript
// Explicit resource management — `using` for auto-cleanup of subscriptions

export interface CommandMachine extends Disposable {
  /** Get current state snapshot (immutable, structurallyShared) */
  getState(): CommandState;
  /** Send an event to the machine — batched via rAF scheduler */
  send(event: CommandEvent): void;
  /** Subscribe to state changes — returns Disposable for `using` pattern */
  subscribe(listener: (state: CommandState) => void): Disposable;
  /** Destroy the machine and clean up all listeners */
  [Symbol.dispose](): void;
}

export function createCommandMachine(
  options: CommandMachineOptions,
): CommandMachine;

// Usage with explicit resource management (ES2026 `using`):
{
  using machine = createCommandMachine({ /* ... */ });
  using sub = machine.subscribe((state) => {
    console.log('Filtered count:', state.filteredCount);
  });
  machine.send({ type: 'SEARCH_CHANGE', query: 'test' });
} // Both `sub` and `machine` automatically cleaned up here
```

### 7.4 Scheduler — rAF-Batched State Updates

```typescript
// packages/command/src/utils/scheduler.ts
// Uses Promise.withResolvers (ES2024) + requestAnimationFrame batching

interface Scheduler extends Disposable {
  schedule(update: () => void): void;
  flush(): Promise<void>;
  [Symbol.dispose](): void;
}

export function createScheduler(): Scheduler {
  let pending: Array<() => void> = [];
  let rafId: number | null = null;

  function flush(): Promise<void> {
    const { promise, resolve } = Promise.withResolvers<void>();
    const batch = pending;
    pending = [];
    rafId = null;

    // Execute all batched updates in a single microtask
    for (const update of batch) {
      update();
    }
    resolve();
    return promise;
  }

  return {
    schedule(update: () => void): void {
      pending.push(update);
      rafId ??= requestAnimationFrame(() => void flush());
    },

    flush,

    [Symbol.dispose](): void {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      pending = [];
    },
  };
}
```

### 7.5 Event Emitter — Typed, WeakRef-Backed

```typescript
// packages/command/src/utils/event-emitter.ts
// Uses: WeakRef for GC-safe listeners, Iterator Helpers for pipeline, `using` for auto-unsub

type EventMap = Record<string, unknown>;

export class TypedEmitter<T extends EventMap> implements Disposable {
  #listeners = new Map<keyof T, Set<WeakRef<(data: never) => void>>>();

  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): Disposable {
    const set = this.#listeners.get(event) ?? new Set();
    const ref = new WeakRef(listener as (data: never) => void);
    set.add(ref);
    this.#listeners.set(event, set);

    return {
      [Symbol.dispose]: () => { set.delete(ref); },
    };
  }

  emit<K extends keyof T>(event: K, data: T[K]): void {
    const set = this.#listeners.get(event);
    if (!set) return;

    // Iterator Helpers (ES2026) — filter dead refs, map to deref, execute
    set.values()
      .map((ref) => ref.deref())
      .filter((fn): fn is NonNullable<typeof fn> => fn != null)
      .forEach((fn) => fn(data as never));

    // Prune GC'd refs
    for (const ref of set) {
      if (ref.deref() == null) set.delete(ref);
    }
  }

  [Symbol.dispose](): void {
    this.#listeners.clear();
  }
}
```

The state machine is **pure** — it receives events and produces new state. It has no DOM knowledge, no React dependency, and no side effects beyond notifying subscribers. This makes it testable with plain `vitest` unit tests and portable to any framework.

---

## 8. Search & Filtering Engine

### 8.1 Architecture

```typescript
// Uses: Iterator Helpers for result pipeline, Promise.try for safe async scoring,
//       Math.sumPrecise for score aggregation, Set methods for ID operations

export interface SearchEngine extends Disposable {
  /** Index items for fast lookup (call on registration) */
  index(items: readonly CommandItem[]): void;
  /** Search items by query, return ordered results — uses Iterator pipeline */
  search(query: string, items: readonly CommandItem[]): IteratorObject<SearchResult>;
  /** Remove items from index — uses Set.difference for efficient bulk removal */
  remove(ids: ReadonlySet<ItemId>): void;
  /** Clear the entire index */
  clear(): void;
  /** Dispose resources */
  [Symbol.dispose](): void;
}

export interface SearchResult {
  readonly id: ItemId;
  readonly score: number;
  /** Character ranges that matched (for highlighting) */
  readonly matches: ReadonlyArray<readonly [start: number, end: number]>;
}
```

### 8.2 Default Scorer (Pure TypeScript)

```typescript
// packages/command/src/search/default-scorer.ts
// Uses: Math.sumPrecise (ES2026), Iterator Helpers, Object.groupBy, toLocaleLowerCase

export function scoreItem(query: string, item: CommandItem): SearchResult | null {
  const lowerQuery = query.toLocaleLowerCase();
  const targets = [item.value, ...(item.keywords ?? [])];

  // Score each target and pick the best match
  const scores = targets
    .values()                                          // Iterator Helper
    .map((target) => scoreTarget(lowerQuery, target.toLocaleLowerCase(), target))
    .filter((result): result is NonNullable<typeof result> => result != null)
    .toArray();                                        // Iterator Helper .toArray()

  if (scores.length === 0) return null;

  // Math.sumPrecise (ES2026) — avoids floating-point drift in score aggregation
  const bestScore = Math.max(...scores.map((s) => s.score));
  const bestResult = scores.find((s) => s.score === bestScore)!;

  return {
    id: item.id,
    score: bestResult.score,
    matches: bestResult.matches,
  };
}

function scoreTarget(
  query: string,
  lowerTarget: string,
  originalTarget: string,
): { score: number; matches: (readonly [number, number])[] } | null {
  // ... position-weighted substring match with:
  // - Contiguous match bonus (adjacent characters score higher)
  // - Position bonus (start-of-string / word-boundary matches score highest)
  // - Keyword expansion (aliases searched alongside primary value)
  // - Match position extraction (returns [start, end] ranges for highlighting)
}
```

**Incremental filtering** — when the query grows by appending characters, the engine uses Set operations to prune:

```typescript
// Only re-score items that previously matched — prune-and-re-score, not full rescan
const previousMatches = new Set(previousResults.map((r) => r.id));
const candidateItems = allItems.filter((item) => previousMatches.has(item.id));
// Set.intersection (ES2026) could be used if working with two Sets of IDs:
// const candidates = registeredIds.intersection(previousMatchIds);
```

### 8.3 WASM Fuzzy Scorer (Optional)

For datasets over 5K items, the optional `@crimson_dev/command-search-wasm` package provides:

- **Rust-based trigram index** compiled to WASM via `wasm-pack 0.14.0` (Rust edition 2024)
- **Fuzzy matching with typo tolerance** — Levenshtein distance ≤2 for short queries, ≤3 for longer
- **Pre-built index** — items are indexed on registration, search is O(1) lookup + O(k) scoring where k = candidate matches
- **Sub-1ms search on 100K items** — measured on M1 MacBook Air
- **Web Worker support** — the WASM module runs in a dedicated worker via `Float32Array` SharedArrayBuffer for zero-copy score transfer
- **~45KB gzipped** WASM binary
- **Explicit resource management** — `await using` for module lifecycle:

```typescript
// packages/command-search-wasm/src/index.ts
export async function createWasmSearchEngine(): Promise<WasmSearchEngine> {
  const wasm = await import('./pkg/command_search_wasm_bg.wasm');
  const instance = await WebAssembly.instantiate(wasm);

  return {
    // ... engine methods
    async [Symbol.asyncDispose](): Promise<void> {
      // Free WASM memory, terminate worker
      instance.exports.__wbindgen_free(/* ... */);
    },
  };
}

// Consumer usage:
await using engine = await createWasmSearchEngine();
const results = engine.search('query', items);
// WASM module automatically freed when scope exits
```

### 8.4 Frecency Integration

After filtering and scoring, results are re-ranked by frecency (frequency × recency). The frecency engine uses `Temporal.Now.instant()` for precise time-based decay:

```typescript
// packages/command/src/frecency/index.ts
// Uses: Temporal (ES2026 Stage 3, shipping in Node 25.8), Iterator Helpers

export function computeFrecencyBonus(
  history: FrecencyRecord,
  now: Temporal.Instant = Temporal.Now.instant(),
): number {
  const elapsed = now.since(history.lastUsed);
  const hours = elapsed.total('hours');

  // Step weight per recency bucket (hour/day/week/month/older)
  const recencyWeight =
    hours < 1    ? 4.0 :
    hours < 24   ? 2.0 :
    hours < 168  ? 1.5 :   // 1 week
    hours < 720  ? 1.0 :   // 1 month
                   0.5;

  return history.frequency * recencyWeight;
}
```

---

## 9. React 19 Adapter — `@crimson_dev/command-react`

### 9.1 React 19.3.0-canary-Specific Features Used

| Feature | Usage | Why |
|---|---|---|
| `useId` (native) | Generate unique IDs for `aria-activedescendant`, `aria-controls`, `aria-labelledby` | Replaces `@radix-ui/react-id` |
| `useSyncExternalStore` (native) | Bind core state machine to React rendering | Replaces `use-sync-external-store` shim |
| `useTransition` | Wrap search query updates in transitions — keeps input responsive while results re-render | Prevents input lag on large datasets |
| `useOptimistic` | Optimistic item selection — immediately highlight before async `onSelect` resolves | Selection feels instant |
| `useEffectEvent` | Stable reference for `onSelect`, `onValueChange`, `filter` callbacks | Eliminates `useCallback` requirement for consumers; stabilized in 19.3.0-canary |
| `use()` | Resolve async item sources inside components with Suspense | Native async command loading |
| React Compiler | All internal functions structured for automatic memoization | Zero manual `useMemo`/`useCallback` internally |
| `"use client"` directive | Every component file starts with `"use client"` | Proper RSC boundary detection in Next.js 15+/16+ |
| `ref` as prop (not `forwardRef`) | React 19 passes ref as a regular prop | Eliminates `forwardRef` boilerplate on every component |
| `Activity` API (19.3.0-canary) | Preserve command palette state when hidden — `<Activity mode="hidden">` | Avoids remount/rerender when toggling palette visibility |
| `useInsertionEffect` | Register items before paint for zero-FOUC item rendering | Ensures items are in registry before first paint |

### 9.2 Component API

```tsx
'use client';

import { Command } from '@crimson_dev/command-react';

function CommandPalette() {
  return (
    <Command.Dialog>
      <Command.Input placeholder="Type a command..." />
      <Command.List>
        <Command.Loading>Searching...</Command.Loading>
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group heading="Actions">
          <Command.Item value="copy" onSelect={() => copy()} keywords={['duplicate']}>
            Copy
            <Command.Shortcut>⌘C</Command.Shortcut>
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
```

**100% API-compatible with cmdk** for basic usage — the compound component pattern, data attributes, and CSS custom property animation all work identically. Migration is a package swap for simple cases.

### 9.3 New Components (Beyond cmdk)

| Component | Purpose |
|---|---|
| `Command.Shortcut` | Renders keyboard shortcut badge; registers with shortcut registry |
| `Command.Badge` | Renders a category/type badge on items |
| `Command.Highlight` | Renders search query match highlighting within item text |
| `Command.Page` | Defines a command page for nested navigation |
| `Command.AsyncItems` | Wraps an async data source with Suspense integration via `use()` |

### 9.4 Core Hook — `useCommand`

```typescript
// packages/command-react/src/hooks/use-command.ts
'use client';

import { useSyncExternalStore, useTransition, useOptimistic, useId, useCallback } from 'react';
import type { CommandMachine, CommandState } from '@crimson_dev/command';

export function useCommand(machine: CommandMachine) {
  const id = useId();
  const [isPending, startTransition] = useTransition();

  // Native useSyncExternalStore — no shim, no polyfill
  const state = useSyncExternalStore(
    machine.subscribe,
    machine.getState,
    machine.getState, // server snapshot (same — SSR safe)
  );

  // Optimistic active item — instant visual feedback before filter completes
  const [optimisticActiveId, setOptimisticActiveId] = useOptimistic(state.activeId);

  // Search wrapped in transition — input stays responsive during re-render
  const updateSearch = useCallback((query: string) => {
    startTransition(() => {
      machine.send({ type: 'SEARCH_CHANGE', query });
    });
  }, [machine]);

  return {
    state: { ...state, activeId: optimisticActiveId },
    isPending,
    updateSearch,
    setOptimisticActiveId,
    id,
  } as const;
}
```

---

## 10. Virtualization Layer

The React adapter includes a built-in virtualization engine for the `Command.List` component, automatically activated when the filtered item count exceeds a configurable threshold (default: 100).

**Implementation:** Variable-height virtual scrolling using `ResizeObserver` for item measurement. Items are rendered in a "window" that extends 2 viewports above and below the visible area (overscan). DOM nodes are recycled via absolute positioning within a measured container. GPU-composited `transform: translateY()` for scroll positioning — zero layout thrash.

**Key design decisions:**

1. **Opt-out, not opt-in.** If you pass `virtualize={false}` to `Command.List`, all items render in the DOM (cmdk behavior). The default is smart — it measures the item count and activates virtualization automatically when needed.
2. **`requestIdleCallback` for measurement.** Item heights are measured during idle periods, not during scroll. Falls back to `setTimeout(fn, 0)` if `requestIdleCallback` is unavailable.
3. **`content-visibility: auto`** on off-screen items for additional rendering optimization.
4. **`will-change: transform`** on the scroll container for GPU compositing hint.

```typescript
// packages/command-react/src/hooks/use-virtualizer.ts
'use client';

export function useVirtualizer(options: VirtualizerOptions) {
  // ResizeObserver for container + item measurement
  // GPU-composited transforms for scroll positioning
  // requestIdleCallback for deferred measurement
  // content-visibility: auto for off-screen items
  // ...
}
```

---

## 11. Accessibility Architecture

| Feature | Implementation |
|---|---|
| `role="combobox"` on Input | With `aria-expanded`, `aria-controls`, `aria-activedescendant` |
| `role="listbox"` on List | With `aria-label` from root `label` prop |
| `role="option"` on Item | With `aria-selected`, `aria-disabled` |
| `role="group"` + `aria-labelledby` on Group | Heading element receives auto-generated ID via `useId()` |
| `role="status"` + `aria-live="polite"` on result count | Announces "N results" on filter change, debounced 300ms |
| `role="status"` on Empty | Announced when no results match |
| `aria-busy` on List | Set during async loading |
| `aria-keyshortcuts` on items with shortcuts | Shortcut string in ARIA format |
| Focus trap in Dialog mode | Via Radix Dialog (`radix-ui@1.4.4-rc`) built-in focus management |
| Visible focus indicator | `:focus-visible` styles via `[data-command-item][data-active]` — GPU-composited `outline` transition |
| `prefers-reduced-motion: reduce` | All animations disabled; instant state transitions |
| `prefers-contrast: more` | High-contrast focus indicators and selection highlights |
| `forced-colors: active` | Windows High Contrast mode support via `@media (forced-colors: active)` |
| `inert` attribute | Background content marked `inert` when Dialog is open — native browser support, no polyfill |

---

## 12. Frecency & Persistence Engine

The frecency algorithm combines frequency and recency into a single score using `Temporal` for precise time measurement:

```
frecencyScore = frequency × recencyWeight(Temporal.Now.instant().since(lastUsed))
```

Recency weight is a step function per recency bucket: items used in the last hour get a 4× multiplier, last day 2×, last week 1.5×, last month 1×, older 0.5×.

**Storage:** Pluggable via `Disposable` interface. Default is in-memory (resets on page reload). Optional `idb-keyval@6.2.2` adapter persists to IndexedDB — survives across sessions. Uses `await using` for transaction cleanup:

```typescript
// Enable frecency with IndexedDB persistence
<Command frecency={{ storage: 'indexeddb', namespace: 'my-app' }}>

// Internal — idb-keyval 6.2.2 adapter with explicit resource management
import { get, set, del } from 'idb-keyval';

export class IDBFrecencyStorage implements AsyncDisposable {
  async load(namespace: string): Promise<FrecencyData> {
    return await get(`frecency:${namespace}`) ?? { records: new Map() };
  }

  async save(namespace: string, data: FrecencyData): Promise<void> {
    await set(`frecency:${namespace}`, data);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    // Flush pending writes, close any open transactions
  }
}
```

---

## 13. Keyboard Shortcut Registry

```typescript
// Register shortcuts alongside items
<Command.Item
  value="copy"
  shortcut="Mod+C"
  onSelect={handleCopy}
>
  Copy
  <Command.Shortcut />  {/* Renders "⌘C" on Mac, "Ctrl+C" on Windows */}
</Command.Item>
```

The shortcut registry is global per `Command.Root` instance. Shortcuts are active even when the command palette is closed (configurable). `Mod` is a cross-platform alias (`⌘` on Mac, `Ctrl` on Windows/Linux).

**Parser uses `RegExp.escape` (ES2026)** for safe pattern construction from user-provided shortcut strings:

```typescript
// packages/command/src/keyboard/parser.ts
export function parseShortcut(shortcut: string): ParsedShortcut {
  // RegExp.escape (ES2026) — safely escape user-provided key names
  const escaped = RegExp.escape(shortcut);
  // ... parse into modifier + key combination
}
```

**Conflict detection** uses `Object.groupBy` (ES2024) to find duplicate bindings:

```typescript
const grouped = Object.groupBy(shortcuts, (s) => s.normalized);
const conflicts = Object.entries(grouped)
  .filter(([, items]) => items!.length > 1);
```

---

## 14. Animation & View Transitions

| Animation | Mechanism |
|---|---|
| List height | `--command-list-height` CSS custom property, set via `ResizeObserver` (not `offsetHeight` — avoids forced layout). GPU-composited `height` transition via `will-change: height`. |
| Dialog enter/exit | CSS `@starting-style` + `transition-behavior: allow-discrete` for native entry/exit animations without JS — zero JavaScript animation overhead |
| Item highlighting | GPU-composited `background-color` transition on `[data-command-item][data-active]` — `translate3d(0,0,0)` for layer promotion |
| Page transitions | View Transitions API (`document.startViewTransition`) when navigating between command pages — cross-document transitions in VitePress docs |
| Result count | Counter animation via CSS `@property` registered custom property (`counter-set` interpolation) — `@property --command-count { syntax: "<integer>"; inherits: false; initial-value: 0; }` |
| Scroll position | `scroll-timeline` + `animation-timeline: scroll()` for scroll-driven progress indicators in virtualized lists |
| Loading spinner | CSS `@keyframes` with `animation-composition: accumulate` for smooth interruption when loading state changes |

All animations respect `prefers-reduced-motion: reduce` — no motion when the user has requested it. `prefers-reduced-motion: no-preference` gates all transitions.

```css
/* GPU-composited dialog animation — zero layout thrash */
[data-command-dialog][data-state="open"] {
  @starting-style {
    opacity: 0;
    scale: 0.96;
    translate: 0 8px;
  }
  opacity: 1;
  scale: 1;
  translate: 0 0;
  transition:
    opacity 200ms cubic-bezier(0.16, 1, 0.3, 1),
    scale 200ms cubic-bezier(0.16, 1, 0.3, 1),
    translate 200ms cubic-bezier(0.16, 1, 0.3, 1),
    display 200ms allow-discrete,
    overlay 200ms allow-discrete;
}

[data-command-dialog][data-state="closed"] {
  opacity: 0;
  scale: 0.96;
  translate: 0 4px;
  transition:
    opacity 150ms cubic-bezier(0.4, 0, 1, 1),
    scale 150ms cubic-bezier(0.4, 0, 1, 1),
    translate 150ms cubic-bezier(0.4, 0, 1, 1),
    display 150ms allow-discrete,
    overlay 150ms allow-discrete;
}

/* Scroll-driven progress indicator */
[data-command-list] {
  overflow-y: auto;
  scroll-timeline: --list-scroll block;
}

[data-command-scroll-indicator] {
  animation: scroll-progress linear;
  animation-timeline: --list-scroll;
}

@keyframes scroll-progress {
  from { scale: 0 1; }
  to   { scale: 1 1; }
}
```

---

## 15. Build Pipeline & Configuration Files

### 15.1 tsdown.config.ts (per-package)

```typescript
// tsdown 0.21.0 (stable) — Rolldown/Oxc-powered
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: {
    isolatedDeclarations: true,    // Fast .d.ts via Oxc parser — no full type-check needed
  },
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  target: 'es2026',                // ES2026 — Iterator Helpers, Set methods, Promise.try, using/await using
  treeshake: true,                  // Rolldown tree-shaking — dead code elimination
  minify: false,                    // Leave minification to consumers
  external: ['react', 'react-dom', 'radix-ui', '@crimson_dev/command'],
  platform: 'browser',
  define: {
    __DEV__: 'process.env.NODE_ENV !== "production"',
  },
});
```

### 15.2 biome.json (root)

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.6/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "nursery": {
        "noUndeclaredDependencies": "error",
        "useExplicitType": "warn",
        "noMissingGenericFamilyKeyword": "error",
        "useSortedClasses": "error"
      },
      "correctness": {
        "useExhaustiveDependencies": "error",
        "noUnusedImports": "error",
        "noUnusedVariables": "error"
      },
      "performance": {
        "noAccumulatingSpread": "error",
        "noBarrelFile": "error",
        "noReExportAll": "error"
      },
      "suspicious": {
        "noConsole": "warn"
      },
      "style": {
        "useImportType": "error",
        "useTemplate": "error",
        "useExponentiationOperator": "error"
      }
    },
    "domains": {
      "test": "on"
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "assist": {
    "actions": {
      "source": {
        "organizeImports": { "level": "on" }
      }
    }
  },
  "javascript": {
    "formatter": {
      "semicolons": "always",
      "quoteStyle": "single",
      "trailingCommas": "all",
      "arrowParentheses": "always",
      "bracketSameLine": false
    },
    "globals": ["Temporal"]
  },
  "css": {
    "formatter": {
      "enabled": true
    },
    "linter": {
      "enabled": true
    }
  },
  "files": {
    "ignore": [
      "dist/",
      "*.wasm",
      "coverage/",
      ".changeset/",
      "node_modules/"
    ]
  }
}
```

### 15.3 tsconfig.base.json

```json
{
  "compilerOptions": {
    "target": "ES2026",
    "module": "ES2025",
    "moduleResolution": "bundler",
    "lib": ["ES2026", "ESNext", "DOM", "DOM.Iterable", "DOM.AsyncIterable"],
    "jsx": "react-jsx",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noUncheckedSideEffectImports": true,
    "erasableSyntaxOnly": true,
    "isolatedDeclarations": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": true
  }
}
```

> **Note:** `target: "ES2026"` enables all Stage 4 features including Iterator Helpers, Set methods, `Promise.try`, and explicit resource management. `lib` includes `"ESNext"` for `Temporal` and other Stage 3 features shipping in Node 25.8+.

### 15.4 package.json (Root Workspace)

```json
{
  "name": "@crimson_dev/command-monorepo",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.0.0-alpha.12",
  "engines": {
    "node": ">=25.8.0",
    "pnpm": ">=11.0.0-alpha.12"
  },
  "scripts": {
    "build": "pnpm -r --parallel run build",
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "bench": "vitest bench",
    "bench:ci": "node --import tsx benchmarks/standalone/ci-bench.ts",
    "lint": "biome check .",
    "lint:fix": "biome check . --write",
    "format": "biome format . --write",
    "typecheck": "tsc --noEmit",
    "size": "pnpm build && size-limit",
    "docs:dev": "pnpm --filter docs run dev",
    "docs:build": "pnpm --filter docs run build",
    "changeset": "changeset",
    "version": "changeset version",
    "release": "pnpm build && changeset publish"
  },
  "devDependencies": {
    "@biomejs/biome": "2.4.6",
    "@changesets/changelog-github": "1.0.0-next.1",
    "@changesets/cli": "3.0.0-next.1",
    "@playwright/test": "1.59.0-alpha-2026-03-06",
    "@size-limit/preset-small-lib": "12.0.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@vitest/coverage-v8": "4.1.0-beta.6",
    "happy-dom": "20.8.3",
    "lefthook": "2.1.2",
    "size-limit": "12.0.1",
    "tinybench": "6.0.0",
    "tsdown": "0.21.0",
    "typescript": "6.0.1-rc",
    "vitest": "4.1.0-beta.6"
  }
}
```

### 15.5 lefthook.yml

```yaml
# Lefthook 2.1.2 — parallel execution, skip conditions, zero npm deps
pre-commit:
  parallel: true
  commands:
    lint:
      glob: "*.{ts,tsx,js,jsx,json,css}"
      run: biome check --staged --no-errors-on-unmatched {staged_files}
    typecheck:
      glob: "*.{ts,tsx}"
      run: tsc --noEmit
      skip:
        - merge
        - rebase

pre-push:
  commands:
    test:
      run: vitest run --reporter=dot
    size:
      run: pnpm build && size-limit
```

### 15.6 .changeset/config.json

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0-next.1/schema.json",
  "changelog": ["@changesets/changelog-github", { "repo": "crimson-dev/command" }],
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "privatePackages": { "version": false, "tag": false },
  "changedFilePatterns": ["src/**", "package.json"]
}
```

---

## 16. Testing Strategy

### 16.1 Unit Tests (Vitest 4.1.0-beta.6 — Core Engine)

All unit tests use ES2026 features, `using` for cleanup, and `Temporal` for time-sensitive tests.

| Test Suite | What It Tests | Count |
|---|---|---|
| `machine.test.ts` | State transitions, event handling, navigation, page stack, `Disposable` cleanup, rAF batching | ~60 tests |
| `search.test.ts` | Default scorer accuracy, keyword expansion, incremental filtering, match positions, `Iterator` pipeline correctness, `Math.sumPrecise` score aggregation | ~50 tests |
| `frecency.test.ts` | Score calculation, `Temporal`-based decay curves, persistence round-trip, IDB adapter, `AsyncDisposable` cleanup | ~30 tests |
| `keyboard.test.ts` | Shortcut parsing, `Mod` resolution, `RegExp.escape` safety, KeyboardEvent matching, `Object.groupBy` conflict detection | ~35 tests |
| `registry.test.ts` | Item/group registration, deregistration, ordering, `Set.intersection`/`Set.difference` operations, `WeakRef` GC behavior | ~25 tests |

```typescript
// Example: machine.test.ts — using Vitest 4.1.0-beta.6 + ES2026 features
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCommandMachine } from '../src/machine.js';

describe('CommandMachine', () => {
  it('should auto-dispose via using declaration', () => {
    const disposeSpy = vi.fn();

    {
      using machine = createCommandMachine({
        items: [{ id: 'test', value: 'Test Item' }],
      });

      // Override dispose for spy
      const originalDispose = machine[Symbol.dispose];
      machine[Symbol.dispose] = () => {
        disposeSpy();
        originalDispose.call(machine);
      };

      expect(machine.getState().filteredCount).toBe(1);
    }
    // `using` triggered Symbol.dispose at block exit
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it('should batch rapid events via rAF scheduler', async () => {
    using machine = createCommandMachine({ items: generateItems(1000) });

    // Send 10 events in rapid succession
    for (let i = 0; i < 10; i++) {
      machine.send({ type: 'SEARCH_CHANGE', query: `q${i}` });
    }

    // Only the last query should be applied after rAF flush
    await vi.waitFor(() => {
      expect(machine.getState().search).toBe('q9');
    });
  });

  it('should use Temporal for frecency timestamps', () => {
    using machine = createCommandMachine({
      items: [{ id: 'test', value: 'Test' }],
      frecency: { enabled: true },
    });

    machine.send({ type: 'ITEM_SELECT', id: 'test' as ItemId });

    const state = machine.getState();
    expect(state.lastUpdated).toBeInstanceOf(Temporal.Instant);
  });
});
```

### 16.2 Integration Tests (Vitest + @testing-library/react 16.3.2)

| Test Suite | What It Tests |
|---|---|
| `command.test.tsx` | Full component rendering, search → filter → select flow, `useTransition` pending state |
| `dialog.test.tsx` | Open/close, focus management, portal rendering, `@starting-style` animation states, `inert` attribute |
| `virtualization.test.tsx` | Large list rendering, scroll behavior, item recycling, `ResizeObserver` measurement, `content-visibility` |
| `async.test.tsx` | Suspense integration, loading states, error boundaries, `use()` hook, `Activity` API preservation |

```typescript
// Example: command.test.tsx — React 19.3.0-canary + Testing Library 16.3.2
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Command } from '../src/index.js';

describe('Command.Root', () => {
  it('should filter items via useTransition without blocking input', async () => {
    const user = userEvent.setup();

    render(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.Item value="apple">Apple</Command.Item>
          <Command.Item value="banana">Banana</Command.Item>
          <Command.Item value="cherry">Cherry</Command.Item>
        </Command.List>
      </Command>
    );

    const input = screen.getByRole('combobox');
    await user.type(input, 'app');

    // Input should be responsive immediately (useTransition)
    expect(input).toHaveValue('app');

    // Results should filter (after transition completes)
    await screen.findByText('Apple');
    expect(screen.queryByText('Banana')).not.toBeInTheDocument();
    expect(screen.queryByText('Cherry')).not.toBeInTheDocument();
  });
});
```

### 16.3 E2E Tests (Playwright 1.59.0-alpha-2026-03-06)

| Test Suite | Browsers |
|---|---|
| `basic.spec.ts` | Chrome, Firefox, Safari, Edge — `aria` snapshot assertions |
| `keyboard.spec.ts` | Full keyboard navigation, vim bindings, shortcuts, `pressSequentially()` |
| `accessibility.spec.ts` | axe-core audit, screen reader announcement verification, `forced-colors` |
| `virtualization.spec.ts` | Scroll performance with 10K items, `content-visibility` verification |
| `animation.spec.ts` | `@starting-style` transitions, `prefers-reduced-motion` respect, View Transitions |

```typescript
// Example: accessibility.spec.ts — Playwright 1.59.0-alpha
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('should pass axe accessibility audit', async ({ page }) => {
  await page.goto('/test-fixtures/basic');
  await page.getByRole('combobox').click();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});

test('should announce result count changes', async ({ page }) => {
  await page.goto('/test-fixtures/basic');
  const input = page.getByRole('combobox');

  await input.pressSequentially('app');   // Playwright 1.59 pressSequentially

  // aria snapshot testing (Playwright 1.59 feature)
  await expect(page.getByRole('status')).toHaveAccessibleName(/1 result/);
});
```

### 16.4 Benchmark Tests (Vitest bench + Tinybench 6.0.0)

| Benchmark | Target |
|---|---|
| Filter 1K items | < 1ms |
| Filter 10K items (default scorer) | < 5ms |
| Filter 10K items (WASM scorer) | < 1ms |
| Filter 100K items (WASM scorer) | < 3ms |
| React render 100 items | < 2ms |
| React render 1K items (virtualized) | < 5ms |

```typescript
// benchmarks/search.bench.ts — vitest bench subcommand
import { bench, describe } from 'vitest';
import { createCommandMachine } from '@crimson_dev/command';

const items1K = generateItems(1_000);
const items10K = generateItems(10_000);

describe('Search Scoring', () => {
  bench('filter 1K items (default scorer)', () => {
    using machine = createCommandMachine({ items: items1K });
    machine.send({ type: 'SEARCH_CHANGE', query: 'test' });
  });

  bench('filter 10K items (default scorer)', () => {
    using machine = createCommandMachine({ items: items10K });
    machine.send({ type: 'SEARCH_CHANGE', query: 'test' });
  });
});
```

```typescript
// benchmarks/standalone/ci-bench.ts — Tinybench 6.0.0 for CI regression
import { Bench } from 'tinybench';

const bench = new Bench({ warmupIterations: 100, iterations: 1000 });

bench.add('filter 10K items', () => { /* ... */ });

const results = await bench.run();
for (const task of results) {
  console.log(`${task.name}: p75=${task.result!.p75}ms p99=${task.result!.p99}ms`);
}
```

---

## 17. Documentation Site

### 17.1 Stack

VitePress `2.0.0-alpha.16` with custom theme using OKLCH design tokens, variable fonts (Geist Sans, Geist Mono), View Transitions API for page navigation, Shiki `4.0.1` with `@shikijs/twoslash@4.0.1` for TypeScript hover information in code examples, and `@shikijs/engine-javascript` for WASM-free SSG builds.

### 17.2 Design Tokens — OKLCH + GPU-Composited Aesthetics

```css
/* apps/docs/.vitepress/theme/styles/vars.css */
/* OKLCH color space — perceptually uniform, P3-gamut capable */
/* GPU-composited transitions — will-change, translate3d, @property */

/* @property for animated gradient and counter interpolation */
@property --color-hue {
  syntax: "<number>";
  inherits: true;
  initial-value: 265;
}

@property --command-count {
  syntax: "<integer>";
  inherits: false;
  initial-value: 0;
}

@property --gradient-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

:root {
  /* OKLCH primary palette — perceptually uniform lightness */
  --color-primary:          oklch(0.65 0.25 var(--color-hue));
  --color-primary-hover:    oklch(0.60 0.28 var(--color-hue));
  --color-primary-active:   oklch(0.55 0.30 var(--color-hue));
  --color-primary-subtle:   oklch(0.95 0.05 var(--color-hue));

  /* Surface hierarchy — 5 levels for depth perception */
  --color-surface-0:        oklch(0.99 0.002 var(--color-hue));
  --color-surface-1:        oklch(0.97 0.005 var(--color-hue));
  --color-surface-2:        oklch(0.95 0.008 var(--color-hue));
  --color-surface-3:        oklch(0.93 0.010 var(--color-hue));
  --color-surface-overlay:  oklch(0.99 0.002 var(--color-hue) / 0.9);

  /* Text hierarchy */
  --color-text:             oklch(0.20 0.02 var(--color-hue));
  --color-text-secondary:   oklch(0.40 0.02 var(--color-hue));
  --color-text-muted:       oklch(0.55 0.02 var(--color-hue));
  --color-text-on-primary:  oklch(0.99 0.005 var(--color-hue));

  /* Semantic colors */
  --color-accent:           oklch(0.70 0.20 145);
  --color-success:          oklch(0.72 0.19 145);
  --color-warning:          oklch(0.80 0.18 85);
  --color-danger:           oklch(0.65 0.25 25);
  --color-info:             oklch(0.68 0.20 240);

  /* Borders */
  --color-border:           oklch(0.90 0.01 var(--color-hue));
  --color-border-hover:     oklch(0.80 0.02 var(--color-hue));
  --color-border-focus:     oklch(0.65 0.25 var(--color-hue) / 0.5);

  /* Variable fonts — Geist family */
  --font-sans: 'Geist Sans Variable', 'Inter Variable', system-ui, -apple-system, sans-serif;
  --font-mono: 'Geist Mono Variable', 'JetBrains Mono Variable', ui-monospace, monospace;

  /* Font feature settings for optimal rendering */
  --font-features-body: "kern" 1, "liga" 1, "calt" 1;
  --font-features-code: "kern" 1, "liga" 0, "zero" 1, "ss01" 1;

  /* GPU-composited transitions — cubic-bezier curves for perceived speed */
  --ease-out-expo:    cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out-expo: cubic-bezier(0.87, 0, 0.13, 1);
  --ease-spring:      linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32%, 1.051 36.4%, 1.017 38.8%, 0.991, 0.977 43%, 0.974 44.8%, 0.975 47.2%, 0.997 53.3%, 1.003 55.5%, 1.003 58.1%, 1 63.2%, 0.999 70.2%, 1);

  --transition-fast:   120ms var(--ease-out-expo);
  --transition-normal: 200ms var(--ease-out-expo);
  --transition-slow:   350ms var(--ease-out-expo);
  --transition-spring: 500ms var(--ease-spring);
}

/* Dark mode — automatic via oklch lightness inversion */
@media (prefers-color-scheme: dark) {
  :root {
    --color-primary:          oklch(0.75 0.20 var(--color-hue));
    --color-primary-hover:    oklch(0.80 0.22 var(--color-hue));
    --color-surface-0:        oklch(0.15 0.01 var(--color-hue));
    --color-surface-1:        oklch(0.18 0.015 var(--color-hue));
    --color-surface-2:        oklch(0.21 0.018 var(--color-hue));
    --color-surface-3:        oklch(0.24 0.020 var(--color-hue));
    --color-surface-overlay:  oklch(0.15 0.01 var(--color-hue) / 0.9);
    --color-text:             oklch(0.93 0.01 var(--color-hue));
    --color-text-secondary:   oklch(0.75 0.015 var(--color-hue));
    --color-text-muted:       oklch(0.60 0.015 var(--color-hue));
    --color-border:           oklch(0.30 0.02 var(--color-hue));
    --color-border-hover:     oklch(0.40 0.03 var(--color-hue));
  }
}

/* Animated gradient hero — GPU-composited via @property */
.hero-gradient {
  background: conic-gradient(
    from var(--gradient-angle),
    oklch(0.65 0.25 265),
    oklch(0.70 0.20 300),
    oklch(0.75 0.22 330),
    oklch(0.70 0.25 265)
  );
  animation: gradient-rotate 8s linear infinite;
  will-change: --gradient-angle;
}

@keyframes gradient-rotate {
  to { --gradient-angle: 360deg; }
}

/* Forced colors / high contrast support */
@media (forced-colors: active) {
  :root {
    --color-primary: LinkText;
    --color-text: CanvasText;
    --color-surface-0: Canvas;
    --color-border: ButtonBorder;
  }
}
```

### 17.3 VitePress Config

```typescript
// apps/docs/.vitepress/config.ts — VitePress 2.0.0-alpha.16
import { defineConfig } from 'vitepress';
import { createHighlighter } from 'shiki';  // Shiki 4.0.1
import { transformerTwoslash } from '@shikijs/twoslash';  // @shikijs/twoslash 4.0.1

export default defineConfig({
  title: '@crimson_dev/command',
  description: 'Headless command palette engine for React 19',
  
  markdown: {
    codeTransformers: [
      transformerTwoslash({
        // Shiki 4.0.1 Twoslash — TypeScript hover info in code blocks
        twoslashOptions: {
          compilerOptions: {
            target: 99,  // ESNext
            module: 199, // ES2025
            lib: ['ES2026', 'DOM'],
          },
        },
      }),
    ],
    shikiSetup: async (shiki) => {
      // Shiki 4.0.1 — WASM-free RegExp engine for SSG
      // Uses @shikijs/engine-javascript instead of WASM TextMate
    },
  },

  // View Transitions API for page navigation — VitePress 2.0 feature
  appearance: {
    transition: {
      enabled: true,
      viewTransition: true,
    },
  },

  sitemap: { hostname: 'https://command.crimson.dev' },

  themeConfig: {
    search: { provider: 'local' },
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/command' },
      { text: 'Examples', link: '/examples/basic' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Basic Usage', link: '/guide/basic-usage' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Async Items', link: '/guide/async-items' },
            { text: 'Virtualization', link: '/guide/virtualization' },
            { text: 'WASM Search', link: '/guide/wasm-search' },
            { text: 'Frecency', link: '/guide/frecency' },
            { text: 'Keyboard Shortcuts', link: '/guide/shortcuts' },
            { text: 'Theming', link: '/guide/theming' },
            { text: 'Accessibility', link: '/guide/accessibility' },
          ],
        },
        {
          text: 'Migration',
          items: [
            { text: 'From cmdk', link: '/guide/migration-from-cmdk' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/crimson-dev/command' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@crimson_dev/command' },
    ],
  },
});
```

### 17.4 Site Structure

- **Guide:** Getting started, installation, basic usage, advanced patterns, migration from cmdk — all code examples use ES2026 + TS 6.0.1-rc with Twoslash hover info
- **API Reference:** Every component prop, hook parameter, and type definition — auto-generated from TSDoc via `typedoc` + VitePress plugin
- **Examples:** Interactive live demos embedded in docs (React 19.3.0-canary components rendered inline via custom VitePress plugin)
- **Architecture:** Visual diagrams — Mermaid for flow diagrams, SVGO `4.0.1`-optimized SVGs for architecture overviews, animated with CSS `@property` gradients

---

## 18. GitHub Infrastructure

### 18.1 CI Pipeline (`.github/workflows/ci.yml`)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '25.8.0'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm biome check .
      - run: pnpm tsc --noEmit

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]  # Parallel test sharding
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '25.8.0'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm vitest run --coverage --shard=${{ matrix.shard }}/4
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-${{ matrix.shard }}
          path: coverage/

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '25.8.0'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm playwright install --with-deps chromium firefox webkit
      - run: pnpm playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '25.8.0'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm size-limit

  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '25.8.0'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm bench:ci
```

### 18.2 Release Pipeline (`.github/workflows/release.yml`)

```yaml
name: Release
on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write
  id-token: write  # npm provenance

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '25.8.0'
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - name: Create Release PR or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
          version: pnpm changeset version
          commit: "chore: release packages"
          title: "chore: release packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 18.3 Docs Deployment (`.github/workflows/docs.yml`)

```yaml
name: Docs
on:
  push:
    branches: [main]
    paths: ['apps/docs/**', 'packages/*/src/**']

permissions:
  pages: write
  id-token: write

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '25.8.0'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm docs:build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: apps/docs/.vitepress/dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

### 18.4 Size Budgets

| Package | Budget (min+gzip) |
|---|---|
| `@crimson_dev/command` (core) | ≤ 3.0 KB |
| `@crimson_dev/command-react` | ≤ 5.0 KB |
| `@crimson_dev/command-search-wasm` | ≤ 50 KB (WASM binary) |

---

## 19. Performance Targets

| Metric | cmdk@1.1.1 | Target |
|---|---|---|
| Bundle size (core + react) | ~12 KB (with Radix transitive) | ≤ 8 KB |
| Time to first result (1K items) | ~8ms | ≤ 2ms |
| Time to first result (10K items) | Unusable | ≤ 5ms (TS), ≤ 1ms (WASM) |
| Time to first result (100K items) | N/A | ≤ 3ms (WASM) |
| Input-to-render latency | ~16ms (synchronous) | ≤ 8ms (via `useTransition`) |
| Memory (10K items in DOM) | ~40 MB (all rendered) | ~2 MB (virtualized) |
| Runtime dependencies | 23 transitive packages | 0 (core), ~8 (react) |
| Lighthouse a11y score | ~85 | 100 |
| First Contentful Paint (docs site) | N/A | ≤ 0.8s |
| Cumulative Layout Shift (docs site) | N/A | 0 |
| Total Blocking Time (docs site) | N/A | ≤ 50ms |

---

## 20. Migration Path from cmdk

### 20.1 Drop-in Compatibility Mode

For the simplest migration, the React adapter exports a `cmdk`-compatible API:

```diff
- import { Command } from 'cmdk';
+ import { Command } from '@crimson_dev/command-react';

// Everything else works identically:
<Command>
  <Command.Input />
  <Command.List>
    <Command.Empty>No results.</Command.Empty>
    <Command.Group heading="Fruits">
      <Command.Item onSelect={handleSelect}>Apple</Command.Item>
    </Command.Group>
  </Command.List>
</Command>
```

### 20.2 What Changes

| cmdk Pattern | @crimson_dev/command-react |
|---|---|
| `shouldFilter={false}` | Still supported, but you can also use `filter` prop for custom scoring |
| `Command.Dialog` wraps Radix Dialog | Same — but uses unified `radix-ui@1.4.4-rc` package |
| `--cmdk-list-height` CSS var | Renamed to `--command-list-height` (aliased for compat) |
| `[cmdk-*]` data attributes | Renamed to `[data-command-*]` (aliased for compat) |
| `useSyncExternalStore` shim | Removed — native React 19 |
| No virtualization | Automatic virtualization for 100+ items |
| No `"use client"` | Every component has `"use client"` |
| `forwardRef` on all components | `ref` as prop (React 19 native) |

### 20.3 Codemod

A JSCodeshift codemod will be provided to automate the migration:

```bash
npx @crimson_dev/command-codemod migrate ./src
```

Handles: import rewriting, data attribute renaming, CSS custom property renaming, `forwardRef` → `ref` prop migration, and `shouldFilter` → `filter` prop migration.

---

## 21. Granular Release Roadmap — 0.0.1 → 1.0.0

> Every release below is a publishable npm version. The roadmap is designed so that each patch/minor delivers a self-contained, testable, usable increment. All code from the first line written uses ES2026, TypeScript 6.0.1-rc, and the exact pinned versions in Section 5.

---

### Phase 0 — Scaffold & Toolchain (0.0.x)

#### `0.0.1` — Monorepo Skeleton + Toolchain Lock

**What ships:** Empty publishable packages with zero runtime code — pure infrastructure.

- pnpm workspace with `pnpm@11.0.0-alpha.12` in `packageManager`
- `packages/command/`, `packages/command-react/`, `packages/command-search-wasm/` directories
- `tsconfig.base.json` → `target: "ES2026"`, `module: "ES2025"`, `lib: ["ES2026", "ESNext", "DOM"]`, `isolatedDeclarations: true`, `erasableSyntaxOnly: true`, `verbatimModuleSyntax: true`
- `biome.json` → Biome `2.4.6` — linting, formatting, organize imports, GritQL rules, CSS lint
- `tsdown.config.ts` per package → tsdown `0.21.0`, `target: "es2026"`, `isolatedDeclarations: true`
- `lefthook.yml` → lefthook `2.1.2` — pre-commit lint + typecheck, pre-push test + size-limit
- `.changeset/config.json` → `@changesets/cli@3.0.0-next.1` + `@changesets/changelog-github@1.0.0-next.1`
- `vitest.config.ts` → vitest `4.1.0-beta.6`, `environment: 'happy-dom'` (happy-dom `20.8.3`), coverage via `@vitest/coverage-v8@4.1.0-beta.6`
- `playwright.config.ts` → Playwright `1.59.0-alpha-2026-03-06`, browsers: chromium, firefox, webkit
- `.github/workflows/ci.yml` — lint + typecheck + test + size-limit + bench (Node `25.8.0`)
- `.github/workflows/release.yml` — changesets-driven npm publish with provenance
- `.github/workflows/docs.yml` — VitePress `2.0.0-alpha.16` deploy to GitHub Pages
- `size-limit` config → `size-limit@12.0.1` + `@size-limit/preset-small-lib@12.0.1`
- Root `package.json` with all devDependencies at pinned versions from Section 5
- `LICENSE` (MIT), `README.md` (hero + badges), `ARCHITECTURE.md` (blank), `CONTRIBUTING.md`

#### `0.0.2` — Type Foundation + Event Vocabulary

**What ships:** Core type definitions, branded types, event discriminated unions — zero runtime, types-only.

- `packages/command/src/types.ts` — `CommandState`, `CommandEvent`, `CommandItem`, `CommandGroup`, `CommandMachineOptions`
- Branded types: `ItemId`, `GroupId` with `unique symbol` brands
- `satisfies` assertions on all default config objects
- `const` type parameters on factory functions for narrowed inference
- `NoInfer<T>` on callback parameters to prevent unwanted widening
- `Disposable` and `AsyncDisposable` interfaces on all resource-managing types
- `Temporal.Instant` in state shape for `lastUpdated`
- Barrel export from `packages/command/src/index.ts` — `export type` for all types (verbatimModuleSyntax)
- Unit test: `types.test.ts` — compile-time type assertions via `expectTypeOf` (vitest)

#### `0.0.3` — Event Emitter + Scheduler Utilities

**What ships:** Two standalone utilities — the typed event emitter and the rAF-batched scheduler.

- `packages/command/src/utils/event-emitter.ts` — `TypedEmitter<T>` class
  - `WeakRef`-backed listeners for GC-safe subscriptions
  - `Iterator.prototype.map/filter/forEach` (ES2026) for listener pipeline
  - `Disposable` return from `.on()` for `using` auto-cleanup
  - `Symbol.dispose` on the emitter itself
- `packages/command/src/utils/scheduler.ts` — `createScheduler()`
  - `Promise.withResolvers<void>()` (ES2024) for flush coordination
  - `requestAnimationFrame` batching — coalesces multiple `schedule()` calls into one rAF
  - `Symbol.dispose` for cleanup
- Unit tests: `event-emitter.test.ts` (~15 tests), `scheduler.test.ts` (~12 tests)
  - Tests use `using` for cleanup, `vi.useFakeTimers()` for rAF control

#### `0.0.4` — Command Registry (Item/Group Management)

**What ships:** The item and group registration system.

- `packages/command/src/registry.ts` — `CommandRegistry` class
  - `Map<ItemId, CommandItem>` for O(1) item lookup
  - `Set` methods (ES2026): `Set.intersection`, `Set.difference`, `Set.union` for efficient ID operations during bulk registration/deregistration
  - `Object.groupBy` (ES2024) for grouping items by `groupId`
  - Registration returns `Disposable` for `using` auto-deregister
  - Maintains insertion order for stable rendering
- Unit tests: `registry.test.ts` (~25 tests)
  - Tests bulk register/deregister, Set operations, group membership

#### `0.0.5` — Default Search Scorer

**What ships:** The pure TypeScript substring scorer that handles the 90% case.

- `packages/command/src/search/default-scorer.ts` — `scoreItem()` function
  - `Iterator.prototype.map/filter/toArray()` for scoring pipeline
  - `Math.sumPrecise` (ES2026) for floating-point-safe score aggregation
  - `toLocaleLowerCase()` for locale-aware case folding
  - Position-weighted scoring: start-of-string > word-boundary > mid-word
  - Contiguous match bonus for adjacent character runs
  - Match position extraction: `ReadonlyArray<readonly [start: number, end: number]>`
- `packages/command/src/search/types.ts` — `SearchResult`, `ScorerFn`, `SearchEngine` interface
- `packages/command/src/search/index.ts` — search engine factory with pluggable scorer
- Unit tests: `search.test.ts` (~50 tests)
  - Accuracy tests for all scoring paths, edge cases (empty query, single char, Unicode)
  - Benchmark: `search.bench.ts` via `vitest bench` — 1K items < 1ms baseline

#### `0.0.6` — Incremental Filtering

**What ships:** Query-append optimization — when a user types one more character, only re-score previous matches.

- Extends search engine with `previousResults` tracking
- `Set` intersection to filter candidate items from previous match set
- Benchmark comparison: full rescan vs. incremental prune on 10K items
- Unit tests: `search-incremental.test.ts` (~15 tests)

#### `0.0.7` — Keyboard Shortcut Parser + Matcher

**What ships:** Shortcut string parsing and KeyboardEvent matching — standalone, no UI.

- `packages/command/src/keyboard/parser.ts` — `parseShortcut("Mod+Shift+K")`
  - `RegExp.escape` (ES2026) for safe pattern construction from user strings
  - Cross-platform `Mod` → `Meta` (Mac) / `Control` (Win/Linux)
- `packages/command/src/keyboard/matcher.ts` — `matchesShortcut(event, parsed)`
  - `Object.groupBy` (ES2024) for modifier grouping
- `packages/command/src/keyboard/index.ts` — `KeyboardShortcutRegistry`
  - Registration returns `Disposable` for `using` auto-deregister
  - Conflict detection: `Object.groupBy` to find duplicate bindings
- Unit tests: `keyboard.test.ts` (~35 tests)
  - Cross-platform modifier resolution, conflict detection, edge cases

#### `0.0.8` — Frecency Engine

**What ships:** The frecency scoring and persistence system.

- `packages/command/src/frecency/index.ts` — `FrecencyEngine`
  - `Temporal.Now.instant()` for sub-millisecond time tracking
  - `Temporal.Duration` for recency bucket calculation (hours, days, weeks)
  - Step weights per recency bucket: 4× (1hr), 2× (1day), 1.5× (1wk), 1× (1mo), 0.5× (older)
- `packages/command/src/frecency/storage.ts` — `FrecencyStorage` interface (pluggable)
- `packages/command/src/frecency/memory-storage.ts` — in-memory default
  - `Map` with `Iterator.prototype.toArray()` for serialization
- Unit tests: `frecency.test.ts` (~30 tests)
  - Mocked `Temporal.Now.instant()` for deterministic decay testing

#### `0.0.9` — State Machine v1

**What ships:** The core state machine that ties everything together — registry, search, frecency, keyboard, scheduler.

- `packages/command/src/machine.ts` — `createCommandMachine(options)`
  - Implements `Disposable` → `Symbol.dispose` cleans up scheduler, registry, listeners
  - `useSyncExternalStore`-compatible API: `getState()`, `subscribe()`, `send()`
  - Event handling for all `CommandEvent` types
  - Navigation: next/prev/first/last with ID-based indexing (no DOM queries)
  - Page stack: push/pop with history
  - Open/close/toggle for dialog mode
  - Search is deferred via scheduler — multiple rapid `SEARCH_CHANGE` events coalesce
  - Frecency re-ranking after search scoring
- Integration tests: `machine-integration.test.ts` (~20 tests)
  - Full flow: register → search → navigate → select → frecency boost → search again
- **This is the first publishable `@crimson_dev/command` package.** Core engine is feature-complete at the API level.

---

### Phase 1 — React Adapter Foundation (0.1.x)

#### `0.1.0` — Core Hook + Command.Root + Command.Input

**What ships:** The fundamental React 19 binding layer — enough to render a basic command palette.

- `packages/command-react/src/hooks/use-command.ts`
  - `useSyncExternalStore` (native React 19) — binds state machine to React
  - `useTransition` — wraps search updates for non-blocking input
  - `useOptimistic` — instant active item feedback
  - `useId` — generates ARIA IDs
- `packages/command-react/src/command.tsx` — `<Command.Root>`
  - `"use client"` directive
  - Creates `CommandMachine` instance, provides via context
  - `ref` as prop (no `forwardRef`)
  - React Compiler-compatible structure (no manual memo)
- `packages/command-react/src/input.tsx` — `<Command.Input>`
  - `useEffectEvent` for stable `onValueChange` callback
  - `aria-expanded`, `aria-controls`, `aria-activedescendant`
  - `role="combobox"`
- `packages/command-react/src/context.ts` — React context with `use()` support
- Integration test: basic render + type → filter flow
- Peer dependency: `react@19.3.0-canary-46103596-20260305`

#### `0.1.1` — Command.List + Command.Item

**What ships:** Listbox rendering and item components — items visible in the palette.

- `packages/command-react/src/list.tsx` — `<Command.List>`
  - `role="listbox"`, `aria-label`
  - `ResizeObserver` for `--command-list-height` CSS custom property
  - `will-change: height` for GPU-composited height transitions
- `packages/command-react/src/item.tsx` — `<Command.Item>`
  - `role="option"`, `aria-selected`, `aria-disabled`
  - `ref` as prop, `useId` for ID generation
  - `data-command-item`, `data-active`, `data-disabled` attributes
- `packages/command-react/src/hooks/use-register.ts`
  - `useInsertionEffect` for paint-before-commit item registration

#### `0.1.2` — Command.Group + Command.Empty + Command.Separator

**What ships:** Group rendering, empty state, and visual separators.

- `packages/command-react/src/group.tsx` — `<Command.Group>`
  - `role="group"`, `aria-labelledby` with `useId()` heading ID
- `packages/command-react/src/empty.tsx` — `<Command.Empty>`
  - `role="status"`, `aria-live="polite"` — announced when no results match
- `packages/command-react/src/separator.tsx` — `<Command.Separator>`
  - `role="separator"`

#### `0.1.3` — Command.Loading + aria-live Result Count

**What ships:** Loading state for async sources and screen reader announcements.

- `packages/command-react/src/loading.tsx` — `<Command.Loading>`
  - `aria-busy` on list during loading
  - Suspense boundary integration
- Hidden `aria-live="polite"` region — announces "N results" on filter change, debounced 300ms
- `role="status"` on result count for screen reader announcement

#### `0.1.4` — Command.Highlight + Command.Badge

**What ships:** Search match highlighting and category badges.

- `packages/command-react/src/highlight.tsx` — `<Command.Highlight>`
  - Uses match position ranges from search scorer
  - Wraps matched characters in `<mark>` with `data-command-highlight`
- `packages/command-react/src/badge.tsx` — `<Command.Badge>`
  - Category/type indicator badge

#### `0.1.5` — Command.Shortcut

**What ships:** Keyboard shortcut badge component + registry integration.

- `packages/command-react/src/shortcut.tsx` — `<Command.Shortcut>`
  - Renders platform-appropriate key labels (⌘ on Mac, Ctrl on Win)
  - `aria-keyshortcuts` on parent item
- `packages/command-react/src/hooks/use-keyboard.ts`
  - `useEffectEvent` for stable shortcut handler
  - `using` for auto-cleanup of global listeners

#### `0.1.6` — Command.Page (Multi-Page Navigation)

**What ships:** Nested command pages with push/pop navigation.

- `packages/command-react/src/page.tsx` — `<Command.Page>`
  - Page stack management via state machine
  - Back navigation with Backspace (when input is empty)
- View Transitions API (`document.startViewTransition`) for animated page switches

#### `0.1.7` — Primitives (Slot/AsChild Pattern)

**What ships:** Minimal `Primitive` and `Slot` implementation — replaces `@radix-ui/react-primitive`.

- `packages/command-react/src/primitives.ts` — 12 lines
  - `Slot` component for `asChild` pattern
  - Merges refs, props, and event handlers

#### `0.1.8` — Command.AsyncItems (Suspense Integration)

**What ships:** Async data sources with React Suspense.

- `packages/command-react/src/async-items.tsx` — `<Command.AsyncItems>`
  - `use()` hook for resolving async item sources
  - Suspense boundary wrapping
  - Error boundary integration
- Integration test: async loading → results → error boundary fallback

#### `0.1.9` — Full Component Integration Tests

**What ships:** Comprehensive integration test suite for all components working together.

- `tests/unit/command.test.tsx` — full component rendering + interaction flow (~30 tests)
- `tests/unit/dialog.test.tsx` — placeholder (dialog added in 0.2.x)
- `tests/unit/async.test.tsx` — Suspense integration tests (~15 tests)
- Coverage target: ≥80% for `command-react/src/**`

---

### Phase 2 — Dialog + Virtualization (0.2.x)

#### `0.2.0` — Command.Dialog (Radix Integration)

**What ships:** Dialog overlay component using `radix-ui@1.4.4-rc`.

- `packages/command-react/src/dialog.tsx` — `<Command.Dialog>`
  - Wraps Radix `Dialog.Root`, `Dialog.Portal`, `Dialog.Overlay`, `Dialog.Content`
  - `@starting-style` CSS animations for enter/exit — zero JS animation
  - `transition-behavior: allow-discrete` for display/overlay transitions
  - `inert` attribute on background content
  - Focus trap via Radix Dialog built-in focus management
  - `"use client"` directive
- Dialog-specific CSS custom properties:
  - `--command-overlay-opacity`, `--command-dialog-scale`, `--command-dialog-translate`
- Runtime dependency: `radix-ui@1.4.4-rc.1766004502650`

#### `0.2.1` — Virtualization Engine (Core Logic)

**What ships:** Variable-height virtual scrolling — automatic activation above 100 items.

- `packages/command-react/src/hooks/use-virtualizer.ts`
  - `ResizeObserver` for container + item measurement
  - GPU-composited `transform: translateY()` for scroll positioning
  - `requestIdleCallback` for deferred measurement (fallback: `setTimeout(fn, 0)`)
  - `content-visibility: auto` on off-screen items
  - `will-change: transform` on scroll container
  - Overscan: 2 viewports above + below visible area
  - DOM node recycling via absolute positioning

#### `0.2.2` — Virtualization Integration

**What ships:** Virtualization wired into `<Command.List>`.

- `<Command.List>` automatically activates virtualization when `filteredCount > 100`
- `virtualize={false}` prop for opt-out (cmdk behavior)
- Smooth scroll-to-active on keyboard navigation
- Tests: `virtualization.test.tsx` — render 10K items, verify DOM node count < 100

#### `0.2.3` — Dialog Animation Polish

**What ships:** Refined dialog animations with `@starting-style`, spring curves, and `prefers-reduced-motion` respect.

- CSS: `@starting-style` enter animation (opacity, scale, translate)
- CSS: Exit animation via `transition-behavior: allow-discrete`
- Spring easing via `linear()` approximation
- `prefers-reduced-motion: reduce` → instant transitions, zero motion
- `prefers-contrast: more` → high-contrast focus indicators

#### `0.2.4` — Scroll-Driven Animations

**What ships:** Scroll progress indicator and scroll-driven effects in virtualized lists.

- `scroll-timeline` + `animation-timeline: scroll()` for progress bar
- Fading edge indicators (top/bottom) using scroll-driven opacity
- GPU-composited — zero layout thrash

#### `0.2.5` — Activity API Integration

**What ships:** Preserves palette state when hidden using React 19.3.0-canary `<Activity>`.

- `<Activity mode="hidden">` wraps palette contents when dialog closes
- Avoids remount — preserves scroll position, input state, and selection
- Graceful degradation: if `Activity` is unavailable, falls back to normal unmount

#### `0.2.6` — Accessibility Hardening Pass

**What ships:** Full WCAG 2.1 AA compliance verified by axe-core and manual testing.

- `forced-colors: active` support (Windows High Contrast)
- `prefers-contrast: more` support
- `inert` attribute verification on background content
- Screen reader announcement testing (VoiceOver, NVDA, JAWS)
- Lighthouse accessibility score: 100

#### `0.2.7` — E2E Test Suite (Playwright 1.59.0-alpha)

**What ships:** Cross-browser E2E test suite.

- `basic.spec.ts` — basic render + interaction flow (Chrome, Firefox, Safari, Edge)
- `keyboard.spec.ts` — full keyboard nav, vim bindings, shortcuts, `pressSequentially()`
- `accessibility.spec.ts` — axe-core audit, aria snapshot testing (Playwright 1.59 feature)
- `virtualization.spec.ts` — scroll performance with 10K items

#### `0.2.8` — Bundle Size Optimization

**What ships:** Tree-shaking verification, dead code elimination, size budget enforcement.

- `size-limit` config with budgets: core ≤ 3.0 KB, react ≤ 5.0 KB
- tsdown `treeshake: true` verification
- Import analysis: verify `radix-ui` tree-shakes to Dialog + VisuallyHidden only
- No barrel file re-exports (Biome `noBarrelFile` rule)

#### `0.2.9` — API Stabilization + Documentation Stubs

**What ships:** API freeze for 0.x — no breaking changes after this point until 1.0.0.

- JSDoc/TSDoc on every exported function, type, and component
- `ARCHITECTURE.md` updated with finalized diagrams
- API reference stubs for VitePress docs

---

### Phase 3 — WASM Search + Frecency Persistence (0.3.x–0.4.x)

#### `0.3.0` — WASM Search: Rust Crate + Trigram Index

**What ships:** Rust crate with trigram index — compiles to WASM, not yet wired to JS.

- `packages/command-search-wasm/crate/` — Rust edition 2024
- `trigram.rs` — trigram extraction + inverted index
- `scorer.rs` — Levenshtein distance with SIMD hints
- `lib.rs` — `wasm-bindgen` entry point
- `Cargo.toml` — `wasm-pack 0.14.0`, `wasm-bindgen`, `serde`, `serde-wasm-bindgen`
- Rust tests: `cargo test` in CI

#### `0.3.1` — WASM Search: JS Wrapper + Async Loader

**What ships:** JavaScript wrapper that loads WASM module and exposes `SearchEngine` interface.

- `packages/command-search-wasm/src/index.ts`
  - `await using` for WASM module lifecycle
  - `AsyncDisposable` interface
  - `createWasmSearchEngine()` factory
- Dynamic `import()` for code-split WASM binary

#### `0.3.2` — WASM Search: Web Worker Support

**What ships:** WASM module running in a dedicated Web Worker for off-main-thread search.

- `SharedArrayBuffer` + `Float32Array` for zero-copy score transfer
- `MessagePort` for worker communication
- Fallback: main-thread WASM if `SharedArrayBuffer` unavailable (no COOP/COEP)

#### `0.3.3` — WASM Search: Integration with Core Engine

**What ships:** Pluggable WASM search wired into the core state machine.

- `createCommandMachine({ search: wasmEngine })` — drop-in replacement for default scorer
- Automatic fallback: WASM → TypeScript scorer if WASM fails to load
- Integration tests: 10K items with WASM scorer

#### `0.3.4` — WASM Search: Benchmark + Optimization

**What ships:** Performance benchmarks and optimization pass for WASM search.

- `filter-10k.bench.ts` — WASM vs. TypeScript scorer comparison
- `filter-100k.bench.ts` — WASM-only (TS scorer not viable at 100K)
- Target: 10K < 1ms, 100K < 3ms
- WASM binary size target: ≤ 45KB gzipped

#### `0.4.0` — Frecency: IndexedDB Persistence (idb-keyval 6.2.2)

**What ships:** Frecency data persists across browser sessions via IndexedDB.

- `packages/command/src/frecency/idb-storage.ts`
  - Uses `idb-keyval@6.2.2` for lightweight IndexedDB wrapper
  - `AsyncDisposable` — `await using` for transaction cleanup
  - Namespaced storage keys: `frecency:${namespace}`
- Unit tests: `frecency-idb.test.ts` — persistence round-trip with mock IDB

#### `0.4.1` — Frecency: Decay Curve Tuning + Temporal Integration

**What ships:** Final frecency algorithm tuning with `Temporal`-based time measurement.

- `Temporal.Now.instant()` for sub-millisecond precision
- `Temporal.Duration` for human-readable bucket boundaries
- Configurable decay curve via `frecencyOptions.decayConfig`
- Benchmark: frecency re-ranking overhead < 0.5ms on 10K items

---

### Phase 4 — Documentation Site (0.5.x–0.6.x)

#### `0.5.0` — VitePress 2.0.0-alpha.16 Site Scaffold

**What ships:** Documentation site skeleton with OKLCH theme.

- `apps/docs/` — VitePress `2.0.0-alpha.16`
- Custom theme with OKLCH design tokens (Section 17.2)
- Variable fonts: Geist Sans, Geist Mono
- `@property` registered custom properties for animated gradients
- GPU-composited transitions: `--ease-out-expo`, `--ease-spring` via `linear()`
- Dark mode via OKLCH lightness inversion
- `forced-colors: active` / `prefers-contrast: more` support
- View Transitions API for page navigation

#### `0.5.1` — Shiki 4.0.1 + Twoslash Integration

**What ships:** Code highlighting with TypeScript hover information.

- Shiki `4.0.1` — new `createHighlighterCore` for tree-shakeable bundles
- `@shikijs/twoslash@4.0.1` — TypeScript hover info in fenced code blocks
- `@shikijs/engine-javascript` — WASM-free RegExp engine for SSG builds
- All code examples written in ES2026 + TS 6.0.1-rc syntax

#### `0.5.2` — Guide: Getting Started + Installation + Basic Usage

**What ships:** Core documentation pages.

- Getting Started — what the library is, who it's for, architecture overview
- Installation — pnpm/npm/yarn instructions, peer dependency requirements
- Basic Usage — minimal example, compound component API, CSS styling

#### `0.5.3` — Guide: Advanced Patterns

**What ships:** Advanced usage documentation.

- Async Items — `<Command.AsyncItems>` + Suspense
- Virtualization — automatic activation, opt-out, custom measurement
- WASM Search — installation, usage, Web Worker setup
- Frecency — enabling, IndexedDB persistence, custom decay curves
- Keyboard Shortcuts — registration, `Mod` key, conflict detection
- Theming — OKLCH design tokens, CSS custom properties, dark mode
- Accessibility — ARIA patterns, screen reader support, forced-colors

#### `0.5.4` — API Reference (Auto-Generated)

**What ships:** Complete API documentation auto-generated from TSDoc.

- Every exported type, function, component, hook, and config option documented
- Props tables with types, defaults, and descriptions
- Interactive examples embedded inline

#### `0.5.5` — Interactive Examples

**What ships:** Live, editable examples in the docs site.

- React 19.3.0-canary components rendered inline via custom VitePress plugin
- Basic palette, Dialog mode, Async search, Virtualized 10K items, Frecency, Shortcuts
- Each example is a standalone, copy-pasteable code block

#### `0.5.6` — Migration Guide + Codemod Documentation

**What ships:** Detailed migration guide from cmdk.

- Step-by-step migration instructions
- Breaking changes list
- Codemod usage documentation
- Before/after code comparisons

#### `0.6.0` — Architecture Diagrams + Visual Polish

**What ships:** Visual architecture documentation and final design polish.

- Mermaid flow diagrams for state machine, event flow, package relationships
- SVG architecture diagrams optimized with SVGO `4.0.1`
- Animated hero section with OKLCH conic-gradient (`@property --gradient-angle`)
- Docs Lighthouse scores: FCP ≤ 0.8s, CLS = 0, TBT ≤ 50ms

#### `0.6.1` — Search + Sitemap + SEO

**What ships:** Local search, sitemap generation, Open Graph meta.

- VitePress built-in local search
- `sitemap.xml` generation for `https://command.crimson.dev`
- Open Graph images, meta descriptions, canonical URLs

---

### Phase 5 — Playground + Codemod (0.7.x)

#### `0.7.0` — Interactive Playground App

**What ships:** Standalone React 19 playground for experimentation.

- `apps/playground/` — Vite + React 19.3.0-canary
- Live editing of Command palette configuration
- Performance profiler overlay (render time, filter time, memory)
- Theme customizer with OKLCH color picker
- Virtualization toggle with item count slider (up to 100K)

#### `0.7.1` — Codemod: Import Rewriting

**What ships:** First codemod transform — rewrites `cmdk` imports.

- `import { Command } from 'cmdk'` → `import { Command } from '@crimson_dev/command-react'`
- `import { useCommandState } from 'cmdk'` → updated import paths

#### `0.7.2` — Codemod: Data Attribute + CSS Property Renaming

**What ships:** Codemod transforms for attribute/property migration.

- `[cmdk-root]` → `[data-command-root]`
- `[cmdk-item]` → `[data-command-item]`
- `--cmdk-list-height` → `--command-list-height`
- Handles CSS files, inline styles, and JSX `className` strings

#### `0.7.3` — Codemod: forwardRef → ref Prop Migration

**What ships:** Removes `forwardRef` wrappers from consumer code using command components.

- Detects `React.forwardRef` wrapping command component usage
- Converts to direct `ref` prop (React 19 native)

#### `0.7.4` — Codemod: shouldFilter → filter Prop

**What ships:** Migrates `shouldFilter` boolean to `filter` function prop.

- `shouldFilter={false}` → `filter={false}`
- Preserves existing `filter` prop usage

---

### Phase 6 — Hardening + Performance (0.8.x)

#### `0.8.0` — Performance Optimization Pass

**What ships:** Systematic performance audit and optimization of all hot paths.

- Profile all `SEARCH_CHANGE` → render paths with React DevTools
- Verify React Compiler output — no unnecessary re-renders
- Verify `useTransition` correctly defers list re-rendering
- Verify `useOptimistic` provides instant active item feedback
- Verify rAF batching coalesces rapid events
- Verify `content-visibility: auto` reduces off-screen rendering cost
- All performance targets from Section 19 met or exceeded

#### `0.8.1` — Memory Optimization

**What ships:** Memory usage reduction for large datasets.

- `WeakRef` for all internal listener references
- `FinalizationRegistry` for debugging leaked subscriptions (dev-only)
- Virtualization memory budget: ≤ 2MB for 10K items
- Verify GC behavior with `--expose-gc` flag

#### `0.8.2` — Concurrency Optimization

**What ships:** Maximum concurrency for search and rendering.

- WASM search in Web Worker — verified off-main-thread via performance tracing
- `requestIdleCallback` for all deferred measurement (virtualization, height)
- `navigator.scheduling.isInputPending()` for yielding to user input during long search
- `scheduler.yield()` integration for cooperative scheduling

#### `0.8.3` — GPU Compositing Verification

**What ships:** Verify all animations and transitions are GPU-composited.

- Chrome DevTools Layers panel audit — no layout-triggering properties animated
- All transitions use `transform`, `opacity`, `scale`, `translate` only
- `will-change` hints on all animated elements
- `content-visibility: auto` verified in Layers panel
- No forced synchronous layouts (no `offsetHeight`, `getBoundingClientRect()` in hot paths)

#### `0.8.4` — Cross-Browser Testing Matrix

**What ships:** Verified compatibility across all target browsers.

- Playwright 1.59.0-alpha: Chrome, Firefox, Safari, Edge
- ES2026 feature support verification per browser
- `@starting-style` fallback for browsers without support
- `content-visibility` fallback for Firefox (as of March 2026 status)
- `view-transition-name` fallback for browsers without View Transitions

#### `0.8.5` — Security Audit

**What ships:** Security review of all dependencies and code patterns.

- `pnpm audit` — zero known vulnerabilities
- CSP compatibility: no `eval()`, no inline scripts
- XSS prevention: all user-provided strings escaped in ARIA attributes
- WASM: `Content-Security-Policy: wasm-unsafe-eval` documentation

#### `0.8.6` — Stress Testing

**What ships:** Extreme load testing — 100K items, rapid typing, concurrent async sources.

- 100K items + WASM search: filter time < 3ms verified
- Rapid typing (10 chars/second): no dropped frames verified
- 5 concurrent async sources loading simultaneously: correct ordering
- Memory leak detection over 1000 open/close cycles

---

### Phase 7 — Release Candidates (0.9.x)

#### `0.9.0` — Release Candidate 1

**What ships:** Feature-complete RC with all packages at their final API shape.

- `@crimson_dev/command@0.9.0`
- `@crimson_dev/command-react@0.9.0`
- `@crimson_dev/command-search-wasm@0.9.0`
- `@crimson_dev/command-codemod@0.9.0`
- API freeze — no new features, breaking changes, or public API modifications
- Full test suite passing: unit + integration + E2E + benchmarks
- Documentation site complete and deployed

#### `0.9.1` — RC1 Bug Fixes

**What ships:** Bug fixes from RC1 community feedback.

- Issue triage and priority fixes
- Edge case corrections
- Documentation fixes

#### `0.9.2` — RC2: React 19.3.0 Stable Alignment

**What ships:** Alignment with React 19.3.0 stable (when released).

- Update peer dependency from canary to stable `^19.3.0`
- Verify all `useEffectEvent`, `Activity`, `use()` behavior matches stable
- Update Radix from `1.4.4-rc` to latest stable if available

#### `0.9.3` — RC3: TypeScript 6.0.1 Stable Alignment

**What ships:** Alignment with TypeScript 6.0.1 stable (when released).

- Update devDependency from `6.0.1-rc` to `6.0.1`
- Verify all `isolatedDeclarations`, `erasableSyntaxOnly` behavior
- Regenerate all `.d.ts` files

#### `0.9.4` — RC4: Final Dependency Updates

**What ships:** All dependencies bumped to their latest stable versions.

- tsdown → latest stable (0.21.x or newer)
- Biome → latest 2.4.x patch
- Vitest → latest 4.x stable
- Playwright → latest 1.59.x stable
- VitePress → latest 2.0.x stable
- All other deps bumped to latest patches

#### `0.9.5` — RC5: Documentation Final Review

**What ships:** Final documentation review and polish.

- All code examples verified to compile with TS 6.0.1 stable
- All interactive examples verified to render correctly
- Migration guide verified end-to-end against real cmdk projects
- Codemod verified against 5+ real-world cmdk codebases

#### `0.9.6` — RC6: Performance Baseline Lock

**What ships:** Final performance baselines locked for regression tracking.

- All benchmarks run 3× and averaged
- Results committed as `benchmarks/baseline.json`
- CI benchmark regression threshold: ≤ 5% degradation = warning, ≤ 15% = failure

#### `0.9.7` — RC7: Accessibility Final Audit

**What ships:** Final accessibility audit with assistive technology.

- VoiceOver (macOS): full flow tested
- NVDA (Windows): full flow tested
- JAWS (Windows): full flow tested
- Android TalkBack: basic flow tested
- Lighthouse accessibility: 100

#### `0.9.8` — RC8: README + Social Assets

**What ships:** Final README, social preview images, and launch assets.

- Hero README with animated install snippet (OKLCH-themed SVG badges)
- Open Graph image for GitHub and npm
- Twitter/X card image
- Demo GIF (screen recording of palette in action)

#### `0.9.9` — RC9: Pre-Release Final

**What ships:** The last pre-release. Everything is frozen. Next version is 1.0.0.

- Final changeset: all packages version-bumped to `0.9.9`
- `CHANGELOG.md` complete for all packages
- npm `dry-run` publish verified
- GitHub Release draft prepared with full release notes

---

### `1.0.0` — Stable Release

**What ships:** The production-ready, stable release of all four packages.

| Package | Version | Size |
|---|---|---|
| `@crimson_dev/command` | `1.0.0` | ≤ 3.0 KB min+gzip |
| `@crimson_dev/command-react` | `1.0.0` | ≤ 5.0 KB min+gzip |
| `@crimson_dev/command-search-wasm` | `1.0.0` | ≤ 50 KB WASM binary |
| `@crimson_dev/command-codemod` | `1.0.0` | CLI tool |

**Release checklist:**

- [ ] All tests passing (unit + integration + E2E + benchmarks)
- [ ] All performance targets met (Section 19)
- [ ] Bundle sizes within budget (Section 18.4)
- [ ] Lighthouse accessibility: 100
- [ ] Documentation site deployed and verified
- [ ] Migration guide tested against real cmdk codebases
- [ ] Codemod tested against real cmdk codebases
- [ ] npm publish with provenance attestation
- [ ] GitHub Release with full changelog
- [ ] Social announcement with demo GIF/video
- [ ] npm deprecation notice on `cmdk` pointing to migration guide (if applicable)

---

## 22. Version Audit Changelog — What Changed From Spec v1

> This section documents every version change between the original specification and this v2 audit, conducted March 6, 2026 against live npm registry data.

| Package | Spec v1 Version | Spec v2 Version | Change Type | Impact |
|---|---|---|---|---|
| TypeScript | `6.0.0-dev.20260228` | `6.0.1-rc` | dev → rc | Release candidate — more stable, includes all 6.0 features, surfaces TS 7.0 deprecation warnings |
| ECMAScript Target | `ES2024` | `ES2026` / `ESNext` | Major upgrade | Unlocks: `Promise.try`, Iterator Helpers, `Math.sumPrecise`, Set methods, `Temporal`, `RegExp.escape`, `Atomics.pause` |
| Node.js | `25.7.0` | `25.8.0` | Patch | Bug fixes, performance improvements |
| `radix-ui` | `^1.2.0` | `1.4.4-rc.1766004502650` | Minor → RC | Latest RC with React 19.3.0-canary compatibility; 2 minor versions ahead |
| `react` | `^19.3.0` | `19.3.0-canary-46103596-20260305` | Caret → exact canary | Pinned to specific canary for `Activity` API, `useEffectEvent` stabilization |
| `react-dom` | `^19.3.0` | `19.3.0-canary-46103596-20260305` | Caret → exact canary | Matched to react canary |
| `idb-keyval` | `^6.2.1` | `6.2.2` | Caret → exact | Pinned to latest patch |
| `tsdown` | `0.21.0-beta.2` | `0.21.0` | Beta → stable | Stable release — no longer beta |
| `@biomejs/biome` | `2.4.4` | `2.4.6` | Patch | Bug fixes, improved CSS linting |
| `pnpm` | `11.0.0-alpha.11` | `11.0.0-alpha.12` | Alpha patch | Bug fixes |
| `vitest` | `4.1.0-beta.5` | `4.1.0-beta.6` | Beta patch | Bug fixes, improved `bench` subcommand |
| `@vitest/coverage-v8` | `4.1.0-beta.5` | `4.1.0-beta.6` | Beta patch | Matched to vitest |
| `@testing-library/react` | `^16.3.0` | `16.3.2` | Caret → exact | Pinned to latest patch |
| `@testing-library/user-event` | `^14.6.1` | `14.6.1` | Caret → exact | Pinned to latest |
| `happy-dom` | `^16.0.0` | `20.8.3` | **Major jump** | 16.x → 20.x: `Temporal` support, improved `ResizeObserver`/`IntersectionObserver`/`MutationObserver` mocks, Web Worker support, `structuredClone` |
| `@playwright/test` | `1.51.0` | `1.59.0-alpha-2026-03-06` | **8 minor versions** | Gains: `aria` snapshot testing, clock API, `pressSequentially()`, WebSocket interception, trace viewer improvements |
| `@vitest/bench` | `4.1.0-beta.5` | **REMOVED** | Removed | Absorbed into `vitest` as `vitest bench` subcommand; `tinybench@6.0.0` added for standalone CI scripts |
| `tinybench` | (not in v1) | `6.0.0` | **New** | Standalone microbenchmarking for CI regression tracking |
| `vitepress` | `2.0.0` | `2.0.0-alpha.16` | Exact → alpha | Latest alpha of VitePress 2.0 — View Transitions, improved sitemap |
| `shiki` | `^3.0.0` | `4.0.1` | **Major jump** | 3.x → 4.x: new `createHighlighterCore`, `@shikijs/engine-javascript` WASM-free engine, improved tree-shaking |
| `@shikijs/twoslash` | `^3.0.0` | `4.0.1` | **Major jump** | Matched to Shiki 4.x |
| `svgo` | `^4.0.0` | `4.0.1` | Caret → exact | Pinned to latest patch |
| `@changesets/cli` | `^2.29.0` | `3.0.0-next.1` | **Major jump** | 2.x → 3.0: ESM-only, improved workspace protocol, pnpm catalogs |
| `@changesets/changelog-github` | `^0.5.0` | `1.0.0-next.1` | **Major jump** | 0.x → 1.0: aligned with changesets v3 |
| `size-limit` | `^11.0.0` | `12.0.1` | **Major jump** | 11.x → 12.x: `--why` visualization, improved monorepo support |
| `@size-limit/preset-small-lib` | `^11.0.0` | `12.0.1` | **Major jump** | Matched to size-limit v12 |
| `lefthook` | `^1.9.0` | `2.1.2` | **Major jump** | 1.x → 2.x: parallel execution, improved globs, `skip` conditions, env vars |

### Code-Level Changes Due to Version Updates

| Version Change | Code Impact |
|---|---|
| ES2024 → ES2026 target | All code now uses: `Promise.try` (safe async), Iterator Helpers (`map/filter/toArray/forEach`), `Math.sumPrecise` (score aggregation), Set methods (`intersection/difference/union`), `RegExp.escape`, `Temporal` (frecency), `using`/`await using` (resource cleanup) |
| TS 6.0.0-dev → 6.0.1-rc | `erasableSyntaxOnly` enforced, `isolatedDeclarations` in all configs, `NoInfer<T>` used in callback types |
| happy-dom 16 → 20.8.3 | Test environment now supports `Temporal`, `ResizeObserver`, `IntersectionObserver` natively — no polyfills in tests |
| Playwright 1.51 → 1.59.0-alpha | E2E tests now use `aria` snapshot assertions, `pressSequentially()`, improved clock API |
| Shiki 3 → 4.0.1 | VitePress config uses `createHighlighterCore` + `@shikijs/engine-javascript` for WASM-free SSG |
| Changesets 2 → 3.0.0-next.1 | Config schema updated, ESM-only output |
| Lefthook 1 → 2.1.2 | Config uses `parallel: true`, `skip` conditions with env vars |
| @vitest/bench → vitest built-in | Benchmark files use `vitest bench` subcommand; standalone CI uses `tinybench@6.0.0` |

---

## Summary Table

| Category | cmdk@1.1.1 | @crimson_dev/command 1.0.0 |
|---|---|---|
| Language | TypeScript 4.6.4 | TypeScript 6.0.1-rc |
| ES Target | ES2018 (implicit) | ES2026 (`Promise.try`, Iterator Helpers, `Math.sumPrecise`, Set methods, `Temporal`, `using`/`await using`) |
| Module Format | CJS + ESM | ESM-only |
| React Version | ^18 ∣∣ ^19 (uses no 19 features) | 19.3.0-canary (`useTransition`, `useEffectEvent`, `use()`, `Activity`, React Compiler) |
| Architecture | Single 1,200-line file | 3-package monorepo, headless state machine + framework adapters |
| Runtime Deps | 4 direct, 23 transitive | 0 (core), 1 (react: `radix-ui@1.4.4-rc`) |
| Build System | tsup 8 + TS 4.6 + Prettier 2.7 | tsdown 0.21.0 + TS 6.0.1-rc + Biome 2.4.6 |
| Package Manager | pnpm 8.8.0 | pnpm 11.0.0-alpha.12 |
| Git Hooks | husky 8.x + lint-staged | lefthook 2.1.2 (parallel, zero npm deps) |
| Tests | Playwright E2E only | Vitest 4.1.0-beta.6 unit + integration + Playwright 1.59.0-alpha E2E + tinybench CI benchmarks |
| Search | Sync O(n) substring scorer, no caching | Incremental pruning + optional WASM fuzzy with trigram index |
| Virtualization | None ("up to 2-3K items") | Automatic variable-height virtual scrolling (GPU-composited) |
| Max Items | ~3,000 (practical limit) | 100,000+ (with WASM search) |
| Frecency | None | Built-in with `Temporal`-based decay + pluggable persistence (memory / IndexedDB via `idb-keyval@6.2.2`) |
| Shortcuts | None ("do it yourself") | Built-in registry with cross-platform `Mod` key, conflict detection |
| Accessibility | Partial (no live regions, no busy state) | Full WAI-ARIA combobox pattern with live announcements, `forced-colors`, `prefers-contrast`, `inert` |
| Framework | React-only | Framework-agnostic core + React 19.3.0-canary adapter |
| Docs | README only | VitePress 2.0.0-alpha.16 site with OKLCH theme, Shiki 4.0.1 + Twoslash, interactive examples |
| Animation | `offsetHeight` → CSS var (sync layout thrash) | `ResizeObserver` → CSS var + `@starting-style` + View Transitions + `scroll-timeline` + `@property` animated gradients (100% GPU-composited) |
| Bundle Size | ~12 KB (with Radix transitive) | ≤ 8 KB (core + react) |
| RSC Safe | No `"use client"` directive | Every component has `"use client"` |
| Resource Cleanup | Manual `.destroy()` / `.unsubscribe()` | `using` / `await using` (ES2026 Explicit Resource Management) |
| Versioning | `@changesets/cli@2.x` | `@changesets/cli@3.0.0-next.1` (ESM-only, workspace protocol) |
| CI | Basic lint + test | Lint + typecheck + sharded tests + E2E + size-limit + benchmark regression (Node 25.8.0) |
| Release Roadmap | None (single 1.0 release) | 72 granular versions: 0.0.1→0.0.9 (scaffold), 0.1.0→0.1.9 (React), 0.2.0→0.2.9 (Dialog/Virtual), 0.3.0→0.4.1 (WASM/Frecency), 0.5.0→0.6.1 (Docs), 0.7.0→0.7.4 (Playground/Codemod), 0.8.0→0.8.6 (Hardening), 0.9.0→0.9.9 (RCs), 1.0.0 |
