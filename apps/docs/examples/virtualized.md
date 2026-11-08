---
title: Virtualized List Example
description: Virtualization with 10K items, estimateSize, overscan configuration, and performance optimization.
---

# Virtualized List

Demonstrates the built-in virtualizer with 10,000 items. No configuration is required -- virtualization activates automatically when filtered results exceed 100 items.

Virtualization limits the DOM, not the React tree. Every `<Command.Item>` still mounts and registers with the machine, and each one re-renders when the state changes (it reads the active id and the filtered set from context); only the items in the viewport plus `overscan` render DOM. The list renders one element tree in both modes: crossing the 100-match threshold changes the props of the inner element only, so the `<Command.Item>` elements stay mounted and registered, and nothing unregisters or registers again. The adapter has no data-driven path that skips the per-item components, so for far larger lists render fewer `<Command.Item>` elements (search on the server, or page the data) instead of relying on virtualization. No benchmark in this repository measures scrolling frame rate, so this page makes no fps claim.

## 10K Items

```tsx
'use client';

import { Command } from 'modern-cmdk/react';

// Generate 10,000 items
const categories = ['General', 'Account', 'Finance', 'Data', 'Security'];
const labels = ['Settings', 'Profile', 'Billing', 'Analytics', 'Security'];
const items = Array.from({ length: 10_000 }, (_, i) => ({
  id: `item-${i}`,
  label: `Item ${i} -- ${labels[i % 5]}`,
  value: `item-${i}`,
  category: categories[i % 5]!,
}));

export function VirtualizedExample() {
  return (
    <Command label="Large Dataset">
      <Command.Input placeholder="Search 10,000 items..." />
      <Command.List estimateSize={44} overscan={10}>
        <Command.Empty>No results.</Command.Empty>
        {items.map((item) => (
          <Command.Item
            key={item.id}
            id={item.id}
            value={item.value}
            keywords={[item.category]}
            onSelect={() => console.log('Selected:', item.id)}
          >
            {item.label}
            <Command.Badge>{item.category}</Command.Badge>
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}
```

## Custom Configuration

Tune the virtualizer for your specific use case:

```tsx
import { Command } from 'modern-cmdk/react';

export function TunedList() {
  return (
    <Command label="Tuned virtualizer">
      <Command.List
        estimateSize={64} // Taller items (64px estimated height)
        overscan={15} // More overscan for fast scrolling
      >
        {/* items */}
      </Command.List>
    </Command>
  );
}
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `estimateSize` | `number` | `44` | Estimated item height (px) before measurement |
| `overscan` | `number` | `8` | Extra items rendered beyond the viewport |
| `virtualize` | `boolean` | unset (auto) | Unset: virtualizes above 100 filtered items and stops again at 50 or fewer. `true` forces it on; `false` disables it |

## Opting Out

If you need all items in the DOM (e.g., for custom scroll behavior):

```tsx
import { Command } from 'modern-cmdk/react';

export function UnvirtualizedList() {
  return (
    <Command label="All items in the DOM">
      <Command.List virtualize={false}>
        {/* All items render in the DOM */}
      </Command.List>
    </Command>
  );
}
```

::: warning
Disabling virtualization with 1K+ items will significantly impact performance.
:::

## Scrolling and List Height

`Command.List` scrolls the active item into view when it changes: in virtual mode through the virtualizer's `scrollToIndex(index, align)`, otherwise with `scrollIntoView`. The list calls it with `'nearest'`: a row fully in view does not scroll, a row above meets the top edge, and a row below meets the bottom edge. `scrollToIndex` of `useVirtualizer` (exported from `modern-cmdk/react`) takes `align` `'start'` (the default) or `'nearest'`.

The list sets `--command-list-height` on its scroll element to the content height of its inner element. While the list is virtual the inner element's height is the sum of all row sizes, so the observer ignores it and the property keeps its last non-virtual value (`0px` when the list mounts virtual). A `height: var(--command-list-height)` rule therefore does not grow to the full 10,000-row height.

## Performance CSS

Add these styles for additional rendering optimization:

```css
[data-command-item] {
  content-visibility: auto;
  contain-intrinsic-size: auto 44px;
  contain: layout style paint;
}

[data-command-list] {
  will-change: transform;
}
```

## Supplying a Search Engine

`searchEngine` takes any `SearchEngine`; the list virtualizes on the filtered count whatever engine ranked the results. The WASM search engine is an unpublished, build-from-source package (see [modern-cmdk-search-wasm](/api/command-search-wasm)); `createWasmSearchEngine()` resolves to the WASM engine or, when the module fails to load, the TypeScript fallback engine. This page makes no speed claim for either.

A search engine you pass is yours to dispose: the machine disposes only an engine it created itself, so it neither disposes yours on unmount nor when it suspends and resumes. The component below creates the engine, so it disposes the engine once, in its effect cleanup.

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { createWasmSearchEngine, type FallbackSearchEngine, type WasmSearchEngine } from 'modern-cmdk-search-wasm';
import { useEffect, useState } from 'react';

// The factory resolves to the WASM engine or the TypeScript fallback engine (both types are exported)
type WasmEngine = WasmSearchEngine | FallbackSearchEngine;

const items = Array.from({ length: 10_000 }, (_, i) => ({
  id: `item-${i}`,
  label: `Item ${i}`,
  value: `item-${i}`,
}));

export function WasmVirtualizedExample() {
  const [engine, setEngine] = useState<WasmEngine | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: WasmEngine | null = null;

    void createWasmSearchEngine().then((next) => {
      if (cancelled) {
        // The effect was cleaned up while the engine loaded: nothing else owns it
        void next[Symbol.asyncDispose]();
        return;
      }
      created = next;
      setEngine(next);
    });

    return () => {
      cancelled = true;
      setEngine(null);
      void created?.[Symbol.asyncDispose]();
    };
  }, []);

  if (!engine) return <div>Loading search engine...</div>;

  return (
    <Command searchEngine={engine} label="Virtual list with a supplied engine">
      <Command.Input placeholder="Search 10K items..." />
      <Command.List estimateSize={44} overscan={10}>
        <Command.Empty>No results.</Command.Empty>
        {items.map((item) => (
          <Command.Item key={item.id} id={item.id} value={item.value} onSelect={() => {}}>
            {item.label}
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}
```
