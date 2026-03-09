<p align="center">
  <img src="https://raw.githubusercontent.com/ABCrimson/modern-cmdk/main/.github/assets/logo.svg" width="80" alt="@crimson_dev/command" />
</p>

<h1 align="center">@crimson_dev/command</h1>

<p align="center">
  <strong>Framework-agnostic headless command palette engine</strong>
  <br />
  Pure TypeScript state machine &middot; ES2026 &middot; 5 kB gzipped
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@crimson_dev/command"><img src="https://img.shields.io/npm/v/@crimson_dev/command?style=flat-square&color=crimson" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/@crimson_dev/command"><img src="https://img.shields.io/npm/dm/@crimson_dev/command?style=flat-square" alt="downloads" /></a>
  <a href="https://bundlephobia.com/package/@crimson_dev/command"><img src="https://img.shields.io/bundlephobia/minzip/@crimson_dev/command?style=flat-square&label=gzip" alt="bundle size" /></a>
  <a href="https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@crimson_dev/command?style=flat-square" alt="license" /></a>
</p>

---

## What is this?

The core engine behind `@crimson_dev/command-react`. Zero DOM dependencies, zero framework lock-in. Use it with React, Vue, Svelte, vanilla JS, or anything else.

- **Pure state machine** — immutable snapshots, deterministic transitions
- **Multi-strategy search** — exact, prefix, substring, word-boundary, fuzzy
- **Frecency ranking** — usage-aware scoring with Temporal-based decay
- **Keyboard shortcuts** — cross-platform registry with conflict detection
- **Pluggable scorer** — swap in WASM, AI, or your own search backend
- **Incremental filtering** — query-append optimization, pre-cached lowercase
- **Explicit Resource Management** — `using`/`Symbol.dispose` for leak-proof cleanup

## Install

```bash
pnpm add @crimson_dev/command
```

## Quick Start

```ts
import { createCommandMachine, itemId } from '@crimson_dev/command';

// Explicit Resource Management — auto-dispose on scope exit
using machine = createCommandMachine({
  items: [
    { id: itemId('copy'),  value: 'Copy',  onSelect: () => navigator.clipboard.writeText(selection) },
    { id: itemId('paste'), value: 'Paste', onSelect: () => document.execCommand('paste') },
    { id: itemId('find'),  value: 'Find',  keywords: ['search'], shortcut: 'Mod+F' },
  ],
  loop: true,
});

// Subscribe to state changes (useSyncExternalStore-compatible)
const unsubscribe = machine.subscribe(() => {
  const state = machine.getState();
  console.log(state.filteredIds, state.activeId, state.search);
});

// Drive the machine with events
machine.send({ type: 'SEARCH_CHANGE', query: 'cop' });
machine.send({ type: 'NAVIGATE', direction: 'next' });
machine.send({ type: 'ITEM_SELECT', id: itemId('copy') });
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    createCommandMachine()                     │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Registry  │  │ SearchEngine │  │ KeyboardShortcutReg  │  │
│  │  (items,   │  │ (scorer,     │  │ (parse, match,       │  │
│  │   groups)  │  │  index,      │  │  conflict detect)    │  │
│  │            │  │  incremental)│  │                      │  │
│  └───────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Scheduler  │  │ TypedEmitter │  │  FrecencyEngine      │  │
│  │ (batched   │  │ (subscribe,  │  │  (Temporal decay,    │  │
│  │  updates)  │  │  dispose)    │  │   IDB persistence)   │  │
│  └───────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         ▲ send(event)         │ getState() / subscribe()
         │                     ▼
    Any UI framework    Immutable CommandState snapshot
```

## ES2026 Features

| Feature | Usage |
|---------|-------|
| Iterator Helpers | `.map()`, `.filter()`, `.toArray()` on search result pipelines |
| Set methods | `.difference()`, `.intersection()` for ID operations |
| `Map.groupBy` | Grouped item rendering |
| `Temporal.Now.instant()` | Frecency timestamps, telemetry |
| `RegExp.escape` | Safe keyboard shortcut parsing |
| `using` / `Symbol.dispose` | Auto-cleanup of machine, search engine, scheduler |
| `Math.sumPrecise` | Virtualizer size calculations |
| `Promise.withResolvers` | Async search coordination |

## API

### `createCommandMachine(options?)`

Creates a new command palette state machine.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `items` | `CommandItem[]` | `[]` | Initial items |
| `groups` | `CommandGroup[]` | `[]` | Item groups |
| `filter` | `fn \| false` | built-in | Custom filter or `false` to disable |
| `search` | `SearchEngine` | built-in | Pluggable search engine |
| `loop` | `boolean` | `true` | Wrap keyboard navigation |
| `frecency` | `FrecencyOptions` | — | Enable usage-aware ranking |
| `onSelect` | `(id) => void` | — | Item selected callback |
| `onActiveChange` | `(id) => void` | — | Active item changed |
| `onOpenChange` | `(open) => void` | — | Dialog open/close |
| `onSearchChange` | `(query) => void` | — | Search query changed |

### Machine Methods

```ts
machine.getState()          // Current immutable state snapshot
machine.send(event)         // Dispatch a state transition
machine.subscribe(fn)       // useSyncExternalStore-compatible
machine.subscribeState(fn)  // Returns Disposable for `using`
machine[Symbol.dispose]()   // Clean up all resources
```

### Events

```ts
{ type: 'SEARCH_CHANGE', query: string }
{ type: 'ITEM_SELECT', id: ItemId }
{ type: 'ITEM_ACTIVATE', id: ItemId }
{ type: 'NAVIGATE', direction: 'next' | 'prev' | 'first' | 'last' }
{ type: 'OPEN' } | { type: 'CLOSE' } | { type: 'TOGGLE' }
{ type: 'PAGE_PUSH', page: string } | { type: 'PAGE_POP' }
{ type: 'ITEMS_LOADED', items: CommandItem[] }
```

## Branded Types

IDs are branded to prevent mixing item IDs with group IDs at compile time:

```ts
import { itemId, groupId } from '@crimson_dev/command';

const item = itemId('copy');   // ItemId (not assignable to GroupId)
const group = groupId('edit'); // GroupId (not assignable to ItemId)
```

## Links

- [Documentation](https://github.com/ABCrimson/modern-cmdk)
- [React Adapter](https://www.npmjs.com/package/@crimson_dev/command-react)
- [Architecture Guide](https://github.com/ABCrimson/modern-cmdk/blob/main/ARCHITECTURE.md)
- [Specification](https://github.com/ABCrimson/modern-cmdk/blob/main/cmdk-complete-rewrite-specification-v2.md)

## License

MIT
