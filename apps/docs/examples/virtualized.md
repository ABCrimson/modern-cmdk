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

// Generate 10,000 items using Iterator Helpers (ES2026)
const items = Iterator.range(0, 10_000)
  .map((i) => ({
    id: `item-${i}`,
    label: `Item ${i} -- ${['Settings', 'Profile', 'Billing', 'Analytics', 'Security'][i % 5]}`,
    value: `item-${i}`,
    category: ['General', 'Account', 'Finance', 'Data', 'Security'][i % 5]!,
  }))
  .toArray();

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
<Command.List
  estimateSize={64}  // Taller items (64px estimated height)
  overscan={15}      // More overscan for fast scrolling
>
  {/* items */}
</Command.List>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `estimateSize` | `number` | `44` | Estimated item height (px) before measurement |
| `overscan` | `number` | `8` | Extra items rendered beyond the viewport |
| `virtualize` | `boolean` | `true` (auto) | Set to `false` to disable |

## Opting Out

If you need all items in the DOM (e.g., for custom scroll behavior):

```tsx
<Command.List virtualize={false}>
  {/* All items render in the DOM */}
</Command.List>
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

For the best experience with 10K+ items, pair virtualization with the WASM search engine:

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { createWasmSearchEngine } from 'modern-cmdk-search-wasm';
import { useEffect, useState } from 'react';

export function WasmVirtualizedExample() {
  const [engine, setEngine] = useState(null);

  useEffect(() => {
    let wasmEngine: Awaited<ReturnType<typeof createWasmSearchEngine>> | null = null;
    async function init() {
      wasmEngine = await createWasmSearchEngine();
      setEngine(wasmEngine);
    }
    Promise.try(() => init());
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
