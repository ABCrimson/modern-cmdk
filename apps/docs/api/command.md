---
title: "modern-cmdk Core API"
description: Complete API reference for the framework-agnostic core engine — state machine, search, frecency, keyboard registry, telemetry, and branded types.
---

# modern-cmdk (Core)

Framework-agnostic headless command palette engine. Pure TypeScript, zero DOM dependencies, portable to any runtime. All classes implement `Disposable` for `using`/`await using` cleanup.

## Installation

::: code-group
```bash [pnpm]
pnpm add modern-cmdk
```

```bash [npm]
npm install modern-cmdk
```
:::

```ts
import { createCommandMachine, itemId } from 'modern-cmdk';
```

---

## State Machine

### `createCommandMachine(options?)`

Creates a headless command palette state machine with search, frecency, and keyboard shortcut support. Implements `Disposable` for automatic cleanup via `using`.

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
machine.subscribe(() => console.log(machine.getState()));
// Automatic cleanup when `machine` goes out of scope
```

### `CommandMachineOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `items` | `CommandItem[]` | `[]` | Pre-registered items to populate on creation |
| `groups` | `CommandGroup[]` | `[]` | Pre-registered groups for item categorization |
| `filter` | `Function \| false` | built-in | Custom filter function, or `false` to disable filtering |
| `search` | `SearchEngine` | built-in | Pluggable search engine (e.g., WASM engine) |
| `label` | `string` | `'Command palette'` | Accessible label for the palette |
| `open` | `boolean` | `false` | Initial open state |
| `frecency` | `FrecencyOptions` | `undefined` | Frecency ranking configuration |
| `loop` | `boolean` | `true` | Whether keyboard navigation wraps around |
| `virtualizeThreshold` | `number` | `100` | Item count threshold for automatic virtualization |
| `onSelect` | `(id: ItemId) => void` | -- | Callback when an item is selected |
| `onActiveChange` | `(id: ItemId \| null) => void` | -- | Callback when the active item changes |
| `onOpenChange` | `(open: boolean) => void` | -- | Callback when open state changes |
| `onSearchChange` | `(query: string) => void` | -- | Callback when the search query changes |

### `CommandMachine` Interface

| Method | Returns | Description |
|---|---|---|
| `getState()` | `CommandState` | Returns current immutable state snapshot |
| `send(event)` | `void` | Dispatches an event (batched via `requestAnimationFrame`) |
| `subscribe(listener)` | `() => void` | Subscribe to state changes (`useSyncExternalStore`-compatible) |
| `subscribeState(listener)` | `Disposable` | Subscribe with full state — returns `Disposable` for `using` |
| `getRegistry()` | `CommandRegistry` | Access the command registry |
| `getKeyboardRegistry()` | `KeyboardShortcutRegistry` | Access the keyboard shortcut registry |
| `getFilteredIdSet()` | `ReadonlySet<ItemId>` | Current filtered IDs — O(1) membership checks |
| `getFilteredIdIndex()` | `ReadonlyMap<ItemId, number>` | Positional index — O(1) positional lookup |
| `[Symbol.dispose]()` | `void` | Clean up all resources (search engine, frecency, listeners) |

### `CommandState`

Immutable state snapshot. Each mutation produces a new object reference for efficient change detection.

| Field | Type | Description |
|---|---|---|
| `search` | `string` | Current search query |
| `activeId` | `ItemId \| null` | Currently highlighted item, or `null` |
| `filteredIds` | `readonly ItemId[]` | Ordered list of visible item IDs |
| `groupedIds` | `ReadonlyMap<GroupId, readonly ItemId[]>` | Group ID → visible item IDs |
| `filteredCount` | `number` | Count of visible items |
| `loading` | `boolean` | Whether async items are loading |
| `page` | `string` | Current page identifier |
| `pageStack` | `readonly string[]` | Previous pages for back-navigation |
| `open` | `boolean` | Whether the palette is open |
| `lastUpdated` | `number` | Epoch-millisecond timestamp of last mutation |

### Events (`CommandEvent`)

| Event Type | Payload | Description |
|---|---|---|
| `SEARCH_CHANGE` | `{ query: string }` | Update search query |
| `ITEM_SELECT` | `{ id: ItemId }` | Select an item |
| `ITEM_ACTIVATE` | `{ id: ItemId }` | Highlight an item |
| `NAVIGATE` | `{ direction: 'next' \| 'prev' \| 'first' \| 'last' }` | Navigate items |
| `PAGE_PUSH` | `{ page: string }` | Push a new page |
| `PAGE_POP` | -- | Pop to previous page |
| `OPEN` | -- | Open the palette |
| `CLOSE` | -- | Close the palette |
| `TOGGLE` | -- | Toggle open state |
| `ITEMS_LOADED` | `{ items: readonly CommandItem[] }` | Bulk-load async items |
| `REGISTER_ITEM` | `{ item: CommandItem }` | Register a new item |
| `UNREGISTER_ITEM` | `{ id: ItemId }` | Remove an item |
| `REGISTER_GROUP` | `{ group: CommandGroup }` | Register a new group |
| `UNREGISTER_GROUP` | `{ id: GroupId }` | Remove a group |

### `createInitialState(options?)`

Creates a default `CommandState`. Useful for testing or custom machine implementations.

```ts
import { createInitialState } from 'modern-cmdk';

const state = createInitialState({ open: true });
// { search: '', activeId: null, filteredIds: [], filteredCount: 0, ... }
```

---

## Types

### `CommandItem`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `ItemId` | Yes | Unique identifier (branded type) |
| `value` | `string` | Yes | Display text and primary search target |
| `keywords` | `readonly string[]` | No | Additional searchable terms |
| `groupId` | `GroupId` | No | Group this item belongs to |
| `shortcut` | `string` | No | Keyboard shortcut (e.g., `"Mod+K"`) |
| `disabled` | `boolean` | No | Excluded from filtering and selection |
| `onSelect` | `() => void` | No | Callback when selected |
| `data` | `Record<string, unknown>` | No | Arbitrary metadata |

### `CommandGroup`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `GroupId` | Yes | Unique identifier (branded type) |
| `heading` | `string` | No | Display heading text |
| `priority` | `number` | No | Sort priority (lower = higher in list) |

### Branded Types

Branded types prevent accidental mixing of plain strings with IDs at compile time.

```ts
import { itemId, groupId } from 'modern-cmdk';

const id = itemId('settings');      // type: ItemId (not string)
const gid = groupId('navigation');  // type: GroupId (not string)

// TypeScript catches this at compile time:
// machine.send({ type: 'ITEM_SELECT', id: 'plain-string' }); // Error!
```

| Function | Returns | Description |
|---|---|---|
| `itemId(id)` | `ItemId` | Create a branded item ID. Ensures well-formed Unicode. |
| `groupId(id)` | `GroupId` | Create a branded group ID. Ensures well-formed Unicode. |

---

## Search Engine

### `createSearchEngine(scorer?)`

Creates a pluggable search engine with fuzzy scoring, incremental filtering, and Iterator Helpers pipeline.

```ts
import { createSearchEngine } from 'modern-cmdk';

using engine = createSearchEngine();
engine.index(items);

const results = engine.search('sett', items);
for (const result of results) {
  console.log(result.id, result.score, result.matches);
}
```

### `SearchEngine` Interface

| Method | Returns | Description |
|---|---|---|
| `index(items)` | `void` | Index items for fast lookup |
| `search(query, items)` | `IteratorObject<SearchResult>` | Search items, returns lazy iterator of scored results |
| `remove(ids)` | `void` | Remove items from index by ID set |
| `clear()` | `void` | Clear the entire index |
| `[Symbol.dispose]()` | `void` | Dispose resources |

### `SearchResult`

| Field | Type | Description |
|---|---|---|
| `id` | `ItemId` | Matched item ID |
| `score` | `number` | Match quality (0–1, higher = better) |
| `matches` | `[number, number][]` | Character ranges for highlighting |

### `ScorerFn`

```ts
type ScorerFn = (query: string, item: CommandItem) => SearchResult | null;
```

Custom scoring function. Return `null` for no match, or a `SearchResult` with score and match ranges.

### Scoring Utilities

| Function | Description |
|---|---|
| `scoreItem(query, item)` | Default scorer — exact, prefix, substring, word boundary, fuzzy |
| `scoreItemAsync(query, item)` | Async version with `scheduler.yield()` for large datasets |
| `batchScoreItems(query, items, batchSize?)` | Batch scoring with yielding between batches |

---

## Frecency

### `FrecencyEngine`

Frequency x recency ranking with time-based exponential decay. Items used recently and frequently are boosted in search results.

```ts
import { FrecencyEngine, MemoryFrecencyStorage } from 'modern-cmdk';

using storage = new MemoryFrecencyStorage();
using frecency = new FrecencyEngine(storage, 'my-app');

frecency.recordSelection(itemId('settings'));
const bonus = frecency.computeBonus(itemId('settings')); // e.g., 4.0
```

### `FrecencyOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | -- | Enable frecency ranking |
| `storage` | `FrecencyStorage` | `MemoryFrecencyStorage` | Persistence backend |
| `namespace` | `string` | `'default'` | Storage namespace for isolation |
| `decayConfig` | `FrecencyDecayConfig` | See below | Decay curve weights |

### `FrecencyDecayConfig`

| Field | Type | Default | Description |
|---|---|---|---|
| `hourWeight` | `number` | `4.0` | Boost for items used in the last hour |
| `dayWeight` | `number` | `2.0` | Boost for items used today |
| `weekWeight` | `number` | `1.5` | Boost for items used this week |
| `monthWeight` | `number` | `1.0` | Boost for items used this month |
| `olderWeight` | `number` | `0.5` | Boost for older items |

### Storage Implementations

| Class | Description |
|---|---|
| `MemoryFrecencyStorage` | In-memory storage (lost on page reload). Implements `Disposable`. |
| `IdbFrecencyStorage` | IndexedDB persistence via `idb-keyval`. Implements `AsyncDisposable`. |

```ts
import { IdbFrecencyStorage } from 'modern-cmdk';

// Persist frecency data across browser sessions
await using storage = new IdbFrecencyStorage('my-db', 'frecency-store');
```

### `FrecencyStorage` Interface

```ts
interface FrecencyStorage extends Disposable {
  load(namespace: string): FrecencyData | Promise<FrecencyData>;
  save(namespace: string, data: FrecencyData): void | Promise<void>;
}
```

---

## Keyboard Registry

### `KeyboardShortcutRegistry`

Built-in keyboard shortcut management with cross-platform `Mod` key, conflict detection, and `RegExp.escape` parsing.

```ts
import { KeyboardShortcutRegistry, itemId } from 'modern-cmdk';

using registry = new KeyboardShortcutRegistry();
registry.register(itemId('copy'), 'Mod+C');
registry.register(itemId('paste'), 'Mod+V');

// Detect conflicts
const conflicts = registry.detectConflicts();
// conflicts: Map<string, ItemId[]> (shortcut → conflicting IDs)
```

### Shortcut Utilities

| Function | Returns | Description |
|---|---|---|
| `parseShortcut(shortcut)` | `ParsedShortcut` | Parse `"Mod+Shift+K"` into structured object |
| `formatShortcut(parsed)` | `string` | Format back to display string |
| `matchesShortcut(event, parsed)` | `boolean` | Check if a `KeyboardEvent` matches a parsed shortcut |
| `findMatchingShortcut(event, shortcuts)` | `ParsedShortcut \| undefined` | Find first matching shortcut |
| `detectConflicts(shortcuts)` | `Map<string, ItemId[]>` | Detect duplicate shortcut bindings |

### `ParsedShortcut`

```ts
interface ParsedShortcut {
  readonly key: string;       // Normalized key name
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly mod: boolean;       // true if Mod was specified (Cmd on macOS, Ctrl elsewhere)
}
```

### Shortcut Syntax

| Token | Meaning | macOS | Windows/Linux |
|---|---|---|---|
| `Mod` | Platform modifier | `Cmd (⌘)` | `Ctrl` |
| `Ctrl` | Control key | `Ctrl (⌃)` | `Ctrl` |
| `Shift` | Shift key | `Shift (⇧)` | `Shift` |
| `Alt` | Alt/Option key | `Option (⌥)` | `Alt` |
| `+` | Separator | -- | -- |

Example: `"Mod+Shift+K"` → macOS: `⌘⇧K`, Windows: `Ctrl+Shift+K`

---

## Telemetry

### `createTelemetryMiddleware(hooks)`

Creates opt-in telemetry middleware for enterprise observability. Zero overhead when hooks are not provided.

```ts
import { createTelemetryMiddleware } from 'modern-cmdk';

const telemetry = createTelemetryMiddleware({
  onPaletteOpen: () => analytics.track('palette_opened'),
  onPaletteClose: (durationMs) => analytics.track('palette_closed', { durationMs }),
  onSearchComplete: (query, count, durationMs) =>
    analytics.track('search', { query, resultCount: count, durationMs }),
  onItemSelected: (id, query, position) =>
    analytics.track('item_selected', { id, query, position }),
});
```

### `CommandTelemetryHooks`

| Hook | Signature | Description |
|---|---|---|
| `onPaletteOpen` | `() => void` | Called when the palette opens |
| `onPaletteClose` | `(durationMs: number) => void` | Called when it closes, with session duration |
| `onSearchComplete` | `(query, resultCount, durationMs) => void` | Called after each search |
| `onItemSelected` | `(itemId, searchQuery, position) => void` | Called when an item is selected |

---

## Utilities

### `CommandRegistry`

Internal registry for items and groups. Access via `machine.getRegistry()`.

| Method | Description |
|---|---|
| `registerItem(item)` | Register a command item |
| `unregisterItem(id)` | Remove a command item |
| `registerGroup(group)` | Register a group |
| `unregisterGroup(id)` | Remove a group |
| `getItem(id)` | Get an item by ID |
| `getGroup(id)` | Get a group by ID |
| `getAllItems()` | Get all registered items |
| `getAllGroups()` | Get all registered groups |

### `TypedEmitter`

Type-safe event emitter with `WeakRef`-based GC-safe listeners.

```ts
import { TypedEmitter } from 'modern-cmdk';

type Events = { change: string; count: number };
const emitter = new TypedEmitter<Events>();

emitter.on('change', (value) => console.log(value));
emitter.emit('change', 'hello');
```

### `createScheduler()`

Batched update scheduler with `requestAnimationFrame`, `scheduler.yield()`, and `isInputPending()` awareness.

```ts
import { createScheduler } from 'modern-cmdk';

const scheduler = createScheduler();
scheduler.schedule(() => expensiveWork());
// Work is batched and yields to browser when input is pending
```

### Constants

| Constant | Value | Description |
|---|---|---|
| `DEFAULT_FRECENCY_DECAY` | `{ hourWeight: 4.0, dayWeight: 2.0, weekWeight: 1.5, monthWeight: 1.0, olderWeight: 0.5 }` | Default decay curve |
| `DEFAULT_MACHINE_OPTIONS` | `{ loop: true, virtualizeThreshold: 100, open: false }` | Default machine options |

---

## React Adapter

For the full React 19 component API, see [modern-cmdk/react](/api/command-react).
