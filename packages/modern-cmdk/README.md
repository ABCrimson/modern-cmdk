<p align="center">
  <img src="https://raw.githubusercontent.com/ABCrimson/modern-cmdk/main/apps/docs/public/og-image.svg" alt="modern-cmdk" width="640" />
</p>

<p align="center">
  <strong>modern-cmdk</strong><br/>
  The definitive command palette engine for the modern web.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/modern-cmdk"><img alt="npm version" src="https://img.shields.io/npm/v/modern-cmdk?style=flat-square&color=dc2626&labelColor=0a0e27"/></a>
  <a href="https://bundlephobia.com/package/modern-cmdk"><img alt="bundle size" src="https://img.shields.io/bundlephobia/minzip/modern-cmdk?style=flat-square&color=dc2626&labelColor=0a0e27&label=core"/></a>
  <a href="https://github.com/ABCrimson/modern-cmdk/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/ABCrimson/modern-cmdk/ci.yml?style=flat-square&color=dc2626&labelColor=0a0e27&label=CI"/></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6.0-dc2626?style=flat-square&labelColor=0a0e27"/></a>
  <a href="https://react.dev/"><img alt="React" src="https://img.shields.io/badge/React-19-dc2626?style=flat-square&labelColor=0a0e27"/></a>
  <a href="https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE"><img alt="MIT License" src="https://img.shields.io/npm/l/modern-cmdk?style=flat-square&color=dc2626&labelColor=0a0e27"/></a>
</p>

<p align="center">
  <a href="https://command.crimson.dev">Documentation</a> &middot;
  <a href="https://command.crimson.dev/guide/getting-started">Getting Started</a> &middot;
  <a href="https://command.crimson.dev/api/command">API Reference</a> &middot;
  <a href="https://command.crimson.dev/examples/basic">Examples</a>
</p>

---

## Install

```bash
npm install modern-cmdk
```

The package exports three entry points:

```ts
import { createCommandMachine } from 'modern-cmdk';       // Core engine (no React)
import { Command } from 'modern-cmdk/react';               // React 19 components
import 'modern-cmdk/styles.css';                            // Default styles
```

React is an **optional** peer dependency — use the core engine standalone in any framework, or pair it with the React adapter for a batteries-included experience.

---

## Quick Start

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import 'modern-cmdk/styles.css';

function CommandPalette() {
  return (
    <Command.Dialog>
      <Command.Input placeholder="Type a command..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>

        <Command.Group heading="Actions">
          <Command.Item value="copy" onSelect={() => copyToClipboard()}>
            <Command.Highlight>Copy to Clipboard</Command.Highlight>
            <Command.Shortcut>Mod+C</Command.Shortcut>
          </Command.Item>
          <Command.Item value="paste" onSelect={() => paste()}>
            <Command.Highlight>Paste</Command.Highlight>
            <Command.Shortcut>Mod+V</Command.Shortcut>
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Navigation">
          <Command.Item value="settings" onSelect={() => navigate('/settings')}>
            Settings
            <Command.Badge>New</Command.Badge>
          </Command.Item>
        </Command.Group>
      </Command.List>
      <Command.Loading>Searching...</Command.Loading>
    </Command.Dialog>
  );
}
```

Or scaffold a new project instantly:

```bash
npm create modern-cmdk
```

---

## Why modern-cmdk?

A ground-up rewrite of `cmdk` for **React 19**, **ES2026**, and **TypeScript 6**. Framework-agnostic core. Zero compromise on performance, accessibility, or developer experience.

| | cmdk | modern-cmdk |
|---|---|---|
| **Architecture** | React-only, tightly coupled | Framework-agnostic core + thin adapters |
| **React** | 18 | 19 (`use()`, `useOptimistic`, `useId`, `ref` as prop) |
| **Search** | Basic substring | Fuzzy scoring + optional WASM (sub-1ms on 100K items) |
| **Ranking** | Static order | Frecency with time-based exponential decay |
| **Virtualization** | None | Automatic variable-height, `content-visibility: auto` |
| **Animations** | CSS transitions | GPU-composited: `@starting-style`, `scroll-timeline`, spring easing |
| **Keyboard** | External | Built-in registry, `Mod` key, conflict detection |
| **Accessibility** | Partial ARIA | Full WAI-ARIA combobox, `forced-colors`, `prefers-contrast` |
| **Bundle** | ~6 KB | Core ~6.3 KB, React ~25.2 KB |
| **TypeScript** | 4.x/5.x | 6.0, isolated declarations, branded types |
| **Cleanup** | Manual | `using`/`await using` (Explicit Resource Management) |
| **Error handling** | None | `CommandErrorBoundary` with fallback UI |
| **DevTools** | None | Built-in devtools hook for browser inspection |

---

## Features

- **Framework-agnostic core** -- Pure TypeScript state machine. Zero DOM dependencies. Portable to any runtime.
- **React 19 adapter** -- 14 compound components. `useSyncExternalStore`, `useTransition`, `useOptimistic`, `use()` for Suspense. React Compiler compatible.
- **Automatic virtualization** -- Variable-height virtual scrolling kicks in at 100+ items. Handles 100K+ items smoothly with `content-visibility: auto`.
- **Fuzzy search** -- Built-in TypeScript scorer with incremental filtering. Optional [WASM engine](https://www.npmjs.com/package/modern-cmdk-search-wasm) for sub-1ms on 100K items.
- **Frecency ranking** -- Frequency x recency with time-based exponential decay. Pluggable persistence (memory or IndexedDB).
- **Keyboard shortcuts** -- Built-in registry with cross-platform `Mod` key, conflict detection, and `RegExp.escape` parsing. Cross-browser helper functions for grouping and set operations.
- **Full accessibility** -- WAI-ARIA combobox pattern, `aria-live` announcements, `forced-colors`, `prefers-contrast`, `prefers-reduced-motion`.
- **GPU-composited animations** -- `@starting-style` entry, `scroll-timeline` progress, spring `linear()` easing. All customizable via CSS custom properties.
- **Error boundary** -- `CommandErrorBoundary` with static or render-function fallback.
- **DevTools** -- `useCommandDevtools()` exposes machine state via `CustomEvent` for browser inspection.
- **Telemetry middleware** -- Pluggable hooks for palette open/close, search, and item selection analytics.
- **ESM-only** -- Zero CommonJS. Tree-shakeable. `sideEffects: false`. Isolated declarations.

---

## React Components

```tsx
<Command>                {/* Root -- state machine provider */}
  <Command.Input />      {/* Search input */}
  <Command.List>         {/* Scrollable list with auto-virtualization */}
    <Command.Empty />    {/* Shown when filteredCount === 0 */}
    <Command.Loading />  {/* Shown when loading */}
    <Command.Group>      {/* Labeled group of items */}
      <Command.Item>     {/* Selectable item */}
        <Command.Highlight />   {/* Fuzzy match highlighting */}
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

| Benchmark | Target | Measured |
|---|---|---|
| Search 10K items (TS scorer) | < 16 ms | ~8.2 ms |
| Search 100K items (WASM) | < 1 ms | ~0.7 ms |
| Filter 10K (incremental) | < 2 ms | ~1.1 ms |
| State update cycle | < 4 ms | ~2.3 ms |
| Core bundle (gzipped) | <= 6.5 KB | ~6.3 KB |
| React bundle (gzipped) | <= 25.5 KB | ~25.2 KB |

CI enforces 5% warning / 15% failure regression thresholds with 3-run averaging.

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
}
```

All styles use `@layer command` for zero-specificity conflicts and CSS logical properties for full RTL support.

---

## Migration from cmdk

Automated codemods handle the most common migration patterns:

```bash
npx modern-cmdk --transform import-rewrite ./src
npx modern-cmdk --transform data-attrs ./src
npx modern-cmdk --transform forward-ref ./src
npx modern-cmdk --transform should-filter ./src
```

See the [full migration guide](https://command.crimson.dev/guide/migration-from-cmdk).

---

## Documentation

**[command.crimson.dev](https://command.crimson.dev)**

**Guides:** [Getting Started](https://command.crimson.dev/guide/getting-started) | [Installation](https://command.crimson.dev/guide/installation) | [Basic Usage](https://command.crimson.dev/guide/basic-usage) | [Async Items](https://command.crimson.dev/guide/async-items) | [WASM Search](https://command.crimson.dev/guide/wasm-search) | [Frecency](https://command.crimson.dev/guide/frecency) | [Shortcuts](https://command.crimson.dev/guide/shortcuts) | [Virtualization](https://command.crimson.dev/guide/virtualization) | [SSR / Next.js](https://command.crimson.dev/guide/ssr) | [Theming](https://command.crimson.dev/guide/theming) | [Accessibility](https://command.crimson.dev/guide/accessibility)

**Recipes:** [File Picker](https://command.crimson.dev/recipes/file-picker) | [Emoji Picker](https://command.crimson.dev/recipes/emoji-picker) | [AI Chat Commands](https://command.crimson.dev/recipes/ai-chat-commands) | [Nested Commands](https://command.crimson.dev/recipes/nested-commands) | [Spotlight Search](https://command.crimson.dev/recipes/spotlight-search)

**API:** [Core Engine](https://command.crimson.dev/api/command) | [React Adapter](https://command.crimson.dev/api/command-react) | [WASM Search](https://command.crimson.dev/api/command-search-wasm)

---

## Related Packages

| Package | Description |
|---|---|
| [`create-modern-cmdk`](https://www.npmjs.com/package/create-modern-cmdk) | `npm create modern-cmdk` -- scaffold a new project |
| [`modern-cmdk-search-wasm`](https://www.npmjs.com/package/modern-cmdk-search-wasm) | Rust/WASM fuzzy search -- sub-1ms on 100K items |
| [`vscode-modern-cmdk`](https://marketplace.visualstudio.com/items?itemName=crimson-dev.vscode-modern-cmdk) | VS Code snippets extension |

---

## License

[MIT](https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE) -- Copyright (c) 2026 Crimson Dev
