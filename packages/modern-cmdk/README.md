<p align="center">
  <img src="https://raw.githubusercontent.com/ABCrimson/modern-cmdk/main/apps/docs/public/og-image.svg" alt="modern-cmdk" width="640" />
</p>

<p align="center">
  <strong>modern-cmdk</strong><br/>
  The definitive command palette engine for the modern web.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/modern-cmdk"><img alt="npm version" src="https://img.shields.io/npm/v/modern-cmdk?style=flat-square&color=dc2626&labelColor=0a0e27"/></a>
  <a href="https://github.com/ABCrimson/modern-cmdk/blob/main/package.json"><img alt="core size budget" src="https://img.shields.io/badge/core-%3C%206.5%20kB%20gzip-dc2626?style=flat-square&labelColor=0a0e27"/></a>
  <a href="https://github.com/ABCrimson/modern-cmdk/blob/main/package.json"><img alt="react size budget" src="https://img.shields.io/badge/react-%3C%2012%20kB%20gzip-dc2626?style=flat-square&labelColor=0a0e27"/></a>
  <a href="https://github.com/ABCrimson/modern-cmdk/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/ABCrimson/modern-cmdk/ci.yml?style=flat-square&color=dc2626&labelColor=0a0e27&label=CI"/></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7-dc2626?style=flat-square&labelColor=0a0e27"/></a>
  <a href="https://react.dev/"><img alt="React" src="https://img.shields.io/badge/React-19-dc2626?style=flat-square&labelColor=0a0e27"/></a>
  <a href="https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE"><img alt="MIT License" src="https://img.shields.io/npm/l/modern-cmdk?style=flat-square&color=dc2626&labelColor=0a0e27"/></a>
</p>

<p align="center">
  <a href="https://abcrimson.github.io/modern-cmdk/">Documentation</a> &middot;
  <a href="https://abcrimson.github.io/modern-cmdk/guide/getting-started.html">Getting Started</a> &middot;
  <a href="https://abcrimson.github.io/modern-cmdk/api/command.html">API Reference</a> &middot;
  <a href="https://abcrimson.github.io/modern-cmdk/examples/basic.html">Examples</a>
</p>

---

## Install

```bash
npm install modern-cmdk
```

> [!NOTE]
> `modern-cmdk` is ESM-only and declares `engines.node >= 26.4.0`. The optional WASM search
> engine (`modern-cmdk-search-wasm`) is a private, unpublished workspace package (0.9.0) that you
> build from source; it is not on npm.

The package exports three entry points:

```ts
import { createCommandMachine } from 'modern-cmdk';       // Core engine (no React)
import { Command } from 'modern-cmdk/react';               // React 19 components
import 'modern-cmdk/styles.css';                            // Default styles
```

React is an **optional** peer dependency — use the core engine standalone in any framework, or pair it with the React adapter. `modern-cmdk/react` imports `react`, `react-dom` and `radix-ui`, which are optional peers that npm and pnpm do not install for you, so add them yourself (the Quick Start below needs all three):

```bash
npm install modern-cmdk react react-dom radix-ui
```

---

## Quick Start

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import 'modern-cmdk/styles.css';
import { useEffect, useState } from 'react';

function CommandPalette() {
  const [open, setOpen] = useState(false);

  // Nothing opens the dialog for you: toggle it from a Mod+K listener (Cmd+K / Ctrl+K).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command Menu">
      <Command.Input placeholder="Type a command..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>

        <Command.Group heading="Actions">
          <Command.Item value="copy" onSelect={() => setOpen(false)}>
            Copy to Clipboard
            <Command.Shortcut shortcut="Mod+C" />
          </Command.Item>
          <Command.Item value="paste" onSelect={() => setOpen(false)}>
            Paste
            <Command.Shortcut shortcut="Mod+V" />
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Navigation">
          <Command.Item value="settings" onSelect={() => setOpen(false)}>
            Settings
            <Command.Badge>New</Command.Badge>
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
```

`<Command label="Command menu">` takes the same children inline, with no dialog; `<Command.Highlight text={...} ranges={...} />` renders match highlighting from scorer ranges.

Or scaffold a new project:

```bash
npm create modern-cmdk@latest my-palette -- --template=react-basic
```

---

## Why modern-cmdk?

A ground-up rewrite of `cmdk` for **React 19** and **TypeScript 7**, written in modern ECMAScript. Framework-agnostic core. Zero compromise on performance, accessibility, or developer experience.

| | cmdk | modern-cmdk |
|---|---|---|
| **Architecture** | React-only, tightly coupled | Framework-agnostic core + thin adapters |
| **React** | 18 / 19 | 19 (`use()`, `useOptimistic`, `useId`, `ref` as prop) |
| **Search** | Fuzzy (`command-score`) | Fuzzy scoring with match ranges; an experimental WASM engine (unpublished, does not work yet) |
| **Ranking** | Static order | Frecency: frequency x bucketed recency weights |
| **Virtualization** | None | Automatic variable-height, `content-visibility: auto` |
| **Animations** | CSS transitions | GPU-composited: `@starting-style`, `scroll-timeline`, spring easing |
| **Keyboard** | External | Built-in registry, `Mod` key, conflict detection |
| **Accessibility** | Partial ARIA | Full WAI-ARIA combobox, `forced-colors`, `prefers-contrast` |
| **Bundle** | not compared | Core ~6.4 kB, React ~9.8 kB gzip (budgets: < 6.5 kB, < 12 kB) |
| **TypeScript** | 4.x/5.x | 7, isolated declarations, branded types |
| **Cleanup** | Manual | `using`/`await using` (Explicit Resource Management) |
| **Error handling** | None | `CommandErrorBoundary` with fallback UI |
| **DevTools** | None | Built-in devtools hook for browser inspection |

---

## Features

- **Framework-agnostic core** -- Pure TypeScript state machine. No React. No hard DOM dependency; DOM APIs are feature-detected and SSR-safe. Portable to any runtime. The sole runtime dependency (`idb-keyval`) is lazy-loaded only if you opt into IndexedDB frecency persistence.
- **React 19 adapter** -- a `Command` root with 14 compound sub-components (`Command.Input` through `Command.Activity`). `useSyncExternalStore`, `useTransition`, `useOptimistic`, `use()` for Suspense. React Compiler compatible.
- **Automatic virtualization** -- Variable-height virtual scrolling turns on when more than 100 items match and off again at 50 or fewer (fixed thresholds; force it with `<Command.List virtualize>`). Off-screen items use `content-visibility: auto`. The `virtualizeThreshold` option is accepted but not read yet.
- **Fuzzy search** -- Built-in TypeScript scorer with incremental filtering. Experimental Rust/WASM engine _(private, not published to npm)_; it does not work yet and always falls back to the TS scorer.
- **Frecency ranking** -- Frequency x recency, weighted by hour/day/week/month buckets. Pluggable persistence (memory or IndexedDB).
- **Keyboard shortcuts** -- Built-in registry with cross-platform `Mod` key, and conflict detection. Cross-browser helper functions for grouping and set operations.
- **Full accessibility** -- WAI-ARIA combobox pattern, `aria-live` announcements, `forced-colors`, `prefers-contrast`, `prefers-reduced-motion`.
- **GPU-composited animations** -- `@starting-style` entry, `scroll-timeline` progress, spring `linear()` easing. All customizable via CSS custom properties.
- **Error boundary** -- `CommandErrorBoundary` with static or render-function fallback.
- **DevTools** -- `useCommandDevtools()` exposes machine state via `CustomEvent` for browser inspection.
- **Telemetry middleware** -- Pluggable hooks for palette open/close, search, and item selection analytics.
- **ESM-only** -- Zero CommonJS. Tree-shakeable -- the framework-agnostic core is side-effect-free; only the React entry and `styles.css` are flagged in `sideEffects`. Isolated declarations.

---

## React Components

```tsx
<Command>                {/* Root -- state machine provider */}
  <Command.Input />      {/* Search input */}
  <Command.List>         {/* Scrollable list with auto-virtualization */}
    <Command.Empty />    {/* Shown when filteredCount === 0 */}
    <Command.Loading />  {/* renders when the `loading` prop is true (or while the active-item transition is pending) */}
    <Command.Group>      {/* Labeled group of items */}
      <Command.Item>     {/* Selectable item */}
        <Command.Highlight text={label} ranges={ranges} />   {/* Fuzzy match highlighting */}
        <Command.Badge />       {/* Status badge */}
        <Command.Shortcut />    {/* Keyboard shortcut display */}
      </Command.Item>
    </Command.Group>
    <Command.Separator />
  </Command.List>
</Command>

<Command.Dialog />       {/* Radix Dialog + overlay + portal */}
<Command.Page />         {/* Nested page navigation */}
<Command.AsyncItems />   {/* Suspense-powered async loading */}
```

---

## Core API (No React)

Use the core engine standalone in any framework or runtime:

```ts
import { createCommandMachine, itemId } from 'modern-cmdk';

using machine = createCommandMachine({
  items: [
    { id: itemId('copy'), value: 'Copy', shortcut: 'Mod+C', onSelect: () => copy() },
    { id: itemId('paste'), value: 'Paste', shortcut: 'Mod+V', onSelect: () => paste() },
  ],
  frecency: { enabled: true },
  loop: true,
});

machine.send({ type: 'SEARCH_CHANGE', query: 'cop' });
machine.send({ type: 'NAVIGATE', direction: 'next' });
machine.send({ type: 'ITEM_SELECT', id: itemId('copy') });

machine.subscribe(() => {
  console.log(machine.getState());
});
// Automatic cleanup via `using` -- no manual dispose needed
```

---

## Performance

| Benchmark | Target | Measured (CI runner) |
|---|---|---|
| Search 10K items (TS scorer) | < 16 ms | ~3.5 ms median |
| State update: `SEARCH_CHANGE` | < 4 ms | ~0.37 ms median |
| State update: `NAVIGATE` | < 1 ms | ~0.00075 ms median |
| Core bundle (gzipped) | <= 6.5 KB | ~6.4 KB |
| React bundle (gzipped) | <= 12 KB | ~9.8 KB |

Timings are medians from `benchmarks/baseline.json`: one CI run of the standalone harness, three runs of 1,000 iterations averaged, measured on a shared GitHub Actions
runner (noise is +/-20-40 %). CI compares new runs against that baseline with 5 % warning / 15 % failure
thresholds as a coarse tripwire, not a precise regression gate; the `NAVIGATE` baseline sits below the 0.01 ms noise floor and is reported, not compared, and a median above its target fails. There is no published WASM benchmark.

---

## CSS Customization

All animations and dimensions are customizable via CSS custom properties:

```css
[data-command-root] {
  --command-duration-enter: 200ms;
  --command-duration-exit: 150ms;
  --command-scale-from: 0.96;
  --command-overlay-blur: 4px;
  --command-dialog-radius: 12px;
  --command-dialog-max-width: 640px;
  --command-item-height: 44px;
  --command-highlight-color: oklch(0.85 0.15 90 / 0.3);
  --command-muted-color: light-dark(oklch(0.45 0.015 260), oklch(0.75 0.015 260));
}
```

`--command-muted-color` colours secondary text (group headings, shortcuts, the empty state, the
placeholder). Its default uses `light-dark()`, which follows the used `color-scheme`: set
`color-scheme` on `:root` or a parent (for example `color-scheme: dark` on a dark theme), or override
`--command-muted-color`. A dark-themed page that sets no `color-scheme` gets the light value on its dark
surface (about 2.4:1 contrast).

All styles use `@layer command` for zero-specificity conflicts and CSS logical properties for full RTL support.

---

## Migration from cmdk

Four codemods ship as the `modern-cmdk` bin. Pass a transform name and a glob (quote the glob so your
shell does not expand it):

```bash
npx modern-cmdk --help
npx modern-cmdk import-rewrite "./src/**/*.tsx" --dry-run
npx modern-cmdk import-rewrite "./src/**/*.tsx"
```

| Transform | What it does |
|---|---|
| `import-rewrite` | Rewrites `cmdk` imports to `modern-cmdk/react` |
| `data-attrs` | Converts `[cmdk-*]` selectors to `[data-command-*]` |
| `forward-ref` | Removes `React.forwardRef` wrappers (React 19) |
| `should-filter` | Converts the `shouldFilter` prop to `filter` |

Options: `--dry-run` lists the files that would change and writes nothing; `--concurrency=N` sets how
many files are processed at once (default 8); `--strict` is described below.

A run prints one `changed <file>` line per rewritten file and a summary. With `--dry-run` the lines read
`would change <file>` and the summary ends in `(dry run, nothing written)`:

```text
would change src/a.tsx
1 changed, 0 unchanged, 0 errors (dry run, nothing written)
```

Exit codes in 1.x are unchanged by default: `0` for `--help`, missing arguments and per-file errors, and
`1` for an unknown transform, a glob that matches no files, or an uncaught error. An unknown option is
warned about on stderr and ignored when the transform and glob are present. A malformed known option
(`--concurrency` with no value, `--dry-run=yes`) is a usage error that writes nothing and exits `0`.
With `--strict`, every usage error (including an unknown option, an unknown transform and a malformed
option) exits `2`, and any file error exits `1`.

See the [full migration guide](https://abcrimson.github.io/modern-cmdk/guide/migration-from-cmdk.html).

---

## Documentation

**[abcrimson.github.io/modern-cmdk](https://abcrimson.github.io/modern-cmdk/)**

**Guides:** [Getting Started](https://abcrimson.github.io/modern-cmdk/guide/getting-started.html) | [Installation](https://abcrimson.github.io/modern-cmdk/guide/installation.html) | [Basic Usage](https://abcrimson.github.io/modern-cmdk/guide/basic-usage.html) | [Async Items](https://abcrimson.github.io/modern-cmdk/guide/async-items.html) | [WASM Search](https://abcrimson.github.io/modern-cmdk/guide/wasm-search.html) | [Frecency](https://abcrimson.github.io/modern-cmdk/guide/frecency.html) | [Shortcuts](https://abcrimson.github.io/modern-cmdk/guide/shortcuts.html) | [Virtualization](https://abcrimson.github.io/modern-cmdk/guide/virtualization.html) | [SSR / Next.js](https://abcrimson.github.io/modern-cmdk/guide/ssr.html) | [Theming](https://abcrimson.github.io/modern-cmdk/guide/theming.html) | [Accessibility](https://abcrimson.github.io/modern-cmdk/guide/accessibility.html)

**Recipes:** [File Picker](https://abcrimson.github.io/modern-cmdk/recipes/file-picker.html) | [Emoji Picker](https://abcrimson.github.io/modern-cmdk/recipes/emoji-picker.html) | [AI Chat Commands](https://abcrimson.github.io/modern-cmdk/recipes/ai-chat-commands.html) | [Nested Commands](https://abcrimson.github.io/modern-cmdk/recipes/nested-commands.html) | [Spotlight Search](https://abcrimson.github.io/modern-cmdk/recipes/spotlight-search.html)

**API:** [Core Engine](https://abcrimson.github.io/modern-cmdk/api/command.html) | [React Adapter](https://abcrimson.github.io/modern-cmdk/api/command-react.html) | [WASM Search](https://abcrimson.github.io/modern-cmdk/api/command-search-wasm.html)

---

## Related Packages

| Package | Description |
|---|---|
| [`create-modern-cmdk`](https://www.npmjs.com/package/create-modern-cmdk) | `npm create modern-cmdk@latest <name>` -- scaffold a new project |
| `modern-cmdk-search-wasm` _(private 0.9.0, not published; build from source)_ | Experimental Rust/WASM fuzzy search |
| `vscode-modern-cmdk` _(not yet published)_ | VS Code snippets extension |

---

## License

[MIT](https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE) -- Copyright (c) 2026 Crimson Dev
