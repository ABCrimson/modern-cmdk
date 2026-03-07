<p align="center">
  <strong>@crimson_dev/command</strong>
</p>

<p align="center">
  A headless command palette engine for the modern web.<br/>
  Framework-agnostic core. React 19 adapter. Zero compromise.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@crimson_dev/command"><img alt="npm version" src="https://img.shields.io/npm/v/@crimson_dev/command?style=flat-square&color=171717&labelColor=171717"/></a>
  <a href="https://bundlephobia.com/package/@crimson_dev/command"><img alt="bundle size" src="https://img.shields.io/bundlephobia/minzip/@crimson_dev/command?style=flat-square&color=171717&labelColor=171717&label=core"/></a>
  <a href="https://bundlephobia.com/package/@crimson_dev/command-react"><img alt="react bundle size" src="https://img.shields.io/bundlephobia/minzip/@crimson_dev/command-react?style=flat-square&color=171717&labelColor=171717&label=react"/></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6.0.1--rc-171717?style=flat-square&labelColor=171717"/></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/npm/l/@crimson_dev/command?style=flat-square&color=171717&labelColor=171717"/></a>
</p>

---

## Features

- **Framework-agnostic core** -- Pure TypeScript state machine. Zero dependencies. No DOM. No React. Portable to any framework or runtime.
- **React 19 adapter** -- `useSyncExternalStore`, `useTransition`, `useOptimistic`, `useId`, `use()` for Suspense. React Compiler compatible. `"use client"` throughout.
- **Automatic virtualization** -- Variable-height virtual scrolling activates at a configurable threshold. Handles 100K+ items with `content-visibility: auto`.
- **Fuzzy search** -- Built-in TypeScript scorer with incremental filtering. Optional WASM-accelerated engine for sub-1ms scoring on 100K items.
- **Frecency ranking** -- Frequency x recency ranking with `Temporal`-based exponential decay and pluggable persistence (memory, IndexedDB).
- **Keyboard shortcuts** -- Built-in registry with cross-platform `Mod` key, `RegExp.escape` for safe parsing, `Object.groupBy` for conflict detection.
- **Full accessibility** -- WAI-ARIA combobox pattern, `aria-live` announcements, `forced-colors` mode, `prefers-contrast`, `prefers-reduced-motion`.
- **GPU-composited animations** -- `@starting-style` for entry animations, `scroll-timeline` for scroll-driven progress, `will-change` + `translate3d` for layer promotion.
- **ES2026 throughout** -- Iterator Helpers, Set methods, `using`/`await using`, `Promise.try`, `Promise.withResolvers`, `Temporal`, `RegExp.escape`, `Object.groupBy`.
- **ESM-only** -- Zero CommonJS. Tree-shakeable. `sideEffects: false`. Isolated declarations.

---

## Quick Start

```bash
pnpm add @crimson_dev/command @crimson_dev/command-react
```

```tsx
'use client';

import { Command } from '@crimson_dev/command-react';

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

---

## Packages

| Package | Description | Budget |
|---|---|---|
| `@crimson_dev/command` | Framework-agnostic core engine -- state machine, search, frecency, keyboard registry | ≤ 3 KB |
| `@crimson_dev/command-react` | React 19 compound component adapter -- Dialog, List, Item, Group, Input, and more | ≤ 5 KB |
| `@crimson_dev/command-search-wasm` | Optional Rust/WASM fuzzy search engine -- trigram indexing, sub-1ms on 100K items | ≤ 50 KB |

---

## Architecture

```
+-------------------------------------------------------------------+
|                     Your Application                              |
+-------------------------------------------------------------------+
          |                                       |
+---------v-----------+              +------------v--------------+
| @crimson_dev/       |              | (Future adapters)         |
| command-react       |              | Svelte / Vue / Solid      |
|                     |              |                           |
| Command.Dialog      |              +---------------------------+
| Command.Input       |
| Command.List        |
| Command.Item        |
| Command.Group       |
| Command.Empty       |
| Command.Loading     |
+---------+-----------+
          |
          | useSyncExternalStore
          | useTransition
          |
+---------v------------------------------------------------------+
|                   @crimson_dev/command                          |
|                   (Framework-Agnostic Core)                    |
|                                                                |
|  +----------------+  +----------------+  +------------------+  |
|  | State Machine  |  | Search Engine  |  | Frecency Engine  |  |
|  | (Pure TS)      |  | (Pluggable)    |  | (Temporal API)   |  |
|  +-------+--------+  +-------+--------+  +--------+---------+  |
|          |                    |                     |           |
|  +-------v--------------------v---------------------v--------+ |
|  |              Command Registry & Event Emitter             | |
|  |     Items | Groups | Pages | Shortcuts | Async Sources    | |
|  +------------------+---------------------------------------+ |
|                      |                                         |
|  +------------------v-----------+  +------------------------+  |
|  | Keyboard Shortcut Registry   |  | Scheduler              |  |
|  | Parser | Matcher | Conflicts |  | rAF / microtask batch  |  |
|  +------------------------------+  +------------------------+  |
+----------------------------------------------------------------+
          |
          | Optional
+---------v-------------------+
| @crimson_dev/               |
| command-search-wasm         |
| Rust trigram index + scorer |
+-----------------------------+
```

---

## Why @crimson_dev/command?

| | cmdk | @crimson_dev/command |
|---|---|---|
| Architecture | React-only, tightly coupled | Framework-agnostic core + thin adapters |
| React version | React 18 | React 19 (`use()`, `useOptimistic`, `useId`) |
| Search | Basic substring matching | Fuzzy scoring + optional WASM + incremental filtering |
| Ranking | Static order | Frecency with `Temporal`-based decay |
| Virtualization | None (manual) | Automatic variable-height virtual scrolling |
| Animations | CSS transitions | GPU-composited: `@starting-style`, `scroll-timeline`, `content-visibility` |
| Keyboard | External handling | Built-in registry, `Mod` key, conflict detection |
| Accessibility | Partial ARIA | Full WAI-ARIA combobox, `forced-colors`, `prefers-contrast` |
| Bundle | ~6 KB | Core ≤ 3 KB, React adapter ≤ 5 KB |
| TypeScript | 4.x/5.x | TypeScript 6.0.1-rc, isolated declarations, branded types |
| Resource cleanup | Manual | `using`/`await using` (Explicit Resource Management) |

---

## API Overview

The React adapter exposes a `Command` namespace with compound components:

```tsx
<Command>              {/* Root -- creates the state machine */}
  <Command.Input />    {/* Search input -- bound to machine state */}
  <Command.List>       {/* Scrollable list -- auto-virtualization */}
    <Command.Empty />  {/* Shown when filteredCount === 0 */}
    <Command.Loading />{/* Shown when state.loading === true */}
    <Command.Group>    {/* Logical grouping with heading */}
      <Command.Item>   {/* Selectable item -- onSelect, value, shortcut */}
        <Command.Highlight />   {/* Fuzzy match highlighting */}
        <Command.Badge />       {/* Status badge */}
        <Command.Shortcut />    {/* Keyboard shortcut display */}
      </Command.Item>
    </Command.Group>
    <Command.Separator />       {/* Visual divider */}
  </Command.List>
</Command>

<Command.Dialog>       {/* Radix Dialog wrapper -- overlay + portal */}
  {/* Same children as above */}
</Command.Dialog>

<Command.Page>         {/* Nested page navigation */}
  {/* Page-specific content */}
</Command.Page>

<Command.AsyncItems    {/* Suspense-powered async data loading */}
  load={() => fetchItems()}
/>
```

### Core API (framework-agnostic)

```ts
import { createCommandMachine, itemId } from '@crimson_dev/command';

// Create a machine -- implements Disposable
using machine = createCommandMachine({
  items: [
    { id: itemId('copy'), value: 'Copy', shortcut: 'Mod+C', onSelect: () => copy() },
    { id: itemId('paste'), value: 'Paste', shortcut: 'Mod+V', onSelect: () => paste() },
  ],
  frecency: { enabled: true },
  loop: true,
});

// Read state
const state = machine.getState();

// Send events
machine.send({ type: 'SEARCH_CHANGE', query: 'cop' });
machine.send({ type: 'NAVIGATE', direction: 'next' });
machine.send({ type: 'ITEM_SELECT', id: itemId('copy') });

// Subscribe (useSyncExternalStore-compatible)
const unsubscribe = machine.subscribe(() => {
  console.log(machine.getState());
});

// Automatic cleanup via `using` -- no manual dispose needed
```

---

## Documentation

Full documentation, guides, and interactive examples:
**[command.crimson.dev](https://command.crimson.dev)**

- [Getting Started](https://command.crimson.dev/guide/getting-started)
- [Installation](https://command.crimson.dev/guide/installation)
- [Basic Usage](https://command.crimson.dev/guide/basic-usage)
- [Migration from cmdk](https://command.crimson.dev/guide/migration-from-cmdk)
- [API Reference](https://command.crimson.dev/api/command)

## Playground

Try it live: **[command.crimson.dev/playground](https://command.crimson.dev/playground)**

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup instructions, development workflow, and guidelines.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a deep dive into the technical design.

---

## License

[MIT](./LICENSE) -- Copyright (c) 2026 Crimson Dev
