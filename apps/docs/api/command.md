# API Reference

## Core Package (`modern-cmdk`)

### `createCommandMachine(options?)`

Creates a new command palette state machine.

```typescript
import { createCommandMachine } from 'modern-cmdk';

using machine = createCommandMachine({
  items: [...],
  groups: [...],
  filter: customFilterFn, // optional
  frecency: { enabled: true },
  loop: true,
});
```

#### Options

| Prop | Type | Default | Description |
|---|---|---|---|
| `items` | `CommandItem[]` | `[]` | Initial items |
| `groups` | `CommandGroup[]` | `[]` | Initial groups |
| `filter` | `Function \| false` | built-in | Custom filter or `false` to disable |
| `label` | `string` | `'Command palette'` | ARIA label |
| `open` | `boolean` | `false` | Initial open state |
| `frecency` | `FrecencyOptions` | `undefined` | Frecency config |
| `loop` | `boolean` | `true` | Loop navigation |
| `onSelect` | `(id: ItemId) => void` | — | Selection callback |
| `onActiveChange` | `(id: ItemId \| null) => void` | — | Active change callback |
| `onOpenChange` | `(open: boolean) => void` | — | Open change callback |
| `onSearchChange` | `(query: string) => void` | — | Search change callback |

#### Machine API

| Method | Description |
|---|---|
| `getState()` | Returns current immutable state snapshot |
| `send(event)` | Dispatches an event (batched via rAF) |
| `subscribe(listener)` | Subscribe to state changes (returns `Disposable`) |
| `getRegistry()` | Access the command registry |
| `getKeyboardRegistry()` | Access the keyboard shortcut registry |
| `[Symbol.dispose]()` | Clean up all resources |

### Events

| Event Type | Payload | Description |
|---|---|---|
| `SEARCH_CHANGE` | `{ query: string }` | Update search query |
| `ITEM_SELECT` | `{ id: ItemId }` | Select an item |
| `ITEM_ACTIVATE` | `{ id: ItemId }` | Highlight an item |
| `NAVIGATE` | `{ direction: 'next' \| 'prev' \| 'first' \| 'last' }` | Navigate items |
| `PAGE_PUSH` | `{ page: string }` | Push a new page |
| `PAGE_POP` | — | Pop to previous page |
| `OPEN` | — | Open the palette |
| `CLOSE` | — | Close the palette |
| `TOGGLE` | — | Toggle open state |
| `REGISTER_ITEM` | `{ item: CommandItem }` | Register a new item |
| `UNREGISTER_ITEM` | `{ id: ItemId }` | Remove an item |

## React Package (`modern-cmdk/react`)

See [Basic Usage](/guide/basic-usage) for component documentation.
