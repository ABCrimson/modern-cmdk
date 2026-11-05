# Virtualization

`<Command.List>` includes a built-in virtualization engine that automatically activates when the filtered item count exceeds 100 items. This enables smooth 60fps scrolling even with 10K+ items.

## Automatic Activation

Virtualization is opt-out, not opt-in. When more than 100 items match (a fixed threshold; it switches off again at 50 or fewer), `<Command.List>` automatically switches to virtual scrolling:

```tsx
'use client';

import { Command } from 'modern-cmdk/react';

// Generate 10,000 items
const items = Array.from({ length: 10_000 }, (_, i) => ({
  id: `item-${i}`,
  label: `Item ${i}`,
  value: `item-${i}`,
}));

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
import { Command } from 'modern-cmdk/react';

export function FullDomPalette() {
  return (
    <Command>
      <Command.Input placeholder="Search..." />
      <Command.List virtualize={false}>
        {/* All items render in the DOM — cmdk-compatible behavior */}
      </Command.List>
    </Command>
  );
}
```

::: warning
Disabling virtualization with large datasets (1K+ items) will significantly impact performance. Only opt out when you have a specific reason to render all DOM nodes.
:::

## Configuration

### `estimateSize`

Provide an estimated item height in pixels. This is used for initial layout before items are measured:

```tsx
import { Command } from 'modern-cmdk/react';

export function TallItemsPalette() {
  return (
    <Command>
      <Command.Input placeholder="Search..." />
      <Command.List estimateSize={48}>
        {/* Items are estimated at 48px tall until measured */}
      </Command.List>
    </Command>
  );
}
```

The virtualizer uses `ResizeObserver` to measure actual item heights during idle periods via `requestIdleCallback`. The estimate only affects initial render — after measurement, exact heights are used.

### `overscan`

Control how many items are rendered outside the visible viewport. Higher values reduce blank flashes during fast scrolling but use more memory:

```tsx
import { Command } from 'modern-cmdk/react';

export function OverscanPalette() {
  return (
    <Command>
      <Command.Input placeholder="Search..." />
      <Command.List overscan={10}>
        {/* 10 extra items rendered above and below the viewport */}
      </Command.List>
    </Command>
  );
}
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `virtualize` | `boolean \| undefined` | `undefined` (auto) | Leave unset for automatic activation. `true` forces virtualization on at any count; `false` forces it off. |
| `estimateSize` | `number` | `44` | Estimated item height in pixels for initial layout |
| `overscan` | `number` | `8` | Number of items to render beyond the visible viewport (each direction) |

::: tip Automatic mode uses hysteresis
In auto mode virtualization turns **on** above 100 filtered items and only turns back
**off** at 50 or below. The gap between the two edges keeps a result count hovering around
100 from flipping the list between virtualized and full-DOM rendering on every keystroke.
Passing an explicit `virtualize` value bypasses both edges.
:::

## CSS Optimization

The shipped stylesheet (`modern-cmdk/styles.css`) applies every rule below; none needs adding to your own stylesheet.

### `content-visibility: auto`

Every item (`[data-command-item]`) carries `content-visibility: auto` so the browser can skip rendering work for off-screen items (`styles.css:210-216`):

```css
[data-command-item] {
  content-visibility: auto;
  contain-intrinsic-size: auto var(--command-item-height); /* 44px by default */
}
```

The stylesheet also has a `[data-command-virtual-item]` rule with the same two declarations (`styles.css:227-230`). It is a reserved hook for custom rows built on `useVirtualizer`; no component emits that attribute (see the [Theming guide](/guide/theming)).

### `will-change: transform`

When the list virtualizes, the virtual list element (`[data-command-list-virtual]`, rendered at `list.tsx:170`) carries `will-change: transform` (`styles.css:232-235`). Each visible item is absolutely positioned and offset with the individual CSS `translate` property (`item.tsx:79`). The offset is the item's start position inside the list (`use-virtualizer.ts:98-102`), so it does not change while the list scrolls; the browser's own scrolling of `[data-command-list]` moves the rows:

```css
[data-command-list-virtual] {
  position: relative;
  will-change: transform;
}
```

### Contain Layout

The shipped stylesheet applies `contain: layout style paint` to the list's inner wrapper, `[data-command-list-inner]` (`styles.css:203-206`), which renders only when the list does not virtualize (`list.tsx:176`). Items need no containment rule of their own: `content-visibility: auto` on `[data-command-item]` (`styles.css:215`) already turns on layout, style and paint containment for every item (CSS Containment Level 2), so paint containment can clip an item's descendants, for example a child's focus ring or shadow drawn outside the item's box.

## Performance Tips for 10K+ Items

::: details Performance Checklist

1. **Watch search cost at scale.** The default TypeScript scorer runs synchronously and can cause input lag at scale. The WASM search engine is designed for this case but does not work yet; see [WASM Search](/guide/wasm-search).

2. **Keep `estimateSize` accurate.** If your items have consistent heights, an accurate estimate avoids layout shifts during measurement.

3. **Use `keywords` instead of long labels.** The search engine scores against both the `value` and `keywords` — put searchable aliases in `keywords` rather than making item labels longer.

4. **Avoid heavy render functions.** Each visible item renders on every scroll frame. Keep item components lightweight — no inline fetches or heavy computations.

5. **Consider `filter={false}` with server-side search.** For very large datasets, delegate filtering to your API and use `<Command.AsyncItems>` instead of client-side filtering. See [Async Items](/guide/async-items).

6. **Set `overscan` appropriately.** The default `8` works well for most cases. For very fast scrolling scenarios, increase to `10-15`. For memory-constrained environments, decrease to `2-3`.

:::

## How It Works

The virtualizer uses a variable-height virtual scrolling strategy:

1. **Measurement** — `ResizeObserver` measures each item's actual DOM height during `requestIdleCallback`. Falls back to `setTimeout(fn, 0)` if `requestIdleCallback` is unavailable.

2. **Windowing** — Only items within the visible viewport (plus overscan) are rendered in the DOM. Items outside the window are not rendered (`item.tsx:73`); `[data-command-list-virtual]` takes the height of every item together (`list.tsx:171`), so the scrollbar spans the whole list.

3. **Positioning** — Each visible item is absolutely positioned and offset with the individual CSS `translate` property (`item.tsx:79`), and `[data-command-list-virtual]` carries `will-change: transform` (`styles.css:234`), a hint that the element's transform will change.

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
  [9,990 items NOT in DOM] ← [data-command-list-virtual] keeps their height
```

::: tip
The virtualizer integrates with the `useVirtualizer` hook, which you can also use directly for custom list implementations. See the [API Reference](/api/command-react#usevirtualizer-options).
:::
