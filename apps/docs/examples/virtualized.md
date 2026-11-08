---
title: Virtualized List Example
description: Virtualization with 10K items, estimateSize, overscan configuration, and performance optimization.
---

# Virtualized List

Demonstrates the built-in virtualizer with 10,000 items. No configuration is required -- virtualization activates automatically when filtered results exceed 100 items.

Virtualization limits the DOM, not the React tree. Every `<Command.Item>` still mounts and registers with the machine, and each one re-renders when the state changes (it reads the active id and the filtered set from context); only the items in the viewport plus `overscan` render DOM. Mounting 10,000 items costs two scheduler batches, each with one refilter and at most one `stateChange`, not 10,000: the registrations, then a remount when the filtered count crosses 100 and the list swaps its wrapper element, so React unmounts and remounts every `<Command.Item>` (10,000 unregistrations and 10,000 registrations). The adapter has no data-driven path that skips the per-item components, so for far larger lists render fewer `<Command.Item>` elements (search on the server, or page the data) instead of relying on virtualization. No benchmark in this repository measures scrolling frame rate, so this page makes no fps claim.

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

## Combining with WASM Search

The WASM search engine is an unpublished, build-from-source package (see [modern-cmdk-search-wasm](/api/command-search-wasm)). To pair it with virtualization:

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
    let wasmEngine: WasmEngine | null = null;
    async function init() {
      wasmEngine = await createWasmSearchEngine();
      setEngine(wasmEngine);
    }
    init();
    return () => { wasmEngine?.[Symbol.asyncDispose](); };
  }, []);

  if (!engine) return <div>Loading search engine...</div>;

  return (
    <Command search={engine} label="WASM + Virtual">
      <Command.Input placeholder="Fuzzy search 10K items..." />
      <Command.List estimateSize={44} overscan={10}>
        <Command.Empty>No results.</Command.Empty>
        {items.map((item) => (
          <Command.Item key={item.id} value={item.value} onSelect={() => {}}>
            {item.label}
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}
```
