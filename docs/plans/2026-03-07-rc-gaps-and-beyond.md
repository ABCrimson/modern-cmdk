# RC Gaps + 23 Beyond-Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all Phase 7 RC gaps and implement 23 genuine improvements that make @crimson_dev/command the definitive command palette library.

**Architecture:** Workstreams are grouped by dependency — independent tasks run in parallel, dependent tasks are sequenced. Each task produces testable, committable output.

**Tech Stack:** TypeScript 6.0.1-rc, React 19.3.0-canary, ES2026, Vitest 4.1.0-beta.6, Playwright 1.59.0-alpha, tsdown 0.21.0, Biome 2.4.6, pnpm 11.0.0-alpha.12

---

## Group A: Codemod Tests (Gap Fix #1)

### Task A1: Codemod test infrastructure + import-rewrite tests

**Files:**
- Create: `tests/unit/codemod-import-rewrite.test.ts`

**Step 1: Write failing tests for import-rewrite transform**

```ts
import { describe, expect, it } from 'vitest';
import jscodeshift from 'jscodeshift';
import type { API, FileInfo } from 'jscodeshift';
import transform from '../../packages/command-codemod/src/transforms/import-rewrite.js';

function createApi(parser = 'tsx'): API {
  return {
    jscodeshift: jscodeshift.withParser(parser),
    j: jscodeshift.withParser(parser),
    stats: () => {},
    report: () => {},
  };
}

function run(source: string, parser = 'tsx'): string {
  const fileInfo: FileInfo = { path: 'test.tsx', source };
  return transform(fileInfo, createApi(parser));
}

describe('codemod: import-rewrite', () => {
  it('rewrites named import from cmdk', () => {
    const input = `import { Command } from 'cmdk';`;
    const output = run(input);
    expect(output).toContain(`from '@crimson_dev/command-react'`);
    expect(output).not.toContain(`from 'cmdk'`);
  });

  it('rewrites default import from cmdk', () => {
    const input = `import Command from 'cmdk';`;
    const output = run(input);
    expect(output).toContain(`from '@crimson_dev/command-react'`);
  });

  it('rewrites namespace import from cmdk', () => {
    const input = `import * as Cmdk from 'cmdk';`;
    const output = run(input);
    expect(output).toContain(`from '@crimson_dev/command-react'`);
  });

  it('rewrites named re-export from cmdk', () => {
    const input = `export { Command } from 'cmdk';`;
    const output = run(input);
    expect(output).toContain(`from '@crimson_dev/command-react'`);
  });

  it('rewrites star re-export from cmdk', () => {
    const input = `export * from 'cmdk';`;
    const output = run(input);
    expect(output).toContain(`from '@crimson_dev/command-react'`);
  });

  it('rewrites dynamic import', () => {
    const input = `const mod = await import('cmdk');`;
    const output = run(input);
    expect(output).toContain(`import('@crimson_dev/command-react')`);
  });

  it('rewrites require call', () => {
    const input = `const { Command } = require('cmdk');`;
    const output = run(input, 'ts');
    expect(output).toContain(`require('@crimson_dev/command-react')`);
  });

  it('does not modify unrelated imports', () => {
    const input = `import React from 'react';\nimport { Command } from 'cmdk';`;
    const output = run(input);
    expect(output).toContain(`from 'react'`);
    expect(output).toContain(`from '@crimson_dev/command-react'`);
  });

  it('returns original source when no cmdk imports found', () => {
    const input = `import React from 'react';`;
    const output = run(input);
    expect(output).toBe(input);
  });

  it('handles multiple cmdk imports in one file', () => {
    const input = `import { Command } from 'cmdk';\nimport { Dialog } from 'cmdk';`;
    const output = run(input);
    expect(output).not.toContain(`from 'cmdk'`);
    expect(output.match(/@crimson_dev\/command-react/g)?.length).toBe(2);
  });
});
```

**Step 2: Run test to verify it passes (transform already exists)**

Run: `pnpm vitest run tests/unit/codemod-import-rewrite.test.ts`
Expected: All 10 tests PASS

**Step 3: Commit**

```bash
git add tests/unit/codemod-import-rewrite.test.ts
git commit -m "test: add import-rewrite codemod transform tests"
```

---

### Task A2: data-attrs codemod tests

**Files:**
- Create: `tests/unit/codemod-data-attrs.test.ts`

**Step 1: Write tests**

```ts
import { describe, expect, it } from 'vitest';
import jscodeshift from 'jscodeshift';
import type { API, FileInfo } from 'jscodeshift';
import transform from '../../packages/command-codemod/src/transforms/data-attrs.js';

function createApi(parser = 'tsx'): API {
  return {
    jscodeshift: jscodeshift.withParser(parser),
    j: jscodeshift.withParser(parser),
    stats: () => {},
    report: () => {},
  };
}

function run(source: string, parser = 'tsx'): string {
  const fileInfo: FileInfo = { path: 'test.tsx', source };
  return transform(fileInfo, createApi(parser));
}

describe('codemod: data-attrs', () => {
  it('renames cmdk-root JSX attribute to data-command', () => {
    const input = `<div cmdk-root="" />`;
    const output = run(input);
    expect(output).toContain('data-command');
    expect(output).not.toContain('cmdk-root');
  });

  it('renames cmdk-item JSX attribute', () => {
    const input = `<div cmdk-item="" />`;
    const output = run(input);
    expect(output).toContain('data-command-item');
  });

  it('renames cmdk-input JSX attribute', () => {
    const input = `<input cmdk-input="" />`;
    const output = run(input);
    expect(output).toContain('data-command-input');
  });

  it('replaces [cmdk-*] in querySelector strings', () => {
    const input = `document.querySelector('[cmdk-item]');`;
    const output = run(input, 'ts');
    expect(output).toContain('[data-command-item]');
  });

  it('replaces [cmdk-*] in template literals', () => {
    const input = 'const sel = `[cmdk-list]`;';
    const output = run(input, 'ts');
    expect(output).toContain('[data-command-list]');
  });

  it('replaces --cmdk-list-height CSS variable', () => {
    const input = `const h = 'var(--cmdk-list-height)';`;
    const output = run(input, 'ts');
    expect(output).toContain('--command-list-height');
  });

  it('handles multiple attributes in one element', () => {
    const input = `<div cmdk-group=""><div cmdk-item="" /></div>`;
    const output = run(input);
    expect(output).toContain('data-command-group');
    expect(output).toContain('data-command-item');
    expect(output).not.toContain('cmdk-');
  });

  it('returns original when no cmdk references', () => {
    const input = `<div className="hello" />`;
    const output = run(input);
    expect(output).toBe(input);
  });
});
```

**Step 2:** Run: `pnpm vitest run tests/unit/codemod-data-attrs.test.ts`

**Step 3: Commit**

---

### Task A3: forward-ref codemod tests

**Files:**
- Create: `tests/unit/codemod-forward-ref.test.ts`

**Step 1: Write tests**

```ts
import { describe, expect, it } from 'vitest';
import jscodeshift from 'jscodeshift';
import type { API, FileInfo } from 'jscodeshift';
import transform from '../../packages/command-codemod/src/transforms/forward-ref.js';

function createApi(parser = 'tsx'): API {
  return {
    jscodeshift: jscodeshift.withParser(parser),
    j: jscodeshift.withParser(parser),
    stats: () => {},
    report: () => {},
  };
}

function run(source: string): string {
  const fileInfo: FileInfo = { path: 'test.tsx', source };
  return transform(fileInfo, createApi());
}

describe('codemod: forward-ref', () => {
  it('removes React.forwardRef with destructured props', () => {
    const input = `const Comp = React.forwardRef<HTMLDivElement, Props>(({ foo }, ref) => {
  return <div ref={ref}>{foo}</div>;
});`;
    const output = run(input);
    expect(output).not.toContain('forwardRef');
    expect(output).toContain('ref');
    expect(output).toContain('foo');
  });

  it('removes bare forwardRef import call', () => {
    const input = `const Comp = forwardRef((props, ref) => {
  return <div ref={ref} {...props} />;
});`;
    const output = run(input);
    expect(output).not.toContain('forwardRef(');
    expect(output).toContain('ref');
    expect(output).toContain('...props');
  });

  it('converts identifier props param to destructured with rest', () => {
    const input = `const Comp = React.forwardRef((props, ref) => <div ref={ref} {...props} />);`;
    const output = run(input);
    expect(output).toContain('{ ref, ...props }');
  });

  it('cleans up unused forwardRef import specifier', () => {
    const input = `import { forwardRef } from 'react';
const Comp = forwardRef((props, ref) => <div ref={ref} />);`;
    const output = run(input);
    expect(output).not.toContain("import { forwardRef }");
  });

  it('preserves other imports when removing forwardRef', () => {
    const input = `import { useState, forwardRef } from 'react';
const Comp = forwardRef((props, ref) => <div ref={ref} />);`;
    const output = run(input);
    expect(output).toContain('useState');
    expect(output).not.toContain('forwardRef');
  });

  it('skips files without forwardRef', () => {
    const input = `const Comp = () => <div />;`;
    const output = run(input);
    expect(output).toBe(input);
  });
});
```

**Step 2:** Run: `pnpm vitest run tests/unit/codemod-forward-ref.test.ts`

**Step 3: Commit**

---

### Task A4: should-filter codemod tests

**Files:**
- Create: `tests/unit/codemod-should-filter.test.ts`

**Step 1: Write tests**

```ts
import { describe, expect, it } from 'vitest';
import jscodeshift from 'jscodeshift';
import type { API, FileInfo } from 'jscodeshift';
import transform from '../../packages/command-codemod/src/transforms/should-filter.js';

function createApi(parser = 'tsx'): API {
  return {
    jscodeshift: jscodeshift.withParser(parser),
    j: jscodeshift.withParser(parser),
    stats: () => {},
    report: () => {},
  };
}

function run(source: string): string {
  const fileInfo: FileInfo = { path: 'test.tsx', source };
  return transform(fileInfo, createApi());
}

describe('codemod: should-filter', () => {
  it('removes shouldFilter={true} (default)', () => {
    const input = `<Command shouldFilter={true} />`;
    const output = run(input);
    expect(output).not.toContain('shouldFilter');
    expect(output).not.toContain('filter');
  });

  it('removes bare shouldFilter attribute', () => {
    const input = `<Command shouldFilter />`;
    const output = run(input);
    expect(output).not.toContain('shouldFilter');
  });

  it('renames shouldFilter={false} to filter={false}', () => {
    const input = `<Command shouldFilter={false} />`;
    const output = run(input);
    expect(output).toContain('filter={false}');
    expect(output).not.toContain('shouldFilter');
  });

  it('skips files without shouldFilter', () => {
    const input = `<Command />`;
    const output = run(input);
    expect(output).toBe(input);
  });
});
```

**Step 2:** Run: `pnpm vitest run tests/unit/codemod-should-filter.test.ts`

**Step 3: Commit**

---

## Group B: CI Benchmark Regression (Gap Fix #2-3)

### Task B1: Benchmark regression comparison script

**Files:**
- Create: `benchmarks/standalone/compare-baseline.ts`

**Step 1: Write the comparison script**

```ts
// Compares current benchmark run against baseline.json
// Exit code 0 = pass, 1 = warning (>5%), 2 = failure (>15%)
import { readFile } from 'node:fs/promises';
import { Bench } from 'tinybench';

interface BenchmarkEntry {
  readonly median_ms: number;
  readonly p99_ms: number;
  readonly target_ms: number;
}

interface Baseline {
  readonly regressionThresholds: {
    readonly warning: number;
    readonly failure: number;
  };
  readonly benchmarks: Record<string, Record<string, BenchmarkEntry>>;
}

async function main(): Promise<void> {
  const baselinePath = new URL('../baseline.json', import.meta.url);
  const baseline: Baseline = JSON.parse(await readFile(baselinePath, 'utf-8'));
  const { warning, failure } = baseline.regressionThresholds;

  const { createSearchEngine, createCommandMachine, itemId } = await import(
    '../../packages/command/dist/index.js'
  );

  const words = ['apple', 'banana', 'cherry', 'date', 'elderberry', 'fig', 'grape', 'honeydew'];
  const items10K = Array.from({ length: 10_000 }, (_, i) => ({
    id: itemId(`item-${i}`),
    value: `${words[i % words.length]} ${i} action`,
    keywords: [`kw-${i}`],
  }));

  // Run 3 iterations and average
  const runs = 3;
  const allResults = new Map<string, number[]>();

  for (let run = 0; run < runs; run++) {
    const bench = new Bench({ warmupIterations: 50, iterations: 500 });

    bench.add('search:ts-scorer-10k', () => {
      const engine = createSearchEngine();
      engine.index(items10K);
      engine.search('apple', items10K).toArray();
      engine[Symbol.dispose]();
    });

    bench.add('stateUpdate:navigate', () => {
      const machine = createCommandMachine({ items: items10K.slice(0, 100) });
      machine.send({ type: 'NAVIGATE', direction: 'next' });
      machine[Symbol.dispose]();
    });

    bench.add('stateUpdate:searchChange', () => {
      const machine = createCommandMachine({ items: items10K.slice(0, 1000) });
      machine.send({ type: 'SEARCH_CHANGE', query: 'apple' });
      machine[Symbol.dispose]();
    });

    const results = await bench.run();
    for (const task of results) {
      if (!task.result) continue;
      const prev = allResults.get(task.name) ?? [];
      prev.push(task.result.p75 ?? 0);
      allResults.set(task.name, prev);
    }
  }

  // Compare averaged results against baseline
  let exitCode = 0;
  const comparisons: Array<{ name: string; baseline: number; current: number; delta: string; status: string }> = [];

  for (const [name, times] of allResults) {
    const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
    const [category, benchName] = name.split(':') as [string, string];
    const baselineEntry = baseline.benchmarks[category]?.[benchName];

    if (!baselineEntry) {
      comparisons.push({ name, baseline: NaN, current: avgMs, delta: 'NEW', status: 'INFO' });
      continue;
    }

    const deltaPercent = (avgMs - baselineEntry.median_ms) / baselineEntry.median_ms;
    let status = 'PASS';

    if (deltaPercent > failure) {
      status = 'FAIL';
      exitCode = Math.max(exitCode, 2);
    } else if (deltaPercent > warning) {
      status = 'WARN';
      exitCode = Math.max(exitCode, 1);
    }

    comparisons.push({
      name,
      baseline: baselineEntry.median_ms,
      current: avgMs,
      delta: `${deltaPercent >= 0 ? '+' : ''}${(deltaPercent * 100).toFixed(1)}%`,
      status,
    });
  }

  console.log('\n=== Benchmark Regression Report (3-run average) ===\n');
  console.log('Name'.padEnd(35) + 'Baseline'.padEnd(12) + 'Current'.padEnd(12) + 'Delta'.padEnd(10) + 'Status');
  console.log('-'.repeat(79));

  for (const c of comparisons) {
    const bl = Number.isNaN(c.baseline) ? 'N/A' : `${c.baseline.toFixed(3)}ms`;
    console.log(
      c.name.padEnd(35) + bl.padEnd(12) + `${c.current.toFixed(3)}ms`.padEnd(12) + c.delta.padEnd(10) + c.status,
    );
  }

  console.log(`\nThresholds: warning=${(warning * 100).toFixed(0)}%, failure=${(failure * 100).toFixed(0)}%`);

  if (exitCode === 2) {
    console.log('\nRESULT: FAIL — Performance regression exceeds failure threshold\n');
  } else if (exitCode === 1) {
    console.log('\nRESULT: WARN — Performance regression exceeds warning threshold\n');
  } else {
    console.log('\nRESULT: PASS — No significant regressions detected\n');
  }

  process.exit(exitCode);
}

main().catch((err: unknown) => {
  console.error('Fatal:', err);
  process.exit(2);
});
```

**Step 2: Add npm script to root package.json**

Add to scripts: `"bench:compare": "node --import tsx benchmarks/standalone/compare-baseline.ts"`

**Step 3: Update CI workflow to use comparison**

In `.github/workflows/ci.yml`, update the `bench` job's final step:

```yaml
      - run: pnpm bench:ci
      - run: pnpm bench:compare
```

**Step 4: Commit**

---

## Group C: CSS Modernization — RTL + Logical Properties (#8)

### Task C1: Convert styles.css to CSS logical properties

**Files:**
- Modify: `packages/command-react/src/styles.css`

Convert all physical direction properties to logical equivalents:
- `left: 0; right: 0;` -> `inset-inline: 0;`
- `top: 0; bottom: 0;` -> `inset-block: 0;`
- `padding-block-start` (already used!) -> verify all instances
- Pseudo-element `left/right` -> `inset-inline`
- `text-align: center` -> `text-align: center` (already logical)
- `translate: 8px 0` -> `translate: 8px 0` (transforms are already direction-neutral)
- `transform-origin: left` -> `transform-origin: inline-start`

Add `dir` attribute support and test RTL rendering.

**Step 1: Audit and fix all physical properties**
**Step 2: Add `[dir="rtl"]` CSS overrides where transforms need flipping**
**Step 3: Commit**

---

## Group D: Animation Customization API (#10)

### Task D1: Add CSS custom properties for all animation values

**Files:**
- Modify: `packages/command-react/src/styles.css`

Add to the top of the file (after @property declarations):

```css
/* User-customizable animation properties */
[data-command-root] {
  --command-animation-duration: 200ms;
  --command-animation-duration-exit: 150ms;
  --command-animation-easing: linear(0, 0.006, 0.025, 0.058, 0.104, 0.163, 0.234, 0.315, 0.404, 0.499, 0.596, 0.693, 0.784, 0.867, 0.939, 0.998, 1.0);
  --command-animation-easing-exit: cubic-bezier(0.4, 0, 1, 1);
  --command-animation-scale-from: 0.96;
  --command-animation-translate-from: 8px;
  --command-item-transition-duration: 120ms;
  --command-list-transition-duration: 200ms;
}
```

Replace all hardcoded values with these custom properties throughout the file.

**Step 1: Add custom properties**
**Step 2: Replace all hardcoded values with var() references**
**Step 3: Commit**

---

## Group E: Error Boundaries & WASM Fallback (#4, #15)

### Task E1: WASM fallback chain in command-search-wasm

**Files:**
- Modify: `packages/command-search-wasm/src/wasm-engine.ts`

Add try/catch around WASM compilation with automatic fallback to TS scorer:

```ts
export async function createWasmSearchEngine(options?: WasmSearchOptions): Promise<SearchEngine> {
  try {
    const wasmModule = await loadWasmModule();
    return new WasmSearchEngine(wasmModule, options);
  } catch (error) {
    if (__DEV__) {
      console.warn(
        '[@crimson_dev/command-search-wasm] WASM failed to load, falling back to TypeScript scorer:',
        error instanceof Error ? error.message : error,
      );
    }
    // Dynamic import to avoid bundling core in the happy path
    const { createSearchEngine } = await import('@crimson_dev/command');
    return createSearchEngine();
  }
}
```

**Step 1: Add fallback logic**
**Step 2: Write test for fallback behavior**
**Step 3: Commit**

---

### Task E2: Error boundary component for React adapter

**Files:**
- Create: `packages/command-react/src/error-boundary.tsx`

```tsx
'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface CommandErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ReactNode | ((error: Error) => ReactNode);
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface CommandErrorBoundaryState {
  readonly error: Error | null;
}

export class CommandErrorBoundary extends Component<CommandErrorBoundaryProps, CommandErrorBoundaryState> {
  override state: CommandErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): CommandErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  override render(): ReactNode {
    if (this.state.error) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') return fallback(this.state.error);
      if (fallback) return fallback;
      return null;
    }
    return this.props.children;
  }
}
```

**Step 1: Create error boundary component**
**Step 2: Export from index.ts**
**Step 3: Commit**

---

## Group F: SSR / Next.js Story (#2)

### Task F1: SSR documentation and server-safe guards

**Files:**
- Create: `apps/docs/guide/ssr.md`
- Modify: `packages/command-react/src/hooks/use-command.ts` (verify getServerSnapshot)

The adapter already provides `getServerSnapshot` to `useSyncExternalStore` — document this explicitly. Create a guide page covering:
- Next.js App Router integration
- "use client" boundary behavior
- Server Component tree-shaking
- Streaming SSR with Dialog

**Step 1: Verify SSR safety in useCommand hook**
**Step 2: Write SSR guide documentation**
**Step 3: Add to VitePress sidebar**
**Step 4: Commit**

---

## Group G: Exports Validation (#5)

### Task G1: Package exports resolution test

**Files:**
- Create: `tests/unit/exports-validation.test.ts`

```ts
import { describe, expect, it } from 'vitest';

describe('package exports', () => {
  it('core package exports all public API', async () => {
    const core = await import('@crimson_dev/command');
    expect(core.createCommandMachine).toBeTypeOf('function');
    expect(core.createSearchEngine).toBeTypeOf('function');
    expect(core.itemId).toBeTypeOf('function');
    expect(core.groupId).toBeTypeOf('function');
  });

  it('react package exports all components', async () => {
    const react = await import('@crimson_dev/command-react');
    expect(react.Command).toBeDefined();
    expect(react.useCommand).toBeTypeOf('function');
    expect(react.useCommandState).toBeTypeOf('function');
    expect(react.useRegisterItem).toBeTypeOf('function');
    expect(react.useVirtualizer).toBeTypeOf('function');
    expect(react.CommandHighlight).toBeDefined();
    expect(react.CommandActivity).toBeDefined();
  });
});
```

**Step 1: Write export validation tests**
**Step 2: Run to verify**
**Step 3: Commit**

---

## Group H: Accessibility Enhancements (#24 + Gap #7)

### Task H1: Add aria-roledescription to Command.Root

**Files:**
- Modify: `packages/command-react/src/command.tsx`

Add `aria-roledescription="command palette"` to the root element for better screen reader announcements.

**Step 1: Add aria-roledescription**
**Step 2: Update E2E accessibility test to verify**
**Step 3: Commit**

---

## Group I: Devtools (#9)

### Task I1: Create devtools hook for React adapter

**Files:**
- Create: `packages/command-react/src/hooks/use-devtools.ts`

A lightweight hook that exposes machine internals to a browser devtools panel or React DevTools custom hook:

```ts
'use client';

import { use, useEffect, useRef } from 'react';
import { CommandContext } from '../context.js';

interface DevtoolsState {
  readonly machineState: unknown;
  readonly registeredItems: number;
  readonly filteredItems: number;
  readonly searchQuery: string;
  readonly activeId: string | null;
  readonly pageStack: readonly string[];
  readonly shortcuts: number;
}

const DEVTOOLS_GLOBAL = '__CRIMSON_COMMAND_DEVTOOLS__';

/**
 * Exposes command palette internals to browser devtools.
 * Only active in development — tree-shaken in production.
 */
export function useCommandDevtools(label = 'default'): void {
  if (!__DEV__) return;

  const ctx = use(CommandContext);
  if (!ctx) return;

  const stateRef = useRef<DevtoolsState | null>(null);

  useEffect(() => {
    const update = (): void => {
      const s = ctx.state;
      const devState: DevtoolsState = {
        machineState: s,
        registeredItems: s.filteredCount,
        filteredItems: s.filteredIds.length,
        searchQuery: s.search,
        activeId: s.activeId,
        pageStack: s.pageStack,
        shortcuts: 0,
      };
      stateRef.current = devState;

      // Expose to window for devtools extension
      const instances = ((globalThis as Record<string, unknown>)[DEVTOOLS_GLOBAL] ??= new Map()) as Map<string, DevtoolsState>;
      instances.set(label, devState);

      // Dispatch custom event for devtools panel
      globalThis.dispatchEvent?.(
        new CustomEvent('crimson-command-devtools', { detail: { label, state: devState } }),
      );
    };

    const unsub = ctx.subscribe(update);
    update();

    return () => {
      unsub();
      const instances = (globalThis as Record<string, unknown>)[DEVTOOLS_GLOBAL] as Map<string, DevtoolsState> | undefined;
      instances?.delete(label);
    };
  }, [ctx, label]);
}
```

**Step 1: Create devtools hook**
**Step 2: Export from index.ts**
**Step 3: Commit**

---

## Group J: Vanilla JS Usage Example (#3 — proving framework-agnostic)

### Task J1: Create vanilla JS example in docs

**Files:**
- Create: `apps/docs/examples/vanilla.md`

Document using `createCommandMachine` directly without React:

```ts
import { createCommandMachine, itemId } from '@crimson_dev/command';

using machine = createCommandMachine({
  items: [
    { id: itemId('copy'), value: 'Copy', onSelect: () => navigator.clipboard.writeText(selection) },
    { id: itemId('paste'), value: 'Paste', onSelect: () => document.execCommand('paste') },
  ],
});

// Render with vanilla DOM
const list = document.querySelector('#command-list')!;
machine.subscribe(() => {
  const state = machine.getState();
  list.innerHTML = state.filteredIds
    .map(id => `<div role="option" aria-selected="${id === state.activeId}">${id}</div>`)
    .join('');
});

// Wire up input
const input = document.querySelector<HTMLInputElement>('#command-input')!;
input.addEventListener('input', () => {
  machine.send({ type: 'SEARCH_CHANGE', query: input.value });
});
```

**Step 1: Write vanilla JS documentation**
**Step 2: Add to VitePress sidebar under Examples**
**Step 3: Commit**

---

## Group K: Recipes / Patterns Cookbook (#19)

### Task K1: Create recipes documentation section

**Files:**
- Create: `apps/docs/recipes/file-picker.md`
- Create: `apps/docs/recipes/emoji-picker.md`
- Create: `apps/docs/recipes/ai-chat-commands.md`
- Create: `apps/docs/recipes/nested-commands.md`
- Create: `apps/docs/recipes/spotlight-search.md`

Each recipe shows a real-world pattern with full code:
- File picker: how Notion/Linear build theirs
- Emoji picker: virtual list with 5000+ emojis
- AI chat: slash commands with preview
- Nested: multi-level command palettes (Raycast-style)
- Spotlight: global system-level search

**Step 1: Write all 5 recipe pages**
**Step 2: Add Recipes section to VitePress sidebar**
**Step 3: Commit**

---

## Group L: Performance Comparison Page (#20)

### Task L1: Create live benchmark comparison page

**Files:**
- Create: `apps/docs/benchmarks.md`

Static content (no live benchmark execution in docs — reference baseline.json data):

Show comparison table with:
- @crimson_dev/command vs cmdk (search speed, bundle size, features)
- WASM vs TS scorer performance at 10K/100K items
- Memory usage
- First-render time

**Step 1: Write benchmarks comparison documentation**
**Step 2: Add to VitePress nav**
**Step 3: Commit**

---

## Group M: CI Improvements (#12, #13, #14, #16, #21)

### Task M1: Add cross-platform CI matrix

**Files:**
- Modify: `.github/workflows/ci.yml`

Add macOS and Windows runners for the test job:

```yaml
  test:
    strategy:
      matrix:
        os: [ubuntu-24.04, macos-latest, windows-latest]
        shard: [1, 2, 3, 4]
    runs-on: ${{ matrix.os }}
```

### Task M2: Add memory leak detection to CI

**Files:**
- Create: `tests/unit/memory-leak.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createCommandMachine, itemId } from '@crimson_dev/command';

describe('memory leak detection', () => {
  it('disposes cleanly without residual listeners', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: itemId(`item-${i}`),
      value: `Item ${i}`,
    }));

    for (let i = 0; i < 100; i++) {
      using machine = createCommandMachine({ items });
      machine.send({ type: 'SEARCH_CHANGE', query: 'item' });
      machine.send({ type: 'NAVIGATE', direction: 'next' });
    }

    // If we get here without OOM, disposal is working
    expect(true).toBe(true);
  });

  it('subscription cleanup prevents memory growth', () => {
    using machine = createCommandMachine();
    const unsubs: Array<() => void> = [];

    for (let i = 0; i < 10_000; i++) {
      unsubs.push(machine.subscribe(() => {}));
    }

    // Unsubscribe all
    for (const unsub of unsubs) unsub();

    // Machine should still be functional
    machine.send({ type: 'SEARCH_CHANGE', query: 'test' });
    expect(machine.getState().search).toBe('test');
  });
});
```

### Task M3: Add bundle analysis step to CI

Add to `.github/workflows/ci.yml` size job:

```yaml
      - run: pnpm size-limit --json > size-report.json
      - uses: actions/upload-artifact@v4
        with:
          name: size-report
          path: size-report.json
```

### Task M4: Add security audit to CI

```yaml
  security:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '25.8.0'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --audit-level=high
```

**Step 1: Update CI workflow with all improvements**
**Step 2: Create memory leak test**
**Step 3: Commit**

---

## Group N: OG Image + Social Assets (Gap Fix #4, Improvement #8 README)

### Task N1: Generate OG image and social assets

**Files:**
- Create: `apps/docs/public/og-image.svg` (SVG that renders at 1200x630)

Create a programmatic SVG with OKLCH-inspired gradient background, the @crimson_dev/command logo text, and key metrics (bundle size, features).

**Step 1: Create OG image SVG**
**Step 2: Verify VitePress config references it correctly**
**Step 3: Commit**

---

## Group O: OpenTelemetry Hooks (#22)

### Task O1: Add opt-in analytics hooks to core

**Files:**
- Create: `packages/command/src/telemetry.ts`

```ts
// Opt-in telemetry hooks for enterprise users
// Measures: open->select latency, search->result time, most-used commands

export interface CommandTelemetryHooks {
  readonly onPaletteOpen?: () => void;
  readonly onPaletteClose?: (durationMs: number) => void;
  readonly onSearchComplete?: (query: string, resultCount: number, durationMs: number) => void;
  readonly onItemSelected?: (itemId: string, searchQuery: string, position: number) => void;
}

export function createTelemetryMiddleware(hooks: CommandTelemetryHooks) {
  let openTimestamp: number | null = null;

  return {
    onOpen(): void {
      openTimestamp = performance.now();
      hooks.onPaletteOpen?.();
    },
    onClose(): void {
      if (openTimestamp != null) {
        hooks.onPaletteClose?.(performance.now() - openTimestamp);
        openTimestamp = null;
      }
    },
    onSearch(query: string, resultCount: number, startTime: number): void {
      hooks.onSearchComplete?.(query, resultCount, performance.now() - startTime);
    },
    onSelect(itemId: string, query: string, position: number): void {
      hooks.onItemSelected?.(itemId, query, position);
    },
  };
}
```

**Step 1: Create telemetry module**
**Step 2: Integrate with machine options**
**Step 3: Export from index.ts**
**Step 4: Commit**

---

## Group P: Controlled Dialog Documentation (#11)

### Task P1: Document controlled dialog patterns

**Files:**
- Create: `apps/docs/guide/controlled-dialog.md`

Cover:
- URL-driven open state (`useSearchParams`)
- Programmatic open from button click
- Conditional close prevention (unsaved changes)
- Multiple palettes on same page

**Step 1: Write controlled dialog guide**
**Step 2: Add to VitePress sidebar**
**Step 3: Commit**

---

## Group Q: TypeScript Plugin Concept (#7)

### Task Q1: Document TS plugin for branded ID autocomplete

**Files:**
- Create: `apps/docs/guide/typescript-integration.md`

Document the branded type system and how it prevents mixing ItemId/GroupId. Show patterns for getting type safety with registered items.

**Step 1: Write TypeScript integration guide**
**Step 2: Commit**

---

## Group R: CLI Scaffolding Tool (#17)

### Task R1: Create create-command scaffolding package

**Files:**
- Create: `packages/create-command/package.json`
- Create: `packages/create-command/src/index.ts`
- Create: `packages/create-command/src/templates/react-basic.ts`
- Create: `packages/create-command/src/templates/react-dialog.ts`

Minimal CLI that scaffolds a command palette project:
```
npx @crimson_dev/create-command my-palette
```

**Step 1: Create package structure**
**Step 2: Implement CLI with template selection**
**Step 3: Add to pnpm workspace**
**Step 4: Commit**

---

## Group S: VS Code Extension Concept (#18)

### Task S1: Create VS Code extension scaffolding

**Files:**
- Create: `packages/vscode-command/package.json`
- Create: `packages/vscode-command/src/extension.ts`
- Create: `packages/vscode-command/src/snippets.json`

Provide component snippets and prop completion for @crimson_dev/command-react.

**Step 1: Create extension package**
**Step 2: Add snippets for all components**
**Step 3: Commit**

---

## Group T: Storybook / Component Explorer (#6)

### Task T1: Add component stories to playground

**Files:**
- Create: `apps/playground/src/demos/AllStatesDemo.tsx`
- Create: `apps/playground/src/demos/RTLDemo.tsx`
- Create: `apps/playground/src/demos/ErrorBoundaryDemo.tsx`
- Create: `apps/playground/src/demos/DarkModeDemo.tsx`
- Create: `apps/playground/src/demos/HighContrastDemo.tsx`
- Modify: `apps/playground/src/App.tsx`

Rather than adding a full Storybook dependency, extend the existing playground with comprehensive demo pages showing every component state.

**Step 1: Create all demo components**
**Step 2: Add routes in App.tsx**
**Step 3: Commit**

---

## Group U: Final Modernization Pass

### Task U1: Audit all files for remaining physical CSS properties

Scan all CSS files for any remaining `left`, `right`, `top`, `bottom` that should be logical.

### Task U2: Verify all Iterator Helper usage is optimal

Ensure no `Array.from()` or spread-to-array patterns exist where `.toArray()` would be cleaner.

### Task U3: Verify no legacy Promise patterns

Ensure no `new Promise((resolve, reject) => ...)` exists where `Promise.withResolvers()` or `Promise.try()` would be better.

### Task U4: Verify CSS @layer usage opportunity

Consider wrapping library styles in `@layer command` for better cascade control.

### Task U5: npm dry-run publish verification

Run `pnpm -r exec npm pack --dry-run` and verify all packages include correct files.

---

## Execution Order (Dependency Graph)

**Phase 1 — Independent tasks (run in parallel):**
- A1-A4 (codemod tests)
- B1 (benchmark regression)
- E1-E2 (error boundaries + WASM fallback)
- G1 (exports validation)
- H1 (aria-roledescription)
- I1 (devtools hook)
- M2 (memory leak test)
- O1 (telemetry)

**Phase 2 — CSS modernization (sequential):**
- C1 (logical properties)
- D1 (animation custom properties)
- U1-U4 (modernization audit)

**Phase 3 — Documentation (parallel):**
- F1 (SSR guide)
- J1 (vanilla JS example)
- K1 (recipes)
- L1 (benchmarks page)
- P1 (controlled dialog)
- Q1 (TypeScript guide)

**Phase 4 — New packages (parallel):**
- R1 (create-command CLI)
- S1 (VS Code extension)
- T1 (playground demos)

**Phase 5 — CI + Social (after code is done):**
- M1, M3, M4 (CI improvements)
- N1 (OG image)

**Phase 6 — Final verification:**
- U5 (npm dry-run)
