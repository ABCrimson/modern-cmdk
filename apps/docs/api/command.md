---
title: "modern-cmdk Core API"
description: Complete API reference for the framework-agnostic core engine — state machine, search, frecency, keyboard registry, telemetry, and branded types.
---

# modern-cmdk (Core)

Framework-agnostic headless command palette engine. Pure TypeScript with no hard DOM dependency (DOM APIs are feature-detected and SSR-safe), portable to any runtime. All classes implement `Disposable` for `using`/`await using` cleanup.

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

Creates a headless command palette state machine with search, frecency, and keyboard shortcut support. It returns `CommandMachine & AsyncDisposable`: `using` disposes it, and `await using` (or `[Symbol.asyncDispose]()`) first awaits the pending frecency save, then disposes. At the top level of a module, `using` disposes at the end of module evaluation; events still pending then are dropped (see [Scheduling](#scheduling)).

```ts
import { createCommandMachine, itemId } from 'modern-cmdk';

// Clipboard helpers; the palette itself does not provide them.
function copy(): void {
  void navigator.clipboard.writeText(window.getSelection()?.toString() ?? '');
}
function paste(): void {
  void navigator.clipboard.readText().then((text) => console.log('pasted', text));
}

const machine = createCommandMachine({
  items: [
    { id: itemId('copy'), value: 'Copy', shortcut: 'Mod+C', onSelect: () => copy() },
    { id: itemId('paste'), value: 'Paste', shortcut: 'Mod+V', onSelect: () => paste() },
  ],
  frecency: { enabled: true },
  loop: true,
});

// send() is scheduled: subscribe first, the listener runs once the batch has committed.
const unsubscribe = machine.subscribe(() => console.log(machine.getState().filteredIds));
machine.send({ type: 'SEARCH_CHANGE', query: 'cop' });

// Dispose on teardown, not at module top level: dispose drops events still pending and removes the
// global shortcut listener, so `using machine = ...` here would end the shortcuts and the listener at once.
export function teardown(): void {
  unsubscribe();
  machine[Symbol.dispose]();
}
```

### `CommandMachineOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `items` | `CommandItem[]` | `[]` | Pre-registered items to populate on creation |
| `groups` | `CommandGroup[]` | `[]` | Pre-registered groups for item categorization |
| `filter` | `((item, query) => number \| false) \| false` | built-in | Custom filter function, or `false` to disable filtering (every item is listed in registration order). The function returns a score: above 0 keeps the item (higher ranks first); `false`, `0` or a negative number excludes it. It is called for every item on every non-empty query. When `search` is given, a filter function is not consulted (`false` still disables filtering) |
| `search` | `SearchEngine` | built-in | Pluggable search engine (e.g., WASM engine), called only for a non-empty query with filtering on. Its order is kept, except that frecency (when enabled) re-ranks it and `disabledItems: 'hide'` drops disabled items |
| `label` | `string` | -- | Accepted in the type, but `createCommandMachine` never reads it. The React components read it as their `aria-label` and default it to `'Command palette'` |
| `open` | `boolean` | `false` | Initial open state |
| `frecency` | `FrecencyOptions` | `undefined` | Frecency ranking configuration; ranking applies only with `enabled: true` |
| `loop` | `boolean` | `true` | Whether keyboard navigation wraps around |
| `disabledItems` | `'show' \| 'hide'` | `'show'` | `'show'` keeps disabled items in `filteredIds` under every query; `'hide'` drops them from `filteredIds` in every branch. See [`disabled`](#commanditem) |
| `shortcutAction` | `'direct' \| 'select'` | `'direct'` | What an item's shortcut does. `'direct'` calls the item's `onSelect` and binds only items that have one. `'select'` dispatches `ITEM_SELECT` for the item (so the disabled guard, frecency, `options.onSelect` and the `select` event apply) and binds every enabled item that has a shortcut. A disabled item is never bound. 2.0 flips the default to `'select'` |
| `virtualizeThreshold` | `number` | `100` | Accepted but not read yet; `Command.List` virtualizes above a fixed 100 matches (off again at 50 or fewer) |
| `onSelect` | `(id: ItemId) => void` | -- | Callback when an item is selected |
| `onActiveChange` | `(id: ItemId \| null) => void` | -- | Callback when the active item changes |
| `onOpenChange` | `(open: boolean) => void` | -- | Callback when open state changes |
| `onSearchChange` | `(query: string) => void` | -- | Callback when the search query changes |

Order within a batch: `onOpenChange`, `onSearchChange` and the `openChange` event run while their event is handled, before the batch's single `stateChange` that `subscribe` and `subscribeState` listeners receive.

### `CommandMachine` Interface

| Method | Returns | Description |
|---|---|---|
| `getState()` | `CommandState` | Returns current immutable state snapshot (the state of the last committed batch, see [Scheduling](#scheduling)) |
| `send(event)` | `void` | Schedules an event (`requestAnimationFrame` in browsers, `queueMicrotask` where it is absent); does not apply it before returning |
| `subscribe(listener)` | `() => void` | Subscribe to state changes (`useSyncExternalStore`-compatible) |
| `subscribeState(listener)` | `Disposable` | Subscribe with full state — returns `Disposable` for `using` |
| `getRegistry()` | `CommandRegistry` | Access the command registry |
| `getKeyboardRegistry()` | `KeyboardShortcutRegistry` | Access the keyboard shortcut registry |
| `getFilteredIdSet()` | `ReadonlySet<ItemId>` | Current filtered IDs — O(1) membership checks |
| `getFilteredIdIndex()` | `ReadonlyMap<ItemId, number>` | Positional index — O(1) positional lookup |
| `[Symbol.dispose]()` | `void` | Clean up all resources (search engine, frecency, listeners); scheduled events that have not run are dropped |
| `[Symbol.asyncDispose]()` | `Promise<void>` | On the returned `CommandMachine & AsyncDisposable`: awaits the pending frecency save, then disposes as above |

### Scheduling

`send()` returns before the event is handled. Events queue on the machine's scheduler, which runs them in one pass on the next animation frame in browsers and on the next microtask where `requestAnimationFrame` is absent (Node, SSR). There is no `isInputPending` or `scheduler.yield()` gate: a batch always runs whole.

- `getState()` right after `send()` still returns the previous state.
- A batch emits one `stateChange` (if anything changed), however many events it holds. Registry events (`REGISTER_ITEM`, `UPDATE_ITEM`, `UNREGISTER_ITEM`, `ITEMS_LOADED`, `REGISTER_GROUP`, `UNREGISTER_GROUP`) only mark the results dirty; the batch refilters once for them at its end, or earlier when a later `SEARCH_CHANGE`, `NAVIGATE` or `ITEM_ACTIVATE` of the same batch needs current results. Each `SEARCH_CHANGE` refilters when it is handled. An event sent from inside a handler runs in the next batch.
- The machine has no public `flush()`. A core-only caller reads the result by subscribing (`machine.subscribe(listener)` or `machine.subscribeState(listener)`), or by awaiting the next frame or microtask before `getState()`.
- Disposing the machine drops events that have not run yet. `using` disposes at the end of its block, so a `send()` in a block that ends before the next frame or microtask (a module's top level, a synchronous function) is lost; await the commit inside the scope, as below, or keep the machine in a `const` that you dispose on teardown.

```ts
import { createCommandMachine, itemId } from 'modern-cmdk';

async function search(): Promise<void> {
  using machine = createCommandMachine({ items: [{ id: itemId('home'), value: 'Home' }] });

  const committed = Promise.withResolvers<void>();
  machine.subscribe(() => committed.resolve()); // runs once per committed batch
  machine.send({ type: 'SEARCH_CHANGE', query: 'ho' });

  console.log(machine.getState().search); // '' (not applied yet)
  await committed.promise;
  console.log(machine.getState().search); // 'ho'
}
```

### `CommandState`

Immutable state snapshot. Each mutation produces a new object reference for efficient change detection.

| Field | Type | Description |
|---|---|---|
| `search` | `string` | Current search query |
| `activeId` | `ItemId \| null` | Currently highlighted item, or `null` |
| `filteredIds` | `readonly ItemId[]` | Ordered list of visible item IDs. Disabled items are listed (under every query) unless `disabledItems: 'hide'` |
| `groupedIds` | `ReadonlyMap<GroupId, readonly ItemId[]>` | Group ID → visible item IDs. The keys are in group `priority` order (lower first; ungrouped items and unregistered group ids count as 0, ties keep first-appearance order); `filteredIds` and `NAVIGATE` keep the search order. Items without a group sit under `UNGROUPED_GROUP_ID` |
| `filteredCount` | `number` | Count of visible items (`filteredIds.length`, so it counts listed disabled items) |
| `loading` | `boolean` | `true` while any `<Command.AsyncItems>` is pending (the `LOADING` event) |
| `page` | `string` | Current page identifier |
| `pageStack` | `readonly string[]` | Previous pages for back-navigation |
| `open` | `boolean` | Whether the palette is open |
| `lastUpdated` | `number` | Epoch-millisecond timestamp of last mutation |

### Events (`CommandEvent`)

| Event Type | Payload | Description |
|---|---|---|
| `SEARCH_CHANGE` | `{ query: string }` | Update search query |
| `ITEM_SELECT` | `{ id: ItemId }` | Select an item: runs its `onSelect`, records frecency, emits `select` and calls `options.onSelect`. Does nothing for a disabled or unknown id |
| `ITEM_ACTIVATE` | `{ id: ItemId }` | Highlight an item. Lands only on an enabled item in `filteredIds`; otherwise ignored |
| `NAVIGATE` | `{ direction: 'next' \| 'prev' \| 'first' \| 'last' }` | Navigate items; disabled items are skipped |
| `PAGE_PUSH` | `{ page: string }` | Push a new page |
| `PAGE_POP` | -- | Pop to previous page |
| `OPEN` | -- | Open the palette |
| `CLOSE` | -- | Close the palette |
| `TOGGLE` | -- | Toggle open state |
| `ITEMS_LOADED` | `{ items: readonly CommandItem[] }` | Bulk-load async items; their shortcuts are bound like those of registered items |
| `LOADING` | `{ source: string; pending: boolean }` | A `<Command.AsyncItems>` source started (`pending` true) or finished (`pending` false); `loading` is true while any source is pending |
| `REGISTER_ITEM` | `{ item: CommandItem }` | Register a new item |
| `UPDATE_ITEM` | `{ item: CommandItem }` | Upsert an item in place: its position is kept (an unknown id is appended), the search index is updated and its shortcut is re-bound (`<Command.Item>` and `useRegisterItem` send it when their props change) |
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
| `shortcut` | `string` | No | Keyboard shortcut (e.g., `"Mod+K"`). Not bound while the item is disabled |
| `disabled` | `boolean` | No | Listed but inert: see [Disabled items](#disabled-items) |
| `onSelect` | `() => void` | No | Callback when selected. Called with no arguments, in the core and in `<Command.Item onSelect>` |
| `data` | `Record<string, unknown>` | No | Arbitrary metadata |

### Disabled items

A `disabled` item takes part in filtering and is listed, but it is inert:

- It is filtered and ordered like any other item under every query, so it appears in `filteredIds`, `groupedIds` and `filteredCount`. `<Command.Item>` renders it with `aria-disabled` and `data-disabled`.
- It is skipped by `NAVIGATE`, never becomes the active item (an `ITEM_ACTIVATE` for it is ignored and the first active item is the first enabled one), and `ITEM_SELECT` for it does nothing: no `onSelect`, no frecency record.
- Its `shortcut` is not bound, so it does not fire and the key is left to the page.
- `disabledItems: 'hide'` drops disabled items from `filteredIds` in every branch, so they are not rendered.
- A list holding only disabled items has `filteredCount > 0`, so `<Command.Empty>` does not render.

### `CommandGroup`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `GroupId` | Yes | Unique identifier (branded type) |
| `heading` | `string` | No | Display heading text |
| `priority` | `number` | No | Orders the keys of `CommandState.groupedIds` (lower first, default 0). `filteredIds` and `NAVIGATE` are unchanged, and `<Command.Group>` elements render in JSX order, not by priority |

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

### `createSearchEngine(options?)`

Creates a pluggable search engine with fuzzy scoring, incremental filtering, and Iterator Helpers pipeline. Incremental filtering applies to the default scorer only: when the lowercased query extends the previous lowercased query, only the previous matches are re-scored, and matching is case-insensitive. A custom `scorer` (and a machine `filter` function, which the machine wraps as a scorer) is called for every item on every non-empty query.

```ts
import { createSearchEngine, itemId } from 'modern-cmdk';
import type { CommandItem } from 'modern-cmdk';

const items: CommandItem[] = [
  { id: itemId('settings'), value: 'Settings' },
  { id: itemId('profile'), value: 'Profile' },
];

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
| `matches` | `ReadonlyArray<readonly [number, number]>` | Character ranges for highlighting |

### `ScorerFn`

```ts
import type { CommandItem, SearchResult } from 'modern-cmdk';

type ScorerFn = (query: string, item: CommandItem) => SearchResult | null;
```

Custom scoring function. Return `null` for no match, or a `SearchResult` with score and match ranges.

`matches` ranges are half-open `[start, end)`. With the default scorer they index the original `item.value`, not its lowercased copy, and a match on `keywords` only reports `matches: []`: there is nothing in the value to highlight. A custom scorer or search engine may return scores outside 0–1.

### Scoring Utilities

| Function | Description |
|---|---|
| `scoreItem(query, item)` | Default scorer — tries exact (1), prefix (0.9–1), substring, word boundary, then fuzzy, and keeps the best score over `value` and `keywords`. A word-boundary hit scores in (0.65, 0.7), by contiguity and coverage, above every fuzzy score (at most 0.65). A query longer than 512 characters skips the word-boundary tier and falls to fuzzy |
| `scoreItemAsync(query, item)` | `Promise` wrapper around `scoreItem` (a synchronous throw becomes a rejection); it does not yield |
| `batchScoreItems(query, items)` | Scores every item in one synchronous pass inside a single `Promise` and resolves the matches sorted by score, best first; it does not yield between batches |

---

## Frecency

### `FrecencyEngine`

Frequency x recency ranking with bucketed recency weights (hour, day, week, month, older). Items used recently and frequently get a bonus that is added to their match score for non-empty queries; an empty query keeps registry order.

Through a machine, ranking is on only with `enabled: true`. Select an item, then search: its bonus outweighs the match score difference.

```ts
import { createCommandMachine, itemId, MemoryFrecencyStorage } from 'modern-cmdk';

const settings = itemId('settings');
const profile = itemId('profile');

async function rank(): Promise<void> {
  await using machine = createCommandMachine({
    items: [
      { id: settings, value: 'Settings' },
      { id: profile, value: 'Profile' },
    ],
    frecency: { enabled: true, storage: new MemoryFrecencyStorage(), namespace: 'my-app' },
  });

  const committed = Promise.withResolvers<void>();
  machine.subscribe(() => committed.resolve());
  machine.send({ type: 'ITEM_SELECT', id: profile });
  machine.send({ type: 'SEARCH_CHANGE', query: 'e' });
  await committed.promise;

  // 'e' alone ranks Settings first; the selection of Profile adds a bonus of 4.0 (one use, within the hour)
  console.log(machine.getState().filteredIds); // [profile, settings]
}
```

A `FrecencyEngine` also works on its own, and it has no `enabled` switch:

```ts
import { FrecencyEngine, itemId } from 'modern-cmdk';

using frecency = new FrecencyEngine({ namespace: 'my-app' }); // MemoryFrecencyStorage by default

frecency.recordSelection(itemId('settings'));
const bonus = frecency.getBonus(itemId('settings')); // 4.0: frequency 1 x hourWeight 4.0
```

`FrecencyEngine` methods: `recordSelection(id)`, `getBonus(id, now?)`, `getAllBonuses(now?)`, `load()` (merges stored data: frequencies add, the later `lastUsed` wins; call it once per engine), `flush()` (saves dirty data and waits for saves in flight), `getData()`, `getConfig()`, `setConfig(config)`. Dirty data is saved 1000 ms after the last `recordSelection`, when the page becomes hidden (`visibilitychange`, `pagehide`), on `flush()` and on dispose. `computeFrecencyBonus(record, now?, config?)` is the pure function behind `getBonus`. A save waits for a `load()` in flight, so a selection made before the stored history arrives is merged into it; a `load()` that rejects turns persistence off for that engine, and one that never settles holds every save. Disposing an engine disposes the storage it created once the last save settles; a storage you passed is left to you.

### `FrecencyOptions`

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` (optional) | `false` | Turns frecency ranking on for `createCommandMachine({ frecency })` and `<Command frecency>`: ranking applies only with `enabled: true`. Flips to `true` in 2.0. `new FrecencyEngine({ storage, namespace })` needs no `enabled` field |
| `storage` | `FrecencyStorage` | `MemoryFrecencyStorage` | Persistence backend. A storage you pass is yours to dispose; the engine disposes only the storage it created (the default `MemoryFrecencyStorage`) |
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
| `IdbFrecencyStorage` | IndexedDB persistence via `idb-keyval`. `new IdbFrecencyStorage(dbName = 'modern-cmdk', storeName = 'frecency')`; also has `delete(namespace)`. Implements `Disposable` and `AsyncDisposable`. |

```ts
import { createCommandMachine, IdbFrecencyStorage } from 'modern-cmdk';

// Persist frecency data across browser sessions. A storage you pass is yours to dispose, so keep it
// for the page and dispose it at teardown, after `await machine[Symbol.asyncDispose]()` has settled:
// a sync machine dispose leaves its last save queued, and a disposed storage drops it.
const storage = new IdbFrecencyStorage('my-db', 'frecency-store');
const machine = createCommandMachine({ frecency: { enabled: true, storage } });

export async function teardown(): Promise<void> {
  await machine[Symbol.asyncDispose]();
  storage[Symbol.dispose]();
}
```

### `FrecencyStorage` Interface

```ts
import type { FrecencyData } from 'modern-cmdk';

interface FrecencyStorage extends Disposable {
  load(namespace: string): FrecencyData | Promise<FrecencyData>;
  save(namespace: string, data: FrecencyData): void | Promise<void>;
}
```

---

## Keyboard Registry

### `KeyboardShortcutRegistry`

Built-in keyboard shortcut management with cross-platform `Mod` key, and conflict detection. Every normalized shortcut keeps a stack of bindings, one per item: the later registration wins the `keydown`, disposing it restores the earlier one, and `getConflicts()` reports the keys that two or more items bind. The same item registered again under the same key replaces its own binding in place and is no conflict.

```ts
import { KeyboardShortcutRegistry, itemId } from 'modern-cmdk';

// Clipboard helpers; the palette itself does not provide them.
function copy(): void {
  void navigator.clipboard.writeText(window.getSelection()?.toString() ?? '');
}
function paste(): void {
  void navigator.clipboard.readText().then((text) => console.log('pasted', text));
}

const registry = new KeyboardShortcutRegistry();
registry.register('Mod+C', itemId('copy'), () => copy());
registry.register('Mod+V', itemId('paste'), () => paste());

// Detect conflicts
const conflicts = registry.getConflicts();
// conflicts: ReadonlyMap<string, readonly ParsedShortcut[]> (normalized shortcut → conflicting bindings)

// Dispose on teardown, not at module top level: the constructor installs the global keydown listener and
// dispose removes it and clears the bindings.
export function teardown(): void {
  registry[Symbol.dispose]();
}
```

| Method | Returns | Description |
|---|---|---|
| `register(shortcut, itemId, handler)` | `Disposable` | Bind a shortcut — `using` auto-unregisters |
| `unregister(shortcut)` | `void` | Remove every binding of that key (by shortcut string, normalized), whichever items hold them |
| `unregisterByItem(itemId, keep?)` | `void` | Remove all bindings of an item. The optional `keep` shortcut string names one key whose binding stays (a re-bind then replaces it in place) |
| `getBindings()` | `ReadonlyMap<string, { readonly shortcut: ParsedShortcut; readonly itemId: ItemId; readonly handler: () => void }>` | Snapshot of the winning binding of every key (normalized shortcut → the later registration) |
| `getConflicts()` | `ReadonlyMap<string, readonly ParsedShortcut[]>` | Normalized shortcut → the shortcuts of the bindings that share the key, earliest first |
| `setEnabled(enabled)` | `void` | Turn global `keydown` handling on or off |
| `[Symbol.dispose]()` | `void` | Remove the global `keydown` listener and clear all bindings |

A machine binds item shortcuts into its own registry (`machine.getKeyboardRegistry()`) when it is created and on `ITEMS_LOADED`, `REGISTER_ITEM` and `UPDATE_ITEM`, and unbinds them on `UNREGISTER_ITEM`. A disabled item is not bound. What a bound shortcut does is set by the [`shortcutAction`](#commandmachineoptions) option.

### Shortcut Utilities

| Function | Returns | Description |
|---|---|---|
| `parseShortcut(shortcut)` | `ParsedShortcut` | Parse `"Mod+Shift+K"` into structured object |
| `formatShortcut(parsed)` | `string` | Format back to display string |
| `matchesShortcut(event, parsed)` | `boolean` | Check if a `KeyboardEvent` matches a parsed shortcut |
| `findMatchingShortcut(event, shortcuts)` | `ParsedShortcut \| null` | Find first matching shortcut |
| `detectConflicts(shortcuts)` | `ReadonlyMap<string, readonly ParsedShortcut[]>` | Detect duplicate shortcut bindings |

### `ParsedShortcut`

```ts
interface ParsedShortcut {
  readonly key: string;        // Normalized key name
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly raw: string;        // Original shortcut string (well-formed)
  readonly normalized: string; // Deterministic form for dedup/comparison
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

Creates opt-in telemetry middleware for enterprise observability. It returns a `TelemetryMiddleware` object (`onOpen()`, `onClose()`, `onSearch(query, resultCount, startTime)`, `onSelect(itemId, query, position)`) that forwards to your hooks. Nothing calls it automatically: the machine and the React components have no telemetry option, so call these methods yourself, for example from `onOpenChange` and `onSelect`.

```ts
import { createTelemetryMiddleware } from 'modern-cmdk';

// Your analytics client (app-owned).
declare const analytics: { track(event: string, properties?: Record<string, unknown>): void };

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
| `onPaletteOpen` | `() => void` | Called by `middleware.onOpen()` |
| `onPaletteClose` | `(durationMs: number) => void` | Called by `middleware.onClose()`, with the time since `onOpen()` (not called if `onOpen()` did not run first) |
| `onSearchComplete` | `(query, resultCount, durationMs) => void` | Called by `middleware.onSearch(query, resultCount, startTime)`, with `Date.now() - startTime` |
| `onItemSelected` | `(itemId, searchQuery, position) => void` | Called by `middleware.onSelect(itemId, query, position)` |

---

## Utilities

### `CommandRegistry`

Internal registry for items and groups. Access via `machine.getRegistry()`.

| Method | Returns | Description |
|---|---|---|
| `registerItem(item)` | `Disposable` | Register a command item — `using` auto-deregisters |
| `registerItems(items)` | `Disposable` | Batch-register items with a single disposer |
| `unregisterItem(id)` | `void` | Remove a command item |
| `unregisterItems(ids)` | `void` | Bulk-remove items by ID set |
| `registerGroup(group)` | `Disposable` | Register a group — `using` auto-deregisters |
| `unregisterGroup(id)` | `void` | Remove a group |
| `getItem(id)` / `getGroup(id)` | item/group or `undefined` | O(1) lookup by ID |
| `getItems()` / `getGroups()` | `readonly []` | All registered items/groups in insertion order |
| `getGroupedItems()` | `ReadonlyMap` | Items bucketed by group ID |
| `getItemIds()` | `ReadonlySet<ItemId>` | All registered item IDs |
| `intersectWith(ids)` / `differenceFrom(ids)` / `unionWith(ids)` / `symmetricDifferenceWith(ids)` | `ReadonlySet<ItemId>` | Set operations against the registered ID set |
| `isSubsetOf(ids)` / `isSupersetOf(ids)` / `isDisjointFrom(ids)` | `boolean` | Set relationship checks |
| `clear()` | `void` | Remove all items and groups |

### `TypedEmitter`

Type-safe event emitter holding strong references to listeners; `on()` returns a `Disposable` that removes the listener. The event map is any object type (`TypedEmitter<T extends object>`): a type alias or an `interface`. A throwing listener does not stop the later ones; its error is rethrown from a microtask, so `emit()` itself does not throw.

```ts
import { TypedEmitter } from 'modern-cmdk';

interface Events {
  change: string;
  count: number;
}
const emitter = new TypedEmitter<Events>();

emitter.on('change', (value) => console.log(value));
emitter.emit('change', 'hello');
```

### `createScheduler()`

Batched update scheduler: `schedule(update)` coalesces updates into one pass on `requestAnimationFrame` in browsers and on `queueMicrotask` where it is absent (Node, SSR). A pass always runs whole, in the order scheduled; a throwing update is rethrown from a microtask and the rest still run. `flush()` applies the updates pending when it is called, synchronously and in order; an update scheduled during the flush runs on the next frame or microtask. Disposing drops pending updates.

```ts
import { createScheduler } from 'modern-cmdk';

using scheduler = createScheduler();
const expensiveWork = (): void => console.log('batched');
scheduler.schedule(() => expensiveWork());
scheduler.flush(); // logs 'batched' now instead of on the next frame or microtask
```

### Constants

| Constant | Value | Description |
|---|---|---|
| `DEFAULT_FRECENCY_DECAY` | `{ hourWeight: 4.0, dayWeight: 2.0, weekWeight: 1.5, monthWeight: 1.0, olderWeight: 0.5 }` | Default decay curve |
| `DEFAULT_MACHINE_OPTIONS` | `{ loop: true, virtualizeThreshold: 100, open: false }` | Default machine options; the machine reads `loop` and `open` from it when its options leave them out (`virtualizeThreshold` is not read yet) |
| `UNGROUPED_GROUP_ID` | `'__ungrouped'` (a `GroupId`) | The `groupedIds` key of items without a group. A group registered under this id shares the bucket, and the bucket takes that group's priority |

---

## React Adapter

For the full React 19 component API, see [modern-cmdk/react](/api/command-react).
