---
title: "modern-cmdk/react API"
description: Complete API reference for the React 19 adapter, including all compound components, props, hooks, and data attributes.
---

# modern-cmdk/react

React 19 compound component adapter for `modern-cmdk`. All components use the `"use client"` directive and accept `ref` as a prop (no `forwardRef`).

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

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | -- | Child components |
| `className` | `string` | -- | Class name for the root `<div>` |
| `label` | `string` | `'Command palette'` | Accessible label (`aria-label`) |
| `items` | `CommandItem[]` | `[]` | Pre-registered items |
| `groups` | `CommandGroup[]` | `[]` | Pre-registered groups |
| `filter` | `Function \| false` | built-in | Custom filter function, or `false` to disable |
| `search` | `SearchEngine` | built-in | Pluggable search engine (e.g., WASM) |
| `frecency` | `FrecencyOptions` | -- | Frecency ranking configuration |
| `loop` | `boolean` | `true` | Whether keyboard navigation wraps |
| `open` | `boolean` | `false` | Initial open state |
| `onSelect` | `(id: ItemId) => void` | -- | Fired when an item is selected |
| `onActiveChange` | `(id: ItemId \| null) => void` | -- | Fired when the active item changes |
| `onOpenChange` | `(open: boolean) => void` | -- | Fired when open state changes |
| `onSearchChange` | `(query: string) => void` | -- | Fired when the search query changes |

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

Extends `ComponentPropsWithRef<'input'>` (excluding `value`, `onChange`, `type`, `role`).

| Prop | Type | Default | Description |
|---|---|---|---|
| `ref` | `Ref<HTMLInputElement>` | -- | Ref to the input element |
| `placeholder` | `string` | `'Search...'` | Placeholder text |
| `onValueChange` | `(value: string) => void` | -- | Callback when input value changes |

### Data Attributes

| Attribute | Description |
|---|---|
| `data-command-input` | Always present |

### ARIA

| Attribute | Value |
|---|---|
| `role` | `"combobox"` |
| `aria-expanded` | `true` when `filteredCount > 0` |
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

### Data Attributes

| Attribute | Description |
|---|---|
| `data-command-list` | Always present |
| `data-command-list-inner` | Inner container (non-virtual mode) |
| `data-command-list-virtual` | Inner container (virtual mode) |

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
| `onSelect` | `() => void` | -- | Callback when the item is selected |
| `disabled` | `boolean` | `false` | Whether the item is disabled |
| `shortcut` | `string` | -- | Keyboard shortcut string (e.g., `"Mod+K"`) |
| `forceId` | `string` | -- | Override the auto-generated item ID |

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
| `priority` | `number` | -- | Sort priority (lower = higher in list) |
| `forceId` | `string` | -- | Override the auto-generated group ID |

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

Renders when the `loading` prop is `true`. Without the prop it renders only while the optimistic active-item transition is pending (`isPending`); `state.loading` is never set to `true` by the machine today, so async item loading does not show it on its own, and a search never sets `isPending`. Pass `loading` explicitly (for example `loading` inside a Suspense fallback) to show it.

```tsx
import { Command } from 'modern-cmdk/react';

function Status({ isSearching }: { isSearching: boolean }) {
  return <Command.Loading loading={isSearching}>Searching...</Command.Loading>;
}
```

Extends `ComponentPropsWithRef<'div'>`.

| Prop | Type | Default | Description |
|---|---|---|---|
| `loading` | `boolean` | auto-detected | Override loading state detection |

Data attribute: `data-command-loading`. ARIA: `role="status"`, `aria-busy`, `aria-live="assertive"`.

---

## `<Command.Separator>`

Visual separator between groups or items.

```tsx
import { Command } from 'modern-cmdk/react';

const separator = <Command.Separator />;
```

Extends `ComponentPropsWithRef<'div'>`. Data attribute: `data-command-separator`. ARIA: `role="none"`.

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

Inherits all `CommandMachineOptions` props, plus:

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | -- | Dialog content |
| `className` | `string` | -- | Class name for the `Dialog.Content` wrapper |
| `overlayClassName` | `string` | -- | Class name for the overlay |
| `contentClassName` | `string` | -- | Class name for the inner content container |
| `label` | `string` | `'Command palette'` | Accessible label |
| `description` | `string` | `'Type a command or search...'` | Accessible description for screen readers |
| `open` | `boolean` | -- | Controlled open state (omit for uncontrolled mode) |
| `onOpenChange` | `(open: boolean) => void` | -- | Called when open state changes |
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
| `ranges` | `[number, number][]` | Required | Match ranges from search scorer |
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
| `id` | `string` | Required | Page identifier |
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

const asyncItems = (
  <Command.AsyncItems
    items={fetchItems()}
    fallback={<Command.Loading>Loading...</Command.Loading>}
  >
    {(items) => items.map((item) => (
      <Command.Item key={item.id} value={item.value}>{item.value}</Command.Item>
    ))}
  </Command.AsyncItems>
);
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `items` | `Promise<readonly CommandItem[]>` | Required | Async item source |
| `fallback` | `ReactNode` | -- | Fallback during loading (passed to `<Suspense>`) |
| `children` | `(items: CommandItem[]) => ReactNode` | Required | Render function for resolved items |

---

## `<Command.Activity>`

Wraps content in React's Activity API (stable since React 19.2) for state preservation. When `mode="hidden"`, the component tree is preserved in memory without rendering. Falls back to conditional rendering if the Activity API is unavailable.

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
    fallback={(error) => <div>Palette failed: {error.message}</div>}
    onError={(error, info) => console.error(error, info.componentStack)}
  >
    <Command>{/* ... */}</Command>
  </CommandErrorBoundary>
);
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | Required | Subtree to guard |
| `fallback` | `ReactNode \| ((error: Error) => ReactNode)` | `null` | Rendered when an error is caught |
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

Low-level hook that binds a `CommandMachine` to React via `useSyncExternalStore` and `useOptimistic`, with a transition around the optimistic active-item setter only. `<Command>` uses it internally; reach for it only when building a custom root.

Returns `UseCommandReturn`:

| Field | Type | Description |
|---|---|---|
| `state` | `CommandState` | Current state snapshot |
| `isPending` | `boolean` | `true` while the optimistic active-item transition is pending; never reflects a search |
| `updateSearch` | `(query: string) => void` | Send a `SEARCH_CHANGE` event to the machine; it is applied on the machine's scheduler tick, not inside a transition |
| `setOptimisticActiveId` | `(id: ItemId \| null) => void` | Optimistically highlight an item |
| `filteredIdSet` | `ReadonlySet<ItemId>` | O(1) membership set for filtered items |
| `id` | `CommandRootId` | Stable SSR-safe root ID (from `useId`) |

### `useRegisterItem(value, options?)`

Register a command item imperatively — auto-deregisters on unmount. Returns the branded `ItemId`. Options: `keywords`, `groupId`, `shortcut`, `disabled`, `onSelect`, `data`, `forceId`.

### `useRegisterGroup(heading?, options?)`

Register a command group imperatively — auto-deregisters on unmount. Returns the branded `GroupId`. Options: `priority`, `forceId`.

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

### `useCommandDevtools(label?)`

Exposes palette internals (registered/filtered item counts, query, active ID, page stack, open/loading state) on a global registry (`__CRIMSON_COMMAND_DEVTOOLS__`) for inspection from the browser console. Development-only — the effect is gated on `process.env.NODE_ENV` and inert in production builds. Call it from a component rendered inside `<Command>`.

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
| `[data-command-virtual-item]` | `Command.List` (virtual items) |
| `[data-command-scroll-indicator]` | Scroll progress indicator |
| `[data-command-aria-live]` | Live region (screen reader only) |

## All CSS Custom Properties

| Property | Syntax | Default | Description |
|---|---|---|---|
| `--command-list-height` | `<length>` | `0px` | Measured list inner height |
| `--command-count` | `<integer>` | `0` | Filtered item count |
| `--command-overlay-opacity` | `<number>` | `0` | Overlay backdrop opacity |
| `--command-dialog-scale` | `<number>` | `0.96` | Dialog entrance scale |
| `--command-dialog-translate` | `<length>` | `8px` | Dialog entrance translate offset |
