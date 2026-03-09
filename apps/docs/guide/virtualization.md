# Virtualization

`<Command.List>` includes a built-in virtualization engine that automatically activates when the filtered item count exceeds 100 items. This enables smooth 60fps scrolling even with 10K+ items.

## Automatic Activation

Virtualization is opt-out, not opt-in. When your filtered results exceed the threshold (default: 100), `<Command.List>` automatically switches to virtual scrolling:

```tsx
'use client';

import { Command } from 'modern-cmdk/react';

// Generate 10,000 items using Iterator Helpers
const items = Iterator.range(0, 10_000)
  .map((i) => ({ id: `item-${i}`, label: `Item ${i}`, value: `item-${i}` }))
  .toArray();

function LargeList() {
  return (
    <Command label="Large Dataset">
      <Command.Input placeholder="Search 10,000 items..." />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>
        {items.map((item) => (
          <Command.Item key={item.id} value={item.value} onSelect={() => console.log(item.id)}>
            {item.label}
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}
```

::: tip
You do not need to change any code to benefit from virtualization. The same component API works for 10 items or 100,000 items. The virtualizer activates transparently when needed.
:::

## Opting Out

If you need all items rendered in the DOM (for example, for custom scroll behavior or accessibility testing), disable virtualization:

```tsx
<Command.List virtualize={false}>
  {/* All items render in the DOM — cmdk-compatible behavior */}
</Command.List>
```

::: warning
Disabling virtualization with large datasets (1K+ items) will significantly impact performance. Only opt out when you have a specific reason to render all DOM nodes.
:::

## Configuration

### `estimateSize`

Provide an estimated item height in pixels. This is used for initial layout before items are measured:

```tsx
<Command.List estimateSize={48}>
  {/* Items are estimated at 48px tall until measured */}
</Command.List>
```

The virtualizer uses `ResizeObserver` to measure actual item heights during idle periods via `requestIdleCallback`. The estimate only affects initial render — after measurement, exact heights are used.

### `overscan`

Control how many items are rendered outside the visible viewport. Higher values reduce blank flashes during fast scrolling but use more memory:

```tsx
<Command.List overscan={10}>
  {/* 10 extra items rendered above and below the viewport */}
</Command.List>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `virtualize` | `boolean` | `true` (auto) | Enable/disable virtualization. When `true`, activates automatically at 100+ filtered items. |
| `estimateSize` | `number` | `36` | Estimated item height in pixels for initial layout |
| `overscan` | `number` | `5` | Number of items to render beyond the visible viewport (each direction) |

## CSS Optimization

The virtualizer applies performance-critical CSS automatically. You can also add these styles for additional optimization:

### `content-visibility: auto`

Off-screen items use `content-visibility: auto` to skip rendering of non-visible content:

```css
[data-command-item] {
  content-visibility: auto;
  contain-intrinsic-size: auto 36px;
}
```

### `will-change: transform`

The scroll container uses GPU-composited transforms for positioning:

```css
[data-command-list] {
  will-change: transform;
}
```

### Contain Layout

For maximum performance, apply CSS containment to items:

```css
[data-command-item] {
  contain: layout style paint;
}
```

## Performance Tips for 10K+ Items

::: details Performance Checklist

1. **Use the WASM search engine** for datasets over 5K items. The default TypeScript scorer runs synchronously and can cause input lag at scale. See [WASM Search](/guide/wasm-search).

2. **Keep `estimateSize` accurate.** If your items have consistent heights, an accurate estimate avoids layout shifts during measurement.

3. **Use `keywords` instead of long labels.** The search engine scores against both the `value` and `keywords` — put searchable aliases in `keywords` rather than making item labels longer.

4. **Avoid heavy render functions.** Each visible item renders on every scroll frame. Keep item components lightweight — no inline fetches or heavy computations.

5. **Consider `filter={false}` with server-side search.** For very large datasets, delegate filtering to your API and use `<Command.AsyncItems>` instead of client-side filtering. See [Async Items](/guide/async-items).

6. **Set `overscan` appropriately.** The default `5` works well for most cases. For very fast scrolling scenarios, increase to `10-15`. For memory-constrained environments, decrease to `2-3`.

:::

## How It Works

The virtualizer uses a variable-height virtual scrolling strategy:

1. **Measurement** — `ResizeObserver` measures each item's actual DOM height during `requestIdleCallback`. Falls back to `setTimeout(fn, 0)` if `requestIdleCallback` is unavailable.

2. **Windowing** — Only items within the visible viewport (plus overscan) are rendered in the DOM. Items outside the window are represented by spacer elements.

3. **Positioning** — GPU-composited `transform: translateY()` positions items without triggering layout reflows. `will-change: transform` hints the browser to promote the scroll container to its own compositing layer.

4. **Scroll-to-active** — When keyboard navigation moves the active item outside the visible window, the virtualizer smoothly scrolls to bring it into view.

```
Viewport (visible area):
  ┌──────────────────────┐
  │ [overscan items]     │  ← Rendered but not visible
  │ [visible item 1]     │
  │ [visible item 2]     │  ← What the user sees
  │ [visible item 3]     │
  │ [overscan items]     │  ← Rendered but not visible
  └──────────────────────┘
  [9,990 items NOT in DOM] ← Spacer element with calculated height
```

::: tip
The virtualizer integrates with the `useVirtualizer` hook, which you can also use directly for custom list implementations. See the [API Reference](/api/command-react#usevirtualizer).
:::
