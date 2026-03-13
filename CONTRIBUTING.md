# Contributing to modern-cmdk

Thank you for your interest in contributing. This guide covers everything you need to get started.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Project Structure](#project-structure)
- [Development Commands](#development-commands)
- [Code Style](#code-style)
- [TypeScript Guidelines](#typescript-guidelines)
- [ES2026 Feature Usage](#es2026-feature-usage)
- [Testing](#testing)
  - [Unit Tests](#unit-tests)
  - [Integration Tests](#integration-tests)
  - [E2E Tests](#e2e-tests)
  - [Benchmarks](#benchmarks)
- [Performance Guidelines](#performance-guidelines)
- [Git Workflow](#git-workflow)
  - [Branch Naming](#branch-naming)
  - [Commit Conventions](#commit-conventions)
  - [Pull Request Process](#pull-request-process)
- [Architecture for New Contributors](#architecture-for-new-contributors)
- [Release Process](#release-process)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | >= 25.8.0 | Required for ES2026 features (Iterator Helpers, Explicit Resource Management) |
| pnpm | >= 11.0.0-alpha.13 | Workspace protocol, `pnpm-workspace.yaml` |
| TypeScript | 6.0.1-rc | Installed via devDependencies -- do not install globally |
| Rust + wasm-pack | Latest stable | Only needed if working on `command-search-wasm` |
| Git | >= 2.40 | For Lefthook pre-commit/pre-push hooks |

Verify your setup:

```bash
node --version    # v25.8.0 or higher
pnpm --version    # 11.0.0-alpha.13 or higher
```

---

## Setup

```bash
# Clone the repository
git clone https://github.com/ABCrimson/modern-cmdk.git
cd modern-cmdk

# Install dependencies (all packages + apps)
pnpm install

# Build all packages
pnpm build

# Verify everything works
pnpm test
pnpm typecheck
pnpm lint
```

Lefthook will install automatically via the `prepare` lifecycle script. Pre-commit and pre-push hooks are active immediately.

---

## Project Structure

```
modern-cmdk/
  package.json                    Root workspace config
  pnpm-workspace.yaml            Workspace member definitions
  tsconfig.base.json              Shared TypeScript config (ES2026 target)
  biome.json                      Biome linter + formatter config
  lefthook.yml                    Git hooks (pre-commit, pre-push)
  vitest.config.ts                Unit/integration test config
  playwright.config.ts            E2E test config (4 browsers)
  |
  packages/
    command/                      modern-cmdk (core)
      package.json                Zero dependencies, sideEffects: false
      tsconfig.json               Extends tsconfig.base.json
      tsdown.config.ts            Build config
      src/
        index.ts                  Public exports
        types.ts                  Branded types, interfaces, state
        machine.ts                State machine factory
        registry.ts               Item/group registry
        search/                   Search engine subsystem
          types.ts                SearchEngine, SearchResult, ScorerFn
          index.ts                Engine factory (incremental filtering)
          default-scorer.ts       Built-in fuzzy scorer
          fuzzy-scorer.ts         Async scorer
        frecency/                 Frecency ranking subsystem
          index.ts                FrecencyEngine (Date.now)
          storage.ts              Storage interface
          memory-storage.ts       In-memory storage
        keyboard/                 Keyboard shortcut subsystem
          parser.ts               Shortcut parser (RegExp.escape)
          matcher.ts              Event matcher
          index.ts                ShortcutRegistry (Disposable)
        utils/
          event-emitter.ts        TypedEmitter (WeakRef, Iterator Helpers)
          scheduler.ts            rAF/microtask batching
    |
    command-react/                modern-cmdk/react (React adapter)
      package.json                Peer deps: react 19, modern-cmdk
      tsconfig.json
      tsdown.config.ts
      src/
        index.ts                  Public exports
        command.ts                <Command> root
        context.ts                React context
        dialog.ts                 <Command.Dialog> (Radix)
        input.ts                  <Command.Input>
        list.tsx                  <Command.List> (virtualization)
        item.ts                   <Command.Item>
        group.tsx                 <Command.Group>
        empty.tsx                 <Command.Empty>
        loading.tsx               <Command.Loading>
        separator.tsx             <Command.Separator>
        highlight.tsx             <Command.Highlight>
        badge.tsx                 <Command.Badge>
        shortcut.tsx              <Command.Shortcut>
        page.tsx                  <Command.Page>
        async-items.tsx           <Command.AsyncItems>
        primitives.ts             Shared utilities
        styles.css                GPU-composited animations
        hooks/
          use-command.ts
          use-command-state.ts
          use-register.ts
          use-virtualizer.ts
    |
    command-search-wasm/          modern-cmdk-search-wasm (WASM)
      package.json                Peer dep: modern-cmdk
      tsconfig.json
      tsdown.config.ts
      src/
        index.ts                  TypeScript entry point
        wasm-engine.ts            WASM engine wrapper
      crate/
        Cargo.toml                Rust crate config
        src/
          lib.rs                  WASM entry point
          trigram.rs              Trigram index
          scorer.rs               Fuzzy scorer
  |
  apps/
    docs/                         VitePress 2.0.0-alpha.16 documentation site
      package.json
      index.md
      .vitepress/
        config.ts
        theme/
          index.ts
          styles/
            vars.css              OKLCH color variables
            custom.css
      guide/
        getting-started.md
        installation.md
        basic-usage.md
        migration-from-cmdk.md
      api/
        command.md
      examples/
        basic.md
    |
    playground/                   React 19 interactive demo
      package.json
      vite.config.ts
  |
  tests/
    unit/
      search.test.ts
      keyboard.test.ts
      registry.test.ts
      frecency.test.ts
    e2e/
      basic.spec.ts
      keyboard.spec.ts
      accessibility.spec.ts
      virtualization.spec.ts
  |
  benchmarks/
    search.bench.ts
    filter-10k.bench.ts
    filter-100k.bench.ts
    standalone/
      ci-bench.ts
  |
  .changeset/
    config.json                   Changesets config (public access, GitHub changelog)
  .github/
    workflows/
      ci.yml                     Lint + test + e2e + size + bench
      release.yml                Changeset publish
      docs.yml                   VitePress deploy
      benchmarks.yml             Benchmark tracking
```

---

## Development Commands

| Command | Description |
|---|---|
| `pnpm build` | Build all packages in parallel |
| `pnpm test` | Run unit tests (Vitest, happy-dom) |
| `pnpm test:watch` | Run unit tests in watch mode |
| `pnpm test:coverage` | Run tests with V8 coverage report |
| `pnpm test:e2e` | Run E2E tests (Playwright 1.59, 4 browsers) |
| `pnpm bench` | Run benchmarks (Vitest bench mode) |
| `pnpm bench:ci` | Run CI benchmarks (standalone, no Vitest) |
| `pnpm lint` | Check lint rules (Biome) |
| `pnpm lint:fix` | Fix lint issues and write changes |
| `pnpm format` | Format all files (Biome) |
| `pnpm typecheck` | Type-check with `tsc --noEmit` |
| `pnpm size` | Build and check bundle size limits |
| `pnpm docs:dev` | Start docs dev server (VitePress) |
| `pnpm docs:build` | Build docs for production |
| `pnpm changeset` | Create a changeset for your changes |
| `pnpm version` | Update package versions from changesets |
| `pnpm release` | Build and publish to npm |

### Per-package development:

```bash
# Watch mode for a specific package
pnpm --filter modern-cmdk run dev
pnpm --filter modern-cmdk/react run dev

# Run the playground (Vite 8.0.0-beta.16)
pnpm --filter playground run dev
# Opens at http://localhost:5173

# Build WASM (requires Rust + wasm-pack)
pnpm --filter modern-cmdk-search-wasm run build:wasm
```

---

## Code Style

This project uses **Biome 2.4.6** for both linting and formatting. There is no ESLint or Prettier.

### Formatter settings

| Setting | Value |
|---|---|
| Indent | 2 spaces |
| Line width | 100 characters |
| Semicolons | Always |
| Quotes | Single |
| Trailing commas | All |
| Arrow parens | Always |
| Bracket same line | No |

### Key lint rules

| Rule | Level | Why |
|---|---|---|
| `noUnusedImports` | Error | Dead code elimination |
| `noUnusedVariables` | Error | Dead code elimination |
| `useImportType` | Error | `import type` for type-only imports (verbatimModuleSyntax) |
| `useExhaustiveDependencies` | Error | React hook correctness |
| `noAccumulatingSpread` | Error | Performance -- no `{...acc, ...item}` in reduce |
| `noBarrelFile` | Error | No `export * from` re-exports |
| `noReExportAll` | Error | Explicit named exports only |
| `noConsole` | Warn | Use structured logging |
| `useSortedClasses` | Error | Consistent class ordering |
| `useExplicitType` | Warn | Explicit return types on functions |

### Import organization

Biome automatically organizes imports via `assist.actions.source.organizeImports`. Import order:

1. External packages (`react`, `radix-ui`)
2. Internal packages (`modern-cmdk`)
3. Relative imports (`./types.js`)
4. Type imports last (`import type { ... }`)

All imports use the `.js` extension suffix (required by `verbatimModuleSyntax`).

---

## TypeScript Guidelines

This project uses **TypeScript 6.0.1-rc** with strict configuration.

### Required tsconfig flags

These are set in `tsconfig.base.json` and must not be overridden:

| Flag | Purpose |
|---|---|
| `target: "ES2026"` | Emit modern syntax, no downleveling |
| `module: "ES2025"` | ESM module system |
| `strict: true` | All strict checks enabled |
| `exactOptionalPropertyTypes: true` | `undefined` must be explicit in optional props |
| `noUncheckedIndexedAccess: true` | Array/object index access returns `T \| undefined` |
| `noUncheckedSideEffectImports: true` | Side-effect imports must resolve |
| `erasableSyntaxOnly: true` | No enums, no namespaces, no parameter properties |
| `isolatedDeclarations: true` | Every export must have an explicit type annotation |
| `verbatimModuleSyntax: true` | `import type` required for type-only imports |

### Patterns to use

- **Branded types** for IDs: `type ItemId = string & { readonly __brand: unique symbol }`
- **`satisfies`** on value expressions: `const config = { ... } as const satisfies Config`
- **`NoInfer<T>`** on callback parameters: `filter: (item: CommandItem, query: NoInfer<string>) => ...`
- **`const` type params** where inference narrowing is needed
- **`readonly` on all interface properties** -- immutability by default
- **`Disposable` protocol** on any class with cleanup needs

### Patterns to avoid

- **`enum`** -- Use `as const` objects or union types instead (blocked by `erasableSyntaxOnly`)
- **`namespace`** -- Use modules (blocked by `erasableSyntaxOnly`)
- **`class` parameter properties** -- Use explicit field declarations (blocked by `erasableSyntaxOnly`)
- **`any`** -- Use `unknown` and narrow
- **`forwardRef`** -- React 19 accepts `ref` as a prop

---

## ES2026 Feature Usage

Use native ES2026 features that are supported in target browsers. Features not yet available in browsers use cross-browser helper functions.

### Native ES2026 (use directly)

| Feature | Where Used | Example |
|---|---|---|
| Iterator Helpers | Registry, search, emitter | `map.values().filter(fn).toArray()` |
| `using` / `await using` | Machine, registry, emitter, keyboard | `using machine = createCommandMachine(...)` |
| `Promise.withResolvers` | Scheduler | `const { promise, resolve } = Promise.withResolvers()` |
| `RegExp.escape` | Keyboard parser | `RegExp.escape(userInput)` |

### Cross-browser helpers (use helpers, not native)

| Feature | Helper | Location |
|---|---|---|
| Set methods | `setIntersection`, `setDifference`, `setUnion`, etc. | `core/utils/set-ops.ts` |
| `Map.groupBy` / `Object.groupBy` | `mapGroupBy`, `objectGroupBy` | `core/utils/group-by.ts` |
| `Temporal` | `Date.now()` | Direct usage (epoch ms) |
| `Promise.try` | `Promise.resolve().then(fn)` | Direct usage |
| `Math.sumPrecise` | `+= loop` | Direct usage |
| `String.isWellFormed` | `ensureWellFormed` | `core/utils/string-wellformed.ts` |

---

## Testing

### Unit Tests

**Config:** `vitest.config.ts`
**Environment:** happy-dom 20.8.3
**Files:** `packages/*/src/**/*.test.ts`, `tests/unit/**/*.test.{ts,tsx}`

```bash
# Run all unit tests
pnpm test

# Run in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage

# Run a specific test file
pnpm vitest run tests/unit/search.test.ts
```

**Coverage thresholds** (enforced in CI):

| Metric | Threshold |
|---|---|
| Statements | 80% |
| Branches | 80% |
| Functions | 80% |
| Lines | 80% |

Coverage is collected with V8 provider. Excluded from coverage: test files, bench files, index re-export files.

#### Writing unit tests

- Test the core package in isolation -- no DOM, no React
- Test pure functions (scorers, parsers, matchers) with input/output assertions
- Test stateful objects (machine, registry, engine) by exercising the public API
- Use `using` for machine/registry cleanup in tests:

```ts
import { describe, it, expect } from 'vitest';
import { createCommandMachine, itemId } from 'modern-cmdk';

describe('CommandMachine', () => {
  it('should filter items by search query', () => {
    using machine = createCommandMachine({
      items: [
        { id: itemId('copy'), value: 'Copy' },
        { id: itemId('paste'), value: 'Paste' },
      ],
    });

    machine.send({ type: 'SEARCH_CHANGE', query: 'cop' });
    // Flush the scheduler
    const state = machine.getState();
    expect(state.filteredCount).toBe(1);
  });
});
```

### Integration Tests

Integration tests verify the React adapter with `@testing-library/react` and `@testing-library/user-event`:

```bash
pnpm vitest run tests/unit/  # Integration tests live alongside unit tests
```

These tests render React components with `happy-dom` and assert DOM state, ARIA attributes, and user interactions.

### E2E Tests

**Config:** `playwright.config.ts`
**Browsers:** Chromium, Firefox, WebKit, Edge
**Test files:** `tests/e2e/**/*.spec.ts`

```bash
# Run all E2E tests
pnpm test:e2e

# Run with UI mode
pnpm playwright test --ui

# Run a specific test file
pnpm playwright test tests/e2e/basic.spec.ts

# Run in a specific browser
pnpm playwright test --project=chromium
```

E2E tests run against the playground app (`apps/playground`). The web server starts automatically via the `webServer` config.

The CI runs E2E tests with:
- `--retries 2` for flake resilience
- `--workers 1` for deterministic execution
- Artifact upload on failure (Playwright trace + screenshots)

### Benchmarks

**Config:** `vitest.config.ts` (benchmark section)
**Files:** `benchmarks/**/*.bench.ts`

```bash
# Run benchmarks (Vitest bench mode)
pnpm bench

# Run CI benchmarks (standalone, no Vitest overhead)
pnpm bench:ci
```

Benchmark targets:

| Benchmark | Target |
|---|---|
| Search 10K items (TS scorer) | < 16 ms |
| Search 100K items (WASM scorer) | < 1 ms |
| Filter 10K items (incremental) | < 2 ms |
| State update cycle | < 4 ms |

---

## Performance Guidelines

### What to measure

1. **Bundle size** -- Run `pnpm size` after any code change. The CI rejects PRs that exceed the budget.
2. **Search latency** -- Run `pnpm bench` and check the search benchmarks. Incremental filtering should be significantly faster than full re-score.
3. **Re-render count** -- In the playground, use React DevTools Profiler. Each keystroke should trigger at most 2 re-renders (input + list).
4. **Memory** -- For large item sets (10K+), check heap size in DevTools. The registry uses `Map` + `Set` for O(1) operations.

### Budget constraints

| Package | Size Limit |
|---|---|
| `modern-cmdk` | 3 KB (minified + gzipped) |
| `modern-cmdk/react` | 5 KB (minified + gzipped) |

These limits are defined in the root `package.json` under `size-limit` and enforced by the `size` CI job.

### Performance rules

- **No accumulating spread** -- Biome enforces `noAccumulatingSpread`. Use `Map`/`Set` mutations or pre-allocated arrays.
- **No barrel re-exports** -- Biome enforces `noBarrelFile` and `noReExportAll`. Each export is explicit.
- **Iterator Helpers over intermediate arrays** -- Use `.values().filter().map().toArray()` instead of creating temporary arrays.
- **Set methods over manual loops** -- Use `.intersection()`, `.difference()`, `.union()` for bulk ID operations.
- **GPU-only CSS animations** -- Only animate `opacity`, `scale`, `translate`, `background-color`. Never `width`, `height`, `top`, `left`.

---

## Git Workflow

### Branch naming

```
feat/add-async-items        Feature
fix/search-empty-query      Bug fix
perf/incremental-filter     Performance improvement
docs/architecture-diagram   Documentation
refactor/registry-set-ops   Refactor (no behavior change)
test/frecency-edge-cases    Test additions
chore/bump-biome            Tooling/dependency update
```

### Commit conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:** `feat`, `fix`, `perf`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`

**Scopes:** `core`, `react`, `wasm`, `docs`, `playground`, `ci`, `bench`

Examples:

```
feat(core): add incremental search filtering
fix(react): prevent stale activeId after unmount
perf(core): use Set.difference for bulk item removal
docs(architecture): add search pipeline diagram
test(core): add frecency decay edge cases
chore: bump Biome to 2.4.6
```

### Pull request process

1. **Branch** -- Create a branch from `main` using the naming convention above.

2. **Changeset** -- If your change affects published packages, create a changeset:
   ```bash
   pnpm changeset
   ```
   Select the affected packages and the semver bump type (patch, minor, major).

3. **Pre-commit hooks** -- Lefthook runs automatically:
   - `biome check --staged` -- lint and format staged files
   - `tsc --noEmit` -- type-check (skipped during merge/rebase)

4. **Pre-push hooks** -- Lefthook runs:
   - `vitest run` -- all unit tests
   - `size-limit` -- bundle size check

5. **CI checks** -- The CI pipeline runs:
   - Lint (`biome check .`)
   - Type-check (`tsc --noEmit`)
   - Unit tests with coverage (4 shards)
   - E2E tests (Chromium, Firefox, WebKit, Edge)
   - Bundle size check (`size-limit`)
   - Benchmarks (`bench:ci`)

6. **Review** -- All PRs require at least one approval. The CI must pass.

7. **Merge** -- Squash merge into `main`. The commit message should follow conventional commits.

---

## Architecture for New Contributors

If you are new to the codebase, here is the mental model:

```
User action (keystroke, click)
    |
    v
React adapter receives DOM event
    |
    v
Adapter calls machine.send({ type, payload })
    |
    v
Scheduler coalesces the update (rAF in browser, microtask in Node)
    |
    v
State machine processes the event:
  - SEARCH_CHANGE -> re-filter via search engine -> frecency re-rank
  - NAVIGATE -> compute new activeId
  - ITEM_SELECT -> fire onSelect, record frecency
  - OPEN/CLOSE/TOGGLE -> update dialog state
    |
    v
Machine emits 'stateChange' with new immutable state snapshot
    |
    v
useSyncExternalStore detects state change, triggers React re-render
    |
    v
Compound components read new state from context, render updated UI
```

**Key invariants:**

1. The core package never imports from `react`, `radix-ui`, or any DOM API.
2. State is always immutable -- every `setState()` creates a new object.
3. Every stateful class implements `Disposable`.
4. The machine's `.subscribe()` signature is `(listener: () => void) => () => void` -- the exact shape `useSyncExternalStore` requires.
5. All React components have `"use client"` directives.

**Where to start:**

| I want to... | Start here |
|---|---|
| Understand the state model | `packages/command/src/types.ts` |
| See how events are processed | `packages/command/src/machine.ts` |
| Understand search scoring | `packages/command/src/search/default-scorer.ts` |
| See how React connects to the core | `packages/command-react/src/context.ts` |
| Understand the animation system | `packages/command-react/src/styles.css` |
| Run the interactive demo | `pnpm --filter playground run dev` |

---

## Release Process

Releases are managed with [@changesets/cli](https://github.com/changesets/changesets).

### Creating a changeset

After making changes to any published package:

```bash
pnpm changeset
```

This prompts you to:
1. Select which packages are affected
2. Choose the semver bump type (patch, minor, major)
3. Write a summary of the change

The changeset is saved as a markdown file in `.changeset/`. Commit it with your PR.

### Publishing

When changesets are merged to `main`, the release workflow:

1. Runs `changeset version` to update `package.json` versions and generate `CHANGELOG.md` entries
2. Creates a "Version Packages" PR with the version bumps
3. When that PR is merged, runs `pnpm build && changeset publish` to publish to npm

### Configuration

The changeset config (`.changeset/config.json`):

| Setting | Value | Meaning |
|---|---|---|
| `access` | `public` | Packages are published to the public npm registry |
| `baseBranch` | `main` | Changesets are resolved against `main` |
| `updateInternalDependencies` | `patch` | Internal workspace deps get a patch bump |
| `privatePackages` | `{ version: false, tag: false }` | Private packages (apps) are not versioned |
| `changedFilePatterns` | `["src/**", "package.json"]` | Only source changes trigger changesets |
| `changelog` | `@changesets/changelog-github` | Changelog entries link to GitHub PRs |

---

## Troubleshooting

### `Iterator.range is not a function` or missing ES2026 features

Node.js 25.8.0+ ships these features natively. If you see this error, your Node.js version is too old:

```bash
node --version  # Must be >= 25.8.0
```

### `ERR_UNSUPPORTED_DIR_IMPORT` or missing `.js` extension

All imports must use the `.js` extension suffix due to `verbatimModuleSyntax`:

```ts
// Correct
import { something } from './module.js';

// Wrong -- will fail at runtime
import { something } from './module';
```

### Biome reports `useImportType` errors

Type-only imports must use the `import type` syntax:

```ts
// Correct
import type { CommandState } from './types.js';

// Wrong
import { CommandState } from './types.js';
```

### Pre-commit hook fails with `biome check`

Make sure you have the correct Biome version. It is installed as a devDependency -- do not install it globally:

```bash
pnpm biome --version  # Should output 2.4.6
```

If hooks are not running, reinstall Lefthook:

```bash
pnpm lefthook install
```

### `size-limit` fails on pre-push

Your changes exceed the bundle size budget. Common causes:

- Added a new dependency to the core package
- Accidentally included a large import (check for unintended transitive deps)
- Used `export *` instead of explicit named exports

Run `pnpm size` locally to see the current sizes and identify what grew.

### E2E tests fail locally but pass in CI

- Make sure the playground is not already running on port 5173. Playwright starts its own instance.
- Install browser binaries: `pnpm playwright install --with-deps`
- Check that you have built all packages first: `pnpm build`

### TypeScript errors after pulling latest changes

```bash
# Clear build artifacts and reinstall
rm -rf node_modules packages/*/dist
pnpm install
pnpm build
pnpm typecheck
```

### Vite 8 HMR not working in the playground

Vite 8.0.0-beta.16 requires `strictPort: true` in development. If port 5173 is already in use, the server will fail to start rather than silently picking another port. Kill any other process on port 5173 or change the port in `apps/playground/vite.config.ts`.

### WASM build fails

The WASM package requires Rust and `wasm-pack`:

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
cargo install wasm-pack

# Build WASM
pnpm --filter modern-cmdk-search-wasm run build:wasm
```

The WASM build is not required for developing the core or React packages.

---

## Questions?

Open a [GitHub Discussion](https://github.com/ABCrimson/modern-cmdk/discussions) for questions, or file an [issue](https://github.com/ABCrimson/modern-cmdk/issues) for bugs and feature requests.
