---
title: "modern-cmdk/react API"
description: Complete API reference for the React 19 adapter, including all compound components, props, hooks, and data attributes.
---

# modern-cmdk/react

React 19 compound component adapter for `modern-cmdk`. The shipped components are client-only (`dist/react/index.mjs` and `dist/react/dialog.mjs` begin with `"use client"`; the build adds it, the source files do not carry it) and accept `ref` as a prop (no `forwardRef`).

## Installation

::: code-group
```bash [pnpm]
pnpm add modern-cmdk
```

```bash [npm]
npm install modern-cmdk
```
:::

Every `modern-cmdk/react` import needs `react` and `react-dom` (`>=19.0.0 <21.0.0`) and `radix-ui` (`>=1.4.0 <2.0.0`). `react` and `react-dom` are optional peers of `modern-cmdk`, but `radix-ui` requires them, so npm 7+ and pnpm install them with `modern-cmdk/react`; install them explicitly to pin the version: `pnpm add react react-dom radix-ui`.

## `<Command>`

Root component that creates a command palette state machine and provides context to all child components.

```tsx
import type { ReactNode } from 'react';
import type { CommandItem } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';

// A custom filter: return a score, or false to hide the item.
const customFilterFn = (item: CommandItem, query: string): number | false =>
  item.value.toLowerCase().includes(query.toLowerCase()) ? 1 : false;

function Palette({ children }: { children: ReactNode }) {
  return (
    <Command
      label="Command Menu"
      filter={customFilterFn}
      frecency={{ enabled: true }}
      loop={true}
      onSelect={(id) => console.log(id)}
    >
      {children}
    </Command>
  );
}
```

### Props

Extends the machine options (`CommandMachineOptions`) and `ComponentPropsWithRef<'div'>`: every other attribute and the `ref` of a `div` reach the root element. The root's own `data-command-root`, `data-command-state`, `role` and `aria-label` come after yours and win.

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | -- | Child components |
| `className` | `string` | -- | Class name for the root `<div>` |
| `label` | `string` | `'Command palette'` | Accessible label (`aria-label`) |
| `items` | `CommandItem[]` | `[]` | Pre-registered items |
| `groups` | `CommandGroup[]` | `[]` | Pre-registered groups |
| `filter` | `Function \| false` | built-in | Custom filter function `(item, query) => number \| false` (above 0 keeps the item, higher ranks first; `false`, `0` or a negative number excludes it), or `false` to disable. Not consulted when `searchEngine` (or `search`) is given |
| `searchEngine` | `SearchEngine` | built-in | Pluggable search engine (e.g., WASM). Read once, when the component mounts (a later change warns in development; give the component a new key to apply it). The machine disposes only an engine it created: an engine you pass is yours to dispose, and it survives the machine's dispose, `suspend()` and `resume()`; the root suspends its machine on unmount and never disposes it |
| `search` | `SearchEngine` | built-in | Deprecated name of `searchEngine`, which wins when both are set; removed in 2.0. The same ownership rule holds: an engine you pass is yours to dispose |
| `frecency` | `FrecencyOptions` | -- | Frecency ranking configuration; ranking is on only with `enabled: true` (`enabled` is optional, default `false`). A storage passed in `frecency.storage` is yours to dispose; the engine disposes only the storage it created |
| `loop` | `boolean` | `true` | Whether keyboard navigation wraps |
| `disabledItems` | `'show' \| 'hide'` | `'show'` | `'show'` renders disabled items (`aria-disabled`, `data-disabled`), skipped by navigation and selection under every query; `'hide'` drops them from the list. See [Disabled items](/api/command#disabled-items) |
| `shortcutAction` | `'direct' \| 'select'` | `'direct'` | What an item's `shortcut` does: `'direct'` calls its `onSelect`; `'select'` dispatches `ITEM_SELECT` (frecency, the root `onSelect` and the disabled guard apply). A disabled item's shortcut never fires. 2.0 flips the default to `'select'` |
| `open` | `boolean` | `false` | Initial open state, read once when the component mounts |
| `onSelect` | `(id: ItemId) => void` | -- | Fired for every select of an enabled item (never deduped) |
| `activeId` | `ItemId \| null` | `undefined` | The active item, controlled by the caller. `state.activeId` mirrors it while that id is listed and enabled, else `null`; `activeId={null}` means no active item. Every candidate the machine would choose (navigation, hover, the fallback after the list or the query changes) is reported through `onActiveChange`, repeats included, and the caller decides. A changed value applies without a report. Leave it `undefined` for the machine to own the active item |
| `onActiveChange` | `(id: ItemId \| null) => void` | -- | Fired when navigation or hover makes an item active, once per distinct value (a repeat of the last value is dropped). With a controlled `activeId`, fired for every candidate, repeats included |
| `onOpenChange` | `(open: boolean) => void` | -- | Fired when open state changes, once per distinct value |
| `onSearchChange` | `(query: string) => void` | -- | Fired when the search query changes, once per distinct value. A query that comes from the `value` prop of `<Command.Input>` is not reported back |
| `telemetry` | `CommandTelemetryHooks` | -- | Hooks the machine calls once per batch, at the batch's end, after its state reports, in the order open, search, selects, close. The latest value is read at each batch's end, and telemetry follows the machine, not the root's visibility. See [Telemetry](/api/command#telemetry) |
| `virtualizeThreshold` | `number` | `100` | Accepted but not read yet; `Command.List` virtualizes above a fixed 100 matches (off again at 50 or fewer) |

### Data Attributes

| Attribute | Value | Description |
|---|---|---|
| `data-command-root` | `""` | Always present on root |
| `data-command-state` | `"open" \| "closed"` | Current open/closed state |

### ARIA

| Attribute | Value |
|---|---|
| `role` | `"search"` |
| `aria-label` | Value of `label` prop |

---

## `<Command.Input>`

Search input with ARIA combobox role. Manages the search query and connects to the listbox.

```tsx
import { Command } from 'modern-cmdk/react';

const input = (
  <Command.Input
    placeholder="Type a command..."
    onValueChange={(value) => console.log(value)}
  />
);
```

### Props

Extends `ComponentPropsWithRef<'input'>` (excluding `onChange`, `type`, `role`).

| Prop | Type | Default | Description |
|---|---|---|---|
| `ref` | `Ref<HTMLInputElement>` | -- | Ref to the input element |
| `placeholder` | `string` | `'Search...'` | Placeholder text |
| `value` | `string` | -- | The search text, controlled by you. When defined the input shows it, a change calls `onValueChange` and sends nothing to the machine, and the prop is sent to the machine as the search query whenever it changes. The root's `onSearchChange` is not called for a query that comes from this prop, the first one at mount included. Leave it `undefined` for the input to keep its own text |
| `onValueChange` | `(value: string) => void` | -- | Called with the new text on every change. Controlled (`value` defined): you apply it by passing the next `value`; an ignored change leaves the input at its `value` |

### Data Attributes

| Attribute | Description |
|---|---|
| `data-command-input` | Always present |

### ARIA

| Attribute | Value |
|---|---|
| `role` | `"combobox"` |
| `aria-expanded` | `true` |
| `aria-controls` | ID of the `<Command.List>` |
| `aria-activedescendant` | ID of the active item |
| `aria-autocomplete` | `"list"` |
| `aria-label` | Value of root `label` prop |

---

## `<Command.List>`

Scrollable result list with built-in virtualization, `aria-live` announcements, and scroll-to-active behavior.

```tsx
import type { ReactNode } from 'react';
import { Command } from 'modern-cmdk/react';

function Results({ children }: { children: ReactNode }) {
  return (
    <Command.List estimateSize={48} overscan={10}>
      {children}
    </Command.List>
  );
}
```

### Props

Extends `ComponentPropsWithRef<'div'>`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `ref` | `Ref<HTMLDivElement>` | -- | Ref to the scroll container |
| `virtualize` | `boolean` | unset (auto) | Unset: virtualizes above 100 filtered items and stops again at 50 or fewer. `true` forces it on; `false` disables it |
| `estimateSize` | `number` | `44` | Estimated item height in pixels |
| `overscan` | `number` | `8` | Items rendered beyond the visible viewport (each direction) |
| `announceResults` | `(count: number) => string` | built-in | Formats the `aria-live` announcement from the filtered count (for i18n); the built-in text is `<n> result(s) available.` |

### Data Attributes

| Attribute | Description |
|---|---|
| `data-command-list` | Always present |
| `data-command-list-inner` | Inner container (non-virtual mode) |
| `data-command-list-virtual` | Inner container (virtual mode) |
| `data-command-list-status` | Status container after the listbox, where `<Command.Empty>` renders |

### ARIA

| Attribute | Value |
|---|---|
| `role` | `"listbox"` |
| `aria-label` | Value of root `label` prop |
| `aria-busy` | `true` when loading |

### CSS Custom Properties

| Property | Description |
|---|---|
| `--command-list-height` | Measured inner height (set via `ResizeObserver`) |

---

## `<Command.Item>`

Individual command item. Renders only when it passes the current filter.

```tsx
import { Command } from 'modern-cmdk/react';

// Your app's navigation (app-owned).
function openSettings(): void {
  location.assign('/settings');
}

const settingsItem = (
  <Command.Item
    value="settings"
    keywords={['preferences', 'config']}
    shortcut="Mod+,"
    onSelect={() => openSettings()}
    disabled={false}
  >
    Settings
    <Command.Shortcut shortcut="Mod+," />
  </Command.Item>
);
```

### Props

Extends `ComponentPropsWithRef<'div'>` (excluding `onSelect`, `value`).

| Prop | Type | Default | Description |
|---|---|---|---|
| `ref` | `Ref<HTMLDivElement>` | -- | Ref to the item element |
| `value` | `string` | Required | Display text and primary search target |
| `keywords` | `readonly string[]` | -- | Additional searchable terms |
| `onSelect` | `() => void` | -- | Callback when the item is selected; called with no argument (the item value arrives as the first argument in 2.0) |
| `disabled` | `boolean` | `false` | A disabled item is still filtered and rendered (`aria-disabled`, `data-disabled`) but skipped by keyboard navigation, never active, not selectable by click or Enter, and its `shortcut` does not fire. With the root's `disabledItems="hide"` it is not rendered |
| `shortcut` | `string` | -- | Keyboard shortcut string (e.g., `"Mod+K"`); bound while the item is enabled |
| `id` | `string` | `useId()` | The registration id and the DOM `id`. The registration id is `id ?? forceId ?? useId()`; in development a warning fires once when `id` and `forceId` are both given and differ. Pass the stable id of a loaded, fetched or persisted item |
| `forceId` | `string` | -- | Deprecated; use `id`. Removed in 2.0 |
| `propsMerge` | `'override' \| 'compose'` | `'override'` | How the props you pass meet the item's own handlers and style. `'override'` spreads your props last, so an `onClick`, `onPointerMove` or `style` of yours replaces the item's. `'compose'` spreads them first: your `onClick` and `onPointerMove` run, then the item selects or activates unless the event is default-prevented, your `style` merges under the virtual position, and the `id`, `role` and `aria-*` attributes the item manages win. The default becomes `'compose'` in 2.0 |

### Data Attributes

| Attribute | Condition | Description |
|---|---|---|
| `data-command-item` | Always | Identifies the element as a command item |
| `data-active` | When active | Currently highlighted item |
| `data-disabled` | When disabled | Disabled item |
| `data-value` | Always | The `value` prop |

### ARIA

| Attribute | Value |
|---|---|
| `role` | `"option"` |
| `aria-selected` | `true` when active |
| `aria-disabled` | `true` when disabled |
| `aria-keyshortcuts` | Shortcut string (if provided) |

---

## `<Command.Group>`

Groups related items with an optional heading. Automatically hidden when no items in the group pass the filter.

```tsx
import { Command } from 'modern-cmdk/react';

const navigation = (
  <Command.Group heading="Navigation" priority={1}>
    <Command.Item value="home">Home</Command.Item>
    <Command.Item value="about">About</Command.Item>
  </Command.Group>
);
```

### Props

Extends `ComponentPropsWithRef<'div'>`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `ref` | `Ref<HTMLDivElement>` | -- | Ref to the group container |
| `heading` | `string` | -- | Heading text displayed above the group |
| `priority` | `number` | -- | Orders the keys of `CommandState.groupedIds` (lower first). React renders the groups in the JSX order of the `<Command.Group>` elements, not by this number, and `filteredIds` and keyboard navigation keep the search order |
| `id` | `string` | `useId()` | The registration id and the `id` attribute of the group element. The registration id is `id ?? forceId ?? useId()`; in development a warning fires once when `id` and `forceId` are both given and differ |
| `forceId` | `string` | -- | Deprecated; use `id`. Removed in 2.0 |

### Data Attributes

| Attribute | Description |
|---|---|
| `data-command-group` | Group container |
| `data-command-group-heading` | Heading element |
| `data-command-group-items` | Items container |

### ARIA

| Attribute | Value |
|---|---|
| `role` | `"group"` |
| `aria-labelledby` | ID of the heading element (if `heading` is provided) |

---

## `<Command.Empty>`

Renders when no items match the current search query and the list is not loading.

```tsx
import { Command } from 'modern-cmdk/react';

const empty = <Command.Empty>No results found.</Command.Empty>;
```

Extends `ComponentPropsWithRef<'div'>`. Data attribute: `data-command-empty`. ARIA: `role="status"`, `aria-live="polite"`.

---

## `<Command.Loading>`

Renders while `state.loading` is `true`. `state.loading` is `true` while any `<Command.AsyncItems>` is pending (the machine's `LOADING` event), so the component needs no props to show async loading. The `loading` prop is an override, not a requirement. Keep it on a `<Command.Loading>` used as an `AsyncItems` fallback, so the element renders on the fallback's first render.

```tsx
import { Command } from 'modern-cmdk/react';

function Status({ isSearching }: { isSearching: boolean }) {
  return <Command.Loading loading={isSearching}>Searching...</Command.Loading>;
}
```

Extends `ComponentPropsWithRef<'div'>`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `loading` | `boolean` | auto-detected | Overrides `state.loading` |

Data attribute: `data-command-loading`. ARIA: `role="status"`, `aria-busy`, `aria-live="assertive"`.

---

## `<Command.Separator>`

Visual separator between groups or items.

```tsx
import { Command } from 'modern-cmdk/react';

const separator = <Command.Separator />;
```

Extends `ComponentPropsWithRef<'div'>`. Data attribute: `data-command-separator`. ARIA: `role="none"`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `alwaysRender` | `boolean` | `true` | Render the separator while a search is active. With `false` it renders nothing while the search is non-empty. 2.0 flips the default to `false` |

---

## `<Command.Dialog>`

Full dialog implementation using Radix Dialog with focus trap, overlay, `@starting-style` animations, and controlled open/close state. Until the dialog-token fix ships (1.8.0) the enter and exit animations do not run out of the box; see [Theming](/guide/theming#dialog-animations).

The same component is exported as `CommandDialog`, with its `CommandDialogProps` type, from the `modern-cmdk/react/dialog` subpath. `Command.Dialog` on the `modern-cmdk/react` barrel stays in 1.x. Both need `radix-ui` installed:

```tsx
import { CommandDialog, type CommandDialogProps } from 'modern-cmdk/react/dialog';
```

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { useState, useEffect } from 'react';

function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command Menu">
      <Command.Input placeholder="Search commands..." />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>
        <Command.Item value="home" onSelect={() => setOpen(false)}>Home</Command.Item>
      </Command.List>
    </Command.Dialog>
  );
}
```

### Props

Inherits all `CommandMachineOptions` props (`telemetry` included, forwarded as in `<Command>`), plus:

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | -- | Dialog content |
| `className` | `string` | -- | Class name for the `Dialog.Content` wrapper |
| `overlayClassName` | `string` | -- | Class name for the overlay |
| `contentClassName` | `string` | -- | Class name for the inner content container |
| `label` | `string` | `'Command palette'` | Accessible label |
| `description` | `string` | `'Type a command or search...'` | Accessible description for screen readers |
| `open` | `boolean` | -- | Controlled open state. When defined, the dialog is open exactly while it is `true`: a request to open or close calls `onOpenChange(requested)` once and changes nothing else, so the parent decides, and a parent that keeps `open={true}` keeps the dialog open. When omitted the dialog starts closed, and nothing the component renders or binds opens it (it has no trigger and no open shortcut), so pass `open` |
| `onOpenChange` | `(open: boolean) => void` | -- | Called with the requested open state. A controlled dialog reports each request once: the user's (Escape, a click outside, the overlay) and the palette's own (an item selection that closes it, `CLOSE`, `OPEN` or `TOGGLE` from a shortcut or a `send`). A change of the `open` prop does not call it |
| `container` | `HTMLElement \| null` | `document.body` | Portal container element |

### Data Attributes

| Attribute | Element | Value |
|---|---|---|
| `data-command-overlay` | Overlay | `""` |
| `data-command-dialog` | Dialog container | `""` |
| `data-command-dialog-content` | Inner content | `""` |
| `data-state` | Overlay and dialog | `"open" \| "closed"` |

---

## `<Command.Highlight>`

Renders text with highlighted match ranges from the search scorer.

```tsx
import { Command } from 'modern-cmdk/react';

const highlight = (
  <Command.Highlight
    text="Application Settings"
    ranges={[[0, 3], [12, 15]]}
    highlightClassName="my-highlight"
  />
);
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `text` | `string` | Required | Full text to display |
| `ranges` | `ReadonlyArray<readonly [number, number]>` | Required | Match ranges from search scorer |
| `highlightClassName` | `string` | -- | Class name for `<mark>` elements |

Data attribute: `data-command-highlight` on each `<mark>` element.

---

## `<Command.Shortcut>`

Renders a platform-aware keyboard shortcut label. On macOS displays glyphs, on Windows/Linux displays text labels.

```tsx
import { Command } from 'modern-cmdk/react';

const shortcut = <Command.Shortcut shortcut="Mod+Shift+K" />;
```

Extends `ComponentPropsWithRef<'kbd'>`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `shortcut` | `string` | -- | Shortcut string to parse and display |
| `children` | `ReactNode` | -- | Manual content (used if `shortcut` is not provided) |

Data attribute: `data-command-shortcut`.

---

## `<Command.Badge>`

Category or type badge for items. Extends `ComponentPropsWithRef<'span'>`. Data attribute: `data-command-badge`.

---

## `<Command.Page>`

Renders content conditionally based on the active page. Used for multi-page command palette flows.

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | Required | Page identifier, a plain `string`. The exported type `CommandPageId` is an alias of `string`, deprecated; removed in 2.0 |
| `children` | `ReactNode` | -- | Page content |

Data attributes: `data-command-page`, `data-command-page-id`.

---

## `<Command.AsyncItems>`

Loads items from an async source using React 19 `use()` hook with Suspense integration.

```tsx
import { itemId } from 'modern-cmdk';
import type { CommandItem } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';

// Your data source (app-owned).
async function fetchItems(): Promise<CommandItem[]> {
  return [{ id: itemId('home'), value: 'Home' }];
}

// Created outside render, so the same promise reaches every render.
const itemsPromise = fetchItems();

const asyncItems = (
  <Command.AsyncItems
    items={itemsPromise}
    fallback={<Command.Loading loading>Loading...</Command.Loading>}
  >
    {(items) => items.map((item) => (
      <Command.Item key={item.id} id={item.id} value={item.value}>{item.value}</Command.Item>
    ))}
  </Command.AsyncItems>
);
```

Create the promise outside render (at module scope for static data, or in a per-query cache or a `useMemo` keyed on a deferred query): a new promise on every render, such as `items={fetchItems()}`, suspends again on every render. Each `Command.Item` passes `id={item.id}` because the machine keeps one registration per id: the rendered item and the loaded item are one entry, and an item without an `id` registers under a generated id and counts twice (in development a warning fires when its value is in the batch).

| Prop | Type | Default | Description |
|---|---|---|---|
| `items` | `Promise<readonly CommandItem[]>` | Required | Async item source |
| `fallback` | `ReactNode` | -- | Fallback during loading (passed to `<Suspense>`) |
| `children` | `(items: readonly CommandItem[]) => ReactNode` | Required | Render function for resolved items |

---

## `<Command.Activity>`

Wraps content in React's Activity API (stable since React 19.2). When `mode="hidden"`, React keeps the children mounted with their state and DOM, hides the DOM with `display: none` and cleans up their effects until the mode is visible again. Falls back to conditional rendering if the Activity API is unavailable: hidden children are unmounted and lose their state.

| Prop | Type | Default | Description |
|---|---|---|---|
| `mode` | `'visible' \| 'hidden'` | Required | Whether the content is rendered |
| `children` | `ReactNode` | Required | Content to preserve |

---

## `<CommandErrorBoundary>`

Error boundary for graceful failure recovery in command subtrees. Exported as a named export (not attached to `Command`).

```tsx
import { Command, CommandErrorBoundary } from 'modern-cmdk/react';

const guarded = (
  <CommandErrorBoundary
    fallback={(error, reset) => (
      <div>
        Palette failed: {error.message}{" "}
        <button type="button" onClick={reset}>
          Retry
        </button>
      </div>
    )}
    onError={(error, info) => console.error(error, info.componentStack)}
  >
    <Command>{/* ... */}</Command>
  </CommandErrorBoundary>
);
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | Required | Subtree to guard |
| `fallback` | `ReactNode \| ((error: Error, reset: () => void) => ReactNode)` | `null` | Rendered when an error is caught; a function receives the error and `reset`, which clears the caught error so the children render again |
| `resetKeys` | `readonly unknown[]` | -- | Resets the boundary when an entry changes between renders (`Object.is`, by position, or a different length) |
| `onError` | `(error: Error, errorInfo: ErrorInfo) => void` | -- | Error reporting callback |

---

## Hooks

### `useCommandState(selector?)`

Subscribe to command state via `useSyncExternalStore`. Call with no arguments for the full `CommandState`, or pass a selector to re-render only when the selected value changes:

```tsx
import { useCommandState } from 'modern-cmdk/react';

function ResultCount() {
  const count = useCommandState((state) => state.filteredCount);
  return <span>{count} results</span>;
}
```

### `useCommand(machine)`

Low-level hook that binds a `CommandMachine` to React via `useSyncExternalStore`. `<Command>` uses it internally; reach for it only when building a custom root.

Returns `UseCommandReturn`:

| Field | Type | Description |
|---|---|---|
| `state` | `CommandState` | Current state snapshot |
| `isPending` | `boolean` | Always `false`. Deprecated; read `state.loading` for the machine's loading state. Removed in 2.0 |
| `updateSearch` | `(query: string) => void` | Send a `SEARCH_CHANGE` event to the machine; it is applied on the machine's scheduler tick, not inside a transition |
| `setOptimisticActiveId` | `(id: ItemId \| null) => void` | Sends `ITEM_ACTIVATE` for a non-null `id` and does nothing for `null`. Deprecated; send `ITEM_ACTIVATE` through the machine. Removed in 2.0 |
| `filteredIdSet` | `ReadonlySet<ItemId>` | O(1) membership set for filtered items |
| `id` | `CommandRootId` | Stable SSR-safe root ID (from `useId`) |

### `useRegisterItem(value, options?)`

Register a command item imperatively — auto-deregisters on unmount. Returns the branded `ItemId`. Options: `keywords`, `groupId`, `shortcut`, `disabled`, `onSelect`, `data`, `id`, `forceId` (deprecated; use `id`, removed in 2.0). The registration id is `id ?? forceId ?? useId()`. When `value`, `keywords`, `groupId`, `shortcut` or `disabled` change, the item is updated in place (an `UPDATE_ITEM` event: its position is kept, and so is the active item while it is still listed and enabled) instead of being unregistered and registered again. `onSelect` and `data` are read through refs, so a new function or object per render does not update the item.

### `useRegisterGroup(heading?, options?)`

Register a command group imperatively — auto-deregisters on unmount. Returns the branded `GroupId`. Options: `priority`, `id`, `forceId` (deprecated; use `id`, removed in 2.0). The registration id is `id ?? forceId ?? useId()`.

### `useVirtualizer(options)`

Lightweight list virtualizer built on `ResizeObserver` and scroll tracking. `<Command.List>` uses it internally.

| Option | Type | Default | Description |
|---|---|---|---|
| `count` | `number` | Required | Total item count |
| `estimateSize` | `number` | Required | Estimated item height (px) |
| `overscan` | `number` | `8` | Extra items rendered per direction |
| `scrollElement` | `HTMLElement \| null` | Required | Scroll container |
| `enabled` | `boolean` | `true` | Toggle virtualization |

Returns `{ virtualItems, totalSize, scrollToIndex, measureElement }`.

### `useCommandDevtools(label?, options?)`

Exposes palette internals (registered/filtered item counts, query, active ID, page stack, open/loading state) on `globalThis.__MODERN_CMDK_DEVTOOLS__` (a `Map` keyed by `label`) and in a `modern-cmdk-devtools` `CustomEvent` on `globalThis` (`detail`: `{ label, state }`), for inspection from the browser console. Any script on the page can read both, the search query included. `options.redactQuery: true` publishes the query's length (a number) in place of the query, in the `Map` and in the events; it defaults to `false` in 1.x. `globalThis.__CRIMSON_COMMAND_DEVTOOLS__` (the same `Map`) and the `crimson-command-devtools` event are deprecated aliases of the two names above; removed in 2.0. Development-only — the effect is gated on `process.env.NODE_ENV` and inert in production builds. Call it from a component rendered inside `<Command>`.

### `createKeydownHandler(machine, getState)`

Factory for the root `keydown` handler — `ArrowUp`/`ArrowDown`/`Home`/`End` navigation, `Enter` to select, `Escape` to close, `Backspace` on an empty query to pop the page stack. Used internally by `<Command>`; exported for custom roots.

---

## All Data Attributes

| Attribute | Component |
|---|---|
| `[data-command-root]` | `Command` |
| `[data-command-state]` | `Command` |
| `[data-command-input]` | `Command.Input` |
| `[data-command-list]` | `Command.List` |
| `[data-command-list-inner]` | `Command.List` (non-virtual) |
| `[data-command-list-virtual]` | `Command.List` (virtual) |
| `[data-command-list-status]` | `Command.List` |
| `[data-command-item]` | `Command.Item` |
| `[data-active]` | `Command.Item` (active) |
| `[data-disabled]` | `Command.Item` (disabled) |
| `[data-value]` | `Command.Item` |
| `[data-command-group]` | `Command.Group` |
| `[data-command-group-heading]` | `Command.Group` |
| `[data-command-group-items]` | `Command.Group` |
| `[data-command-empty]` | `Command.Empty` |
| `[data-command-loading]` | `Command.Loading` |
| `[data-command-separator]` | `Command.Separator` |
| `[data-command-dialog]` | `Command.Dialog` |
| `[data-command-overlay]` | `Command.Dialog` |
| `[data-command-dialog-content]` | `Command.Dialog` |
| `[data-command-highlight]` | `Command.Highlight` |
| `[data-command-shortcut]` | `Command.Shortcut` |
| `[data-command-badge]` | `Command.Badge` |
| `[data-command-page]` | `Command.Page` |
| `[data-command-page-id]` | `Command.Page` (the page `id`) |
| `[data-state]` | `Command.Dialog` (overlay and dialog: `"open"` or `"closed"`) |
| `[data-command-aria-live]` | `Command.List` (live region, screen reader only) |

`[data-command-virtual-item]` and `[data-command-scroll-indicator]` are reserved hooks: the stylesheet styles them and no component emits them (for custom rows built on `useVirtualizer`, see the [Theming guide](/guide/theming)).

## All CSS Custom Properties

| Property | Syntax | Default | Description |
|---|---|---|---|
| `--command-list-height` | `<length>` | `0px` | Measured list inner height |
| `--command-count` | `<integer>` | `0` | Declared in the stylesheet, written by no component: it stays `0` unless you set it |
| `--command-overlay-opacity` | `<number>` | `0` | Overlay backdrop opacity |
| `--command-dialog-scale` | `<number>` | `0.96` | Dialog entrance scale |
| `--command-dialog-translate` | `<length>` | `8px` | Dialog entrance translate offset |
| `--command-spring-easing` | -- | `linear(...)` | Easing of the list height and the enter opacity; settles without overshoot |
| `--command-spring-easing-bouncy` | -- | `linear(...)` | Easing of the dialog enter scale and translate; peaks at 1.033 before settling |
| `--command-easing-exit` | -- | `cubic-bezier(0.4, 0, 1, 1)` | Easing of the exit transitions |
| `--command-duration-enter` | -- | `200ms` | Overlay and dialog enter duration |
| `--command-duration-enter-scale` | -- | `250ms` | Dialog enter scale and translate duration |
| `--command-duration-exit` | -- | `150ms` | Exit duration |
| `--command-duration-item` | -- | `120ms` | Item background transition |
| `--command-duration-list` | -- | `200ms` | List height transition |
| `--command-duration-page` | -- | `200ms` | `Command.Page` enter animation |
| `--command-duration-loading` | -- | `1.5s` | `Command.Loading` pulse |
| `--command-scale-from` | -- | `0.96` | Dialog scale at the start of the enter and the end of the exit |
| `--command-translate-from` | -- | `8px` | Dialog (and page) translate offset at the start of the enter |
| `--command-overlay-blur` | -- | `4px` | Overlay backdrop blur |
| `--command-dialog-radius` | -- | `12px` | Border radius of the dialog content |
| `--command-dialog-max-width` | -- | `640px` | Maximum inline size of the dialog content |
| `--command-dialog-max-height` | -- | `480px` | Maximum block size of the dialog content |
| `--command-item-height` | -- | `44px` | Intrinsic size (`contain-intrinsic-size`) an item reserves while `content-visibility: auto` skips its rendering |
| `--command-fade-edge-size` | -- | `16px` | Block size of the list's scroll fade edges |
| `--command-highlight-color` | -- | `oklch(0.85 0.15 90 / 0.3)` | Background of `[data-command-highlight]` |
| `--command-muted-color` | -- | `light-dark(oklch(0.45 0.015 260), oklch(0.75 0.015 260))` | Color of secondary text: group headings, shortcuts, the empty state, the input placeholder |

A `--` in the Syntax column means the property has no registered syntax: it is declared on `[data-command-root]`, outside every `@layer`. See the [Theming guide](/guide/theming) for overriding order.
