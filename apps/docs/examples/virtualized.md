---
title: Virtualized List Example
description: Virtualization with 10K items, estimateSize, overscan configuration, and performance optimization.
---

# Virtualized List

Demonstrates smooth 60fps scrolling with 10,000 items using the built-in virtualizer. No configuration is required -- virtualization activates automatically when filtered results exceed 100 items.

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
import { createWasmSearchEngine } from 'modern-cmdk-search-wasm';
import { useEffect, useState } from 'react';

// The factory resolves to the WASM engine or the TypeScript fallback engine
type WasmEngine = Awaited<ReturnType<typeof createWasmSearchEngine>>;

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
