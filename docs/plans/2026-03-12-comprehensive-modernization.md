# Comprehensive Modernization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix broken virtualization, replace unavailable ES2026 APIs, fix failing E2E tests, and polish CSS/performance across the monorepo.

**Architecture:** The core engine (`packages/modern-cmdk/src/core/`) is pure TypeScript with no DOM dependencies. The React adapter (`packages/modern-cmdk/src/react/`) bridges the core to React 19. The virtualization system in `list.tsx` currently renders empty placeholder divs alongside ALL children — items never leave the DOM. The fix introduces a `visibleIdSet` that limits rendering to viewport + overscan items only.

**Tech Stack:** TypeScript 6.0.1-rc (ESNext target), React 19.3.0, tsdown 0.21.0, Vitest 4.1.0-beta.6, Playwright 1.59.0-alpha, pnpm 11.0.0-alpha.13

---

## Task 1: Fix Virtualization — Make Items Leave the DOM

**The core bug:** `list.tsx` renders `{children}` in the virtual path, so all 2000 items stay in the DOM. The virtualizer only renders empty positioned `<div>`s for visual layout. `item.tsx` checks `filteredIdSet.has(id)` — which contains ALL search-matching items, not just visible ones.

**Fix strategy:** Expose a `visibleIdSet` from the virtualizer through context. Items check both `filteredIdSet` (search match) AND `visibleIdSet` (viewport visible) before rendering.

**Files:**
- Modify: `packages/modern-cmdk/src/react/context.ts`
- Modify: `packages/modern-cmdk/src/react/list.tsx`
- Modify: `packages/modern-cmdk/src/react/item.tsx`
- Test: `tests/e2e/virtualization.spec.ts` (24 tests should pass after fix)

### Step 1: Add `visibleIdSet` to state context

In `packages/modern-cmdk/src/react/context.ts`, add the visible ID set to `CommandStateContextValue`:

```typescript
/** State context — values that change on every search/navigation */
export interface CommandStateContextValue {
  readonly state: CommandState;
  readonly isPending: boolean;
  readonly filteredIdSet: ReadonlySet<ItemId>;
  /** IDs currently visible in the virtual viewport + overscan. null = not virtualizing (render all filtered). */
  readonly visibleIdSet: ReadonlySet<ItemId> | null;
}
```

### Step 2: Compute `visibleIdSet` in `list.tsx`

In `packages/modern-cmdk/src/react/list.tsx`, derive the visible ID set from virtualizer items + filteredIds:

```typescript
// After the virtualizer hook (line ~79), compute visible IDs:
const visibleIdSet = useMemo<ReadonlySet<ItemId> | null>(() => {
  if (!shouldVirtualize) return null; // null = render all filtered items
  const { filteredIds } = stateCtx.state;
  const set = new Set<ItemId>();
  for (const vItem of virtualizer.virtualItems) {
    const id = filteredIds[vItem.index];
    if (id !== undefined) set.add(id);
  }
  return set;
}, [shouldVirtualize, virtualizer.virtualItems, stateCtx.state.filteredIds]);
```

This `visibleIdSet` must be passed down through context. The `CommandStateContext` provider lives in the `Command` root component (likely `command.tsx`). Since `list.tsx` is a child of `Command`, it can't directly override the context. Instead, wrap children in a nested state context provider that adds `visibleIdSet`:

```typescript
// In the return of CommandList, wrap {children} with an overriding context provider:
<CommandStateContext value={{ ...stateCtx, visibleIdSet }}>
  {children}
</CommandStateContext>
```

Import `CommandStateContext` from `./context.js` (it's already exported as a `Context` object).

### Step 3: Stop rendering empty virtual placeholder divs

Remove the virtual placeholder `<div>` elements from `list.tsx`. They served no purpose since items weren't positioned by them. Instead, use the virtual container's `totalSize` for scroll height:

Replace the virtual path (lines 132-149):
```typescript
{shouldVirtualize ? (
  <div
    data-command-list-virtual=""
    style={{ height: `${virtualizer.totalSize}px`, position: 'relative' }}
  >
    <CommandStateContext value={{ ...stateCtx, visibleIdSet }}>
      {children}
    </CommandStateContext>
  </div>
) : (
  <div ref={innerRef} data-command-list-inner="">
    {children}
  </div>
)}
```

### Step 4: Position rendered items via virtualizer in `item.tsx`

In `packages/modern-cmdk/src/react/item.tsx`, check `visibleIdSet` and apply virtual positioning:

```typescript
const isFiltered: boolean = stateCtx.filteredIdSet.has(id);
const isVisible: boolean = stateCtx.visibleIdSet === null || stateCtx.visibleIdSet.has(id);

if (!isFiltered || !isVisible) return null;
```

For positioning, each rendered item needs its `translateY` from the virtualizer. The virtualizer's `virtualItems` array has `{ index, start, size }` for each visible item. We need to map item IDs to their virtual position.

Option A (simple): Use CSS `content-visibility: auto` and let the browser handle off-screen culling — items render but the browser skips paint/layout. This is simpler but doesn't reduce DOM nodes.

Option B (full virtual): Items must know their `top` offset. Pass a `virtualPositionMap` through context: `Map<ItemId, number>` mapping each visible ID to its `start` pixel offset.

**Go with Option B for true DOM reduction:**

Add to context:
```typescript
export interface CommandStateContextValue {
  // ...existing fields...
  readonly visibleIdSet: ReadonlySet<ItemId> | null;
  readonly virtualPositionMap: ReadonlyMap<ItemId, number> | null;
}
```

Compute in `list.tsx`:
```typescript
const virtualPositionMap = useMemo<ReadonlyMap<ItemId, number> | null>(() => {
  if (!shouldVirtualize) return null;
  const { filteredIds } = stateCtx.state;
  const map = new Map<ItemId, number>();
  for (const vItem of virtualizer.virtualItems) {
    const id = filteredIds[vItem.index];
    if (id !== undefined) map.set(id, vItem.start);
  }
  return map;
}, [shouldVirtualize, virtualizer.virtualItems, stateCtx.state.filteredIds]);
```

Apply in `item.tsx`:
```typescript
const virtualStart = stateCtx.virtualPositionMap?.get(id);
const virtualStyle: CSSProperties | undefined =
  virtualStart !== undefined
    ? { position: 'absolute', top: 0, left: 0, width: '100%', translate: `0 ${virtualStart}px` }
    : undefined;

// In the return:
<div
  ref={ref}
  data-command-item=""
  style={virtualStyle}
  // ...other props
>
```

### Step 5: Fix auto-virtualization race condition

The circular dependency: `shouldVirtualize` depends on `filteredCount`, which depends on registered items, which depends on whether items mount (which depends on `shouldVirtualize`).

Fix by latching: once virtualization activates, keep it active until explicitly turned off.

In `list.tsx`:
```typescript
const shouldVirtualizeRef = useRef<boolean>(false);
const computedVirtualize: boolean = virtualize ?? stateCtx.state.filteredCount > 100;

// Latch: once enabled, stay enabled until prop override or count drops below threshold
if (computedVirtualize) shouldVirtualizeRef.current = true;
else if (stateCtx.state.filteredCount <= 50) shouldVirtualizeRef.current = false; // hysteresis

const shouldVirtualize: boolean = virtualize ?? shouldVirtualizeRef.current;
```

### Step 6: Build and verify

Run: `pnpm --filter modern-cmdk run build`
Expected: Clean build, no errors

### Step 7: Run virtualization E2E tests

Run: `npx playwright test tests/e2e/virtualization.spec.ts --project chromium`
Expected: 24/24 tests pass — DOM nodes < 100, scroll renders new items, keyboard nav works

### Step 8: Commit

```bash
git add packages/modern-cmdk/src/react/context.ts packages/modern-cmdk/src/react/list.tsx packages/modern-cmdk/src/react/item.tsx
git commit -m "feat: true DOM virtualization — items leave DOM when scrolled off-screen

Items now check visibleIdSet (viewport + overscan) in addition to
filteredIdSet (search match). Virtual positioning via translateY on
each visible item. Latch-based auto-virtualization prevents race
condition between shouldVirtualize and filteredCount."
```

---

## Task 2: Replace Temporal API with Date.now()

**Problem:** `Temporal` is not available in any browser. The codebase has 18+ `Temporal.Now.instant()` calls and `Temporal.Instant` types in production code. Tests polyfill it, but production doesn't.

**Strategy:** Replace all Temporal usage with `Date.now()` (returns epoch milliseconds). Millisecond precision is more than sufficient for frecency decay and session timing. Change the `lastUpdated` type from `Temporal.Instant` to `number`.

**Files:**
- Modify: `packages/modern-cmdk/src/core/types.ts`
- Modify: `packages/modern-cmdk/src/core/machine.ts`
- Modify: `packages/modern-cmdk/src/core/frecency/index.ts`
- Modify: `packages/modern-cmdk/src/core/frecency/idb-storage.ts`
- Modify: `packages/modern-cmdk/src/core/telemetry.ts`
- Test: existing unit tests should still pass

### Step 1: Update types

In `packages/modern-cmdk/src/core/types.ts`:
- Change `lastUpdated: Temporal.Instant` → `lastUpdated: number` (epoch ms)
- Change `lastUsed: Temporal.Instant` → `lastUsed: number` in FrecencyRecord
- Change `createInitialState` to use `Date.now()` instead of `Temporal.Now.instant()`

### Step 2: Update machine.ts

Replace all `Temporal.Now.instant()` calls (9 occurrences) with `Date.now()`:
- Line 171: `lastUpdated: Temporal.Now.instant()` → `lastUpdated: Date.now()`
- Lines 183, 191, 220, 252, 267, 278, 285, 298: same replacement

### Step 3: Update frecency/index.ts

Replace `Temporal.Now.instant()` with `Date.now()`:
- Line 33: default parameter — `now = Date.now()`
- Line 89: recording — `Date.now()`
- Lines 36-37: duration calculation — `(Date.now() - record.lastUsed) / 3_600_000` for hours

### Step 4: Update frecency/idb-storage.ts

Replace `Temporal.Instant.fromEpochNanoseconds()` with plain number:
- Serialization: store `record.lastUsed` directly (it's already a number)
- Deserialization: read it directly as a number

### Step 5: Update telemetry.ts

Replace `Temporal.Now.instant()` with `Date.now()` and `.since().total('milliseconds')` with subtraction:
- Line 40: `const start = Date.now()`
- Line 50: `const elapsed = Date.now() - start`

### Step 6: Run unit tests

Run: `pnpm --filter modern-cmdk run test`
Expected: All 413 tests pass (Temporal polyfill in test setup will no longer be hit)

### Step 7: Build and verify

Run: `pnpm --filter modern-cmdk run build`
Expected: Clean build, no type errors

### Step 8: Commit

```bash
git add packages/modern-cmdk/src/core/types.ts packages/modern-cmdk/src/core/machine.ts packages/modern-cmdk/src/core/frecency/index.ts packages/modern-cmdk/src/core/frecency/idb-storage.ts packages/modern-cmdk/src/core/telemetry.ts
git commit -m "fix: replace Temporal API with Date.now() for browser compatibility

Temporal is Stage 3 and not available in Firefox/Safari. Date.now()
provides sufficient millisecond precision for frecency decay and
session timing. Changes lastUpdated/lastUsed types from
Temporal.Instant to number (epoch ms)."
```

---

## Task 3: Replace Promise.try with Standard Patterns

**Problem:** `Promise.try()` is Stage 3 and not available in any browser.

**Files:**
- Modify: `packages/modern-cmdk/src/core/search/fuzzy-scorer.ts` (2 uses)
- Modify: `packages/modern-cmdk/src/core/frecency/index.ts` (1 use)

### Step 1: Replace in fuzzy-scorer.ts

```typescript
// Before:
Promise.try(() => scoreItem(query, item))

// After:
new Promise<SearchResult | null>((resolve) => resolve(scoreItem(query, item)))
```

And for the batch version:
```typescript
// Before:
Promise.try(() => items.values().map(...)...)

// After:
new Promise<SearchResult[]>((resolve) => resolve(items.values().map(...)...))
```

### Step 2: Replace in frecency/index.ts

```typescript
// Before:
Promise.try(() => this.#storage.save(...)).catch(...)

// After:
Promise.resolve().then(() => this.#storage.save(...)).catch(...)
```

### Step 3: Run unit tests

Run: `pnpm --filter modern-cmdk run test`
Expected: All tests pass

### Step 4: Commit

```bash
git add packages/modern-cmdk/src/core/search/fuzzy-scorer.ts packages/modern-cmdk/src/core/frecency/index.ts
git commit -m "fix: replace Promise.try() with standard Promise patterns

Promise.try is Stage 3 and unavailable in browsers. Use
new Promise(resolve => resolve(fn())) for synchronous-to-async
wrapping."
```

---

## Task 4: Replace Map.groupBy / Object.groupBy

**Problem:** `Map.groupBy` and `Object.groupBy` are not available in browsers. Used in 3 core files + 1 codemod file.

**Files:**
- Modify: `packages/modern-cmdk/src/core/machine.ts` (1 use)
- Modify: `packages/modern-cmdk/src/core/registry.ts` (1 use)
- Modify: `packages/modern-cmdk/src/core/keyboard/matcher.ts` (1 use)
- Modify: `packages/modern-cmdk/src/codemod/cli.ts` (1 use)

### Step 1: Create a local `mapGroupBy` helper

In `packages/modern-cmdk/src/core/utils/group-by.ts`:

```typescript
/** Polyfill for Map.groupBy — groups items by a key function */
export function mapGroupBy<K, V>(items: Iterable<V>, keyFn: (item: V) => K): Map<K, V[]> {
  const map = new Map<K, V[]>();
  for (const item of items) {
    const key = keyFn(item);
    let group = map.get(key);
    if (!group) {
      group = [];
      map.set(key, group);
    }
    group.push(item);
  }
  return map;
}
```

### Step 2: Replace all `Map.groupBy` calls

In each file, replace `Map.groupBy(items, keyFn)` with `mapGroupBy(items, keyFn)`.

### Step 3: Replace `Object.groupBy` in codemod/cli.ts

Replace with a manual reduce or use the same helper pattern adapted for plain objects.

### Step 4: Run tests and commit

```bash
git add packages/modern-cmdk/src/core/utils/group-by.ts packages/modern-cmdk/src/core/machine.ts packages/modern-cmdk/src/core/registry.ts packages/modern-cmdk/src/core/keyboard/matcher.ts packages/modern-cmdk/src/codemod/cli.ts
git commit -m "fix: replace Map.groupBy/Object.groupBy with local helper

Map.groupBy and Object.groupBy are not shipped in any browser.
Use a local mapGroupBy utility for cross-browser compatibility."
```

---

## Task 5: Replace Set Methods with Fallbacks

**Problem:** `Set.prototype.intersection/difference/union/isSubsetOf/isSupersetOf/isDisjointFrom/symmetricDifference` are only in Chrome 122+ / Edge 122+. Used extensively in `registry.ts` and `search/index.ts`.

**Files:**
- Modify: `packages/modern-cmdk/src/core/registry.ts` (6 uses)
- Modify: `packages/modern-cmdk/src/core/search/index.ts` (1 use)

### Step 1: Create set utility helpers

In `packages/modern-cmdk/src/core/utils/set-ops.ts`:

```typescript
export function setIntersection<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): Set<T> {
  const result = new Set<T>();
  for (const item of a) {
    if (b.has(item)) result.add(item);
  }
  return result;
}

export function setDifference<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): Set<T> {
  const result = new Set<T>();
  for (const item of a) {
    if (!b.has(item)) result.add(item);
  }
  return result;
}

export function setUnion<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): Set<T> {
  const result = new Set<T>(a);
  for (const item of b) result.add(item);
  return result;
}

export function setIsSubsetOf<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function setIsSupersetOf<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  return setIsSubsetOf(b, a);
}

export function setIsDisjointFrom<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  for (const item of a) {
    if (b.has(item)) return false;
  }
  return true;
}

export function setSymmetricDifference<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): Set<T> {
  const result = new Set<T>(a);
  for (const item of b) {
    if (result.has(item)) result.delete(item);
    else result.add(item);
  }
  return result;
}
```

### Step 2: Replace all Set method calls

In `registry.ts` and `search/index.ts`, replace:
- `a.intersection(b)` → `setIntersection(a, b)`
- `a.difference(b)` → `setDifference(a, b)`
- etc.

### Step 3: Run tests and commit

```bash
git add packages/modern-cmdk/src/core/utils/set-ops.ts packages/modern-cmdk/src/core/registry.ts packages/modern-cmdk/src/core/search/index.ts
git commit -m "fix: replace ES2026 Set methods with cross-browser helpers

Set.intersection/difference/union/isSubsetOf etc. are only in
Chrome 122+. Use local utility functions for all browsers."
```

---

## Task 6: Replace String.isWellFormed / toWellFormed

**Problem:** Only in Chrome 112+ / Edge 112+. Used in ID creation and keyboard parser.

**Files:**
- Modify: `packages/modern-cmdk/src/core/types.ts` (2 uses)
- Modify: `packages/modern-cmdk/src/core/keyboard/parser.ts` (1 use)
- Modify: `packages/modern-cmdk/src/core/frecency/idb-storage.ts` (1 use)

### Step 1: Create helpers

In `packages/modern-cmdk/src/core/utils/string-wellformed.ts`:

```typescript
/** Check if string contains lone surrogates */
export function isWellFormed(str: string): boolean {
  if (typeof str.isWellFormed === 'function') return str.isWellFormed();
  // Lone surrogate regex: unpaired high/low surrogates
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<!\uD800-\uDBFF)[\uDC00-\uDFFF]/.test(str);
}

/** Replace lone surrogates with U+FFFD */
export function toWellFormed(str: string): string {
  if (typeof str.toWellFormed === 'function') return str.toWellFormed();
  return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\\uD800-\\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

/** Ensure string is well-formed Unicode */
export function ensureWellFormed(str: string): string {
  return isWellFormed(str) ? str : toWellFormed(str);
}
```

### Step 2: Replace all uses

In `types.ts`:
```typescript
// Before:
return (id.isWellFormed() ? id : id.toWellFormed()) as ItemId;

// After:
return ensureWellFormed(id) as ItemId;
```

### Step 3: Run tests and commit

---

## Task 7: Fix Promise.withResolvers (codemod only)

**Problem:** Only in Chrome 114+ / Edge 114+. Used in `codemod/cli.ts` only.

**File:** `packages/modern-cmdk/src/codemod/cli.ts`

### Step 1: Replace with manual pattern

```typescript
// Before:
const { promise: done, resolve: resolveDone } = Promise.withResolvers<TransformResult[]>();

// After:
let resolveDone!: (value: TransformResult[]) => void;
const done = new Promise<TransformResult[]>((resolve) => { resolveDone = resolve; });
```

### Step 2: Run tests and commit

---

## Task 8: Fix CSS Physical Property

**Problem:** One physical CSS property breaks RTL layouts.

**File:** `packages/modern-cmdk/src/react/styles.css`

### Step 1: Replace

```css
/* Line 433 */
/* Before: */
transform-origin: left center;

/* After: */
transform-origin: inline-start center;
```

### Step 2: Commit

---

## Task 9: Commit Existing Working Changes

**Problem:** There are uncommitted changes from the previous session that fix real bugs.

**Files with working fixes:**
- `tests/e2e/accessibility.spec.ts` — color-contrast re-enabled (was incorrectly disabled)
- `tests/e2e/virtualization.spec.ts` — uses `?count=2000` instead of skipping
- `packages/modern-cmdk/src/react/hooks/use-virtualizer.ts` — Math.sumPrecise replaced with += loops
- `apps/playground/src/demos/VirtualizedDemo.tsx` — explicit `virtualize` prop, configurable count
- `apps/playground/src/styles.css` — unstaged changes

### Step 1: Review unstaged changes

Run: `git diff` to review all changes before committing.

### Step 2: Stage and commit fixes separately

```bash
# Commit 1: axe-core fix
git add tests/e2e/accessibility.spec.ts
git commit -m "fix: re-enable axe-core color-contrast checks for OKLCH

axe-core 4.11.2 supports OKLCH color contrast computation.
The disableRules(['color-contrast']) was added based on a false
assumption. Only forced-colors mode test retains the disable
(color-contrast is legitimately inapplicable there)."

# Commit 2: virtualizer fix
git add packages/modern-cmdk/src/react/hooks/use-virtualizer.ts
git commit -m "fix: replace Math.sumPrecise with += loops in virtualizer

Math.sumPrecise is Stage 2.7 and not available in any browser.
The virtualizer was crashing with TypeError on page load."

# Commit 3: demo + test infrastructure
git add apps/playground/src/demos/VirtualizedDemo.tsx tests/e2e/virtualization.spec.ts
git commit -m "fix: configurable item count for virtualization demo and tests

Add ?count= URL parameter support. Use 2000 items in tests instead
of 10K (which exceeds CI runner capacity). Add explicit virtualize
prop to bypass auto-detection race condition."
```

---

## Task 10: Remove es2026.d.ts Declarations for Replaced APIs

After Tasks 2-7 replace all the polyfill-needing APIs, clean up the custom type declarations.

**File:** `packages/modern-cmdk/src/es2026.d.ts` (or wherever ambient types are declared)

### Step 1: Find and read the es2026 declarations file

### Step 2: Remove declarations for APIs we've replaced

Remove or comment out declarations for: `Temporal`, `Promise.try`, `Map.groupBy`, `Object.groupBy`, Set methods, `String.isWellFormed`/`toWellFormed` — since we no longer call them directly.

Keep declarations for APIs that ARE available in all browsers: Iterator Helpers, `Array.toSorted`/`toSpliced`.

### Step 3: Commit

---

## Task 11: Run Full Test Suite and Fix Remaining Failures

### Step 1: Run unit tests

Run: `pnpm --filter modern-cmdk run test`
Expected: 413/413 pass

### Step 2: Run accessibility E2E

Run: `npx playwright test tests/e2e/accessibility.spec.ts --project chromium`
Expected: 29/29 pass

### Step 3: Run virtualization E2E

Run: `npx playwright test tests/e2e/virtualization.spec.ts --project chromium`
Expected: 24/24 pass (after Task 1 virtualization fix)

### Step 4: Fix any remaining failures

Address test failures one at a time, diagnosing root causes rather than skipping tests.

### Step 5: Final commit

---

## Execution Order

**Phase 1 — Commit existing fixes (Task 9):** Get the working changes committed first.

**Phase 2 — Browser compatibility (Tasks 2-7):** These are independent of each other and can be done in parallel. They replace APIs that crash in browsers.
- Task 2: Temporal → Date.now() (most critical — breaks all state mutations)
- Task 3: Promise.try → standard Promise
- Task 4: Map.groupBy → local helper
- Task 5: Set methods → local helpers
- Task 6: String.isWellFormed → local helper
- Task 7: Promise.withResolvers → manual pattern

**Phase 3 — Virtualization rework (Task 1):** Depends on the build working (Phase 2 ensures no runtime crashes).

**Phase 4 — Cleanup (Tasks 8, 10):** CSS fix and type declaration cleanup.

**Phase 5 — Verification (Task 11):** Full test suite run.

---

## Risk Assessment

| Task | Risk | Mitigation |
|------|------|------------|
| Task 1 (Virtualization) | HIGH — architectural change, touches 3 files in render path | Keep tests running after each sub-step |
| Task 2 (Temporal) | MEDIUM — type change propagates to public API | `number` is simpler than `Temporal.Instant`, no breaking change for consumers |
| Tasks 3-7 (API replacements) | LOW — mechanical replacements with identical semantics | Unit tests verify behavior preserved |
| Task 8 (CSS) | LOW — single property change | Visual inspection |
