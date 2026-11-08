# Virtualization

`<Command.List>` includes a built-in virtualization engine that automatically activates when the filtered item count exceeds 100 items. Only the rows in the viewport (plus overscan) render DOM nodes, so a long result list keeps the page's DOM small. Every `<Command.Item>` element you render still mounts and registers with the machine; virtualization skips off-screen DOM, not the registration work. The count it compares includes disabled items (they are listed unless `disabledItems="hide"` is set on `<Command>`).

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
You do not need to change any code to benefit from virtualization. The same component API works with and without it. The virtualizer activates transparently when needed.
:::

`Command.List` renders one element tree in both modes. Crossing the 100-match threshold changes the props of the inner element only (`data-command-list-inner` becomes `data-command-list-virtual`, and the element takes a fixed height and `position: relative`), so the items stay mounted when the match count crosses it (`list.tsx:197-206`).

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
Disabling virtualization puts a DOM node in the page for every matching item, which costs layout and paint time on large datasets (1K+ items). Only opt out when you have a specific reason to render all DOM nodes.
:::

## Configuration

### `estimateSize`

Provide the item height in pixels. `Command.List` gives every row this height (it measures no item):

```tsx
import { Command } from 'modern-cmdk/react';

export function TallItemsPalette() {
  return (
    <Command>
      <Command.Input placeholder="Search..." />
      <Command.List estimateSize={48}>
        {/* Every row is placed as 48px tall */}
      </Command.List>
    </Command>
  );
}
```

`Command.List` measures no item: the `ResizeObserver` it uses tracks only the list's own height. `measureElement` from `useVirtualizer` measures the rows of a custom list during `requestIdleCallback`, and those measured heights replace the estimate.

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

## `--command-list-height`

`Command.List` writes the measured height of its inner element, rounded to one decimal and suffixed with `px`, to the `--command-list-height` custom property of the list element. While the list is virtual the inner element's height is the sum of all the row sizes, which would defeat a `height: var(--command-list-height)` rule, so the observer ignores it: the property keeps its last non-virtual value (`0px` when the list mounts virtual) and does not follow the virtual content height (`list.tsx:71-84`, `list.tsx:126`).

## CSS Optimization

The shipped stylesheet (`modern-cmdk/styles.css`) applies every rule below; none needs adding to your own stylesheet.

### `content-visibility: auto`

Every item (`[data-command-item]`) carries `content-visibility: auto` so the browser can skip rendering work for off-screen items (`styles.css:209-210`):

```css
[data-command-item] {
  content-visibility: auto;
  contain-intrinsic-size: auto var(--command-item-height); /* 44px by default */
}
```

The stylesheet also has a `[data-command-virtual-item]` rule with the same two declarations (`styles.css:221-224`). It is a reserved hook for custom rows built on `useVirtualizer`; no component emits that attribute (see the [Theming guide](/guide/theming)).

### `will-change: transform`

When the list virtualizes, the virtual list element (`[data-command-list-virtual]`, set on the inner element at `list.tsx:201`) carries `will-change: transform` (`styles.css:226-229`). Each visible item is absolutely positioned and offset with the individual CSS `translate` property (`item.tsx:104`). The offset is the item's start position inside the list (`use-virtualizer.ts:106`), so it does not change while the list scrolls; the browser's own scrolling of `[data-command-list]` moves the rows:

```css
[data-command-list-virtual] {
  position: relative;
  will-change: transform;
}
```

### Contain Layout

The shipped stylesheet applies `contain: layout style paint` to the list's inner wrapper, `[data-command-list-inner]` (`styles.css:196-199`), which carries the attribute only while the list does not virtualize (`list.tsx:200`). Items need no containment rule of their own: `content-visibility: auto` on `[data-command-item]` (`styles.css:209`) already turns on layout, style and paint containment for every item (CSS Containment Level 2), so paint containment can clip an item's descendants, for example a child's focus ring or shadow drawn outside the item's box.

## Performance Tips for 10K+ Items

::: details Performance Checklist

1. **Watch search cost at scale.** The default TypeScript scorer runs on the main thread each time the machine refilters: once for every `SEARCH_CHANGE` (one per keystroke, even when several keystrokes land in the same scheduler batch), and once more at the end of a batch that registered, updated or removed items while a query is set. It can cause input lag at scale. The WASM search engine is designed for this case but does not work yet; see [WASM Search](/guide/wasm-search). A search engine you pass as `searchEngine` is yours to dispose: the machine disposes only an engine it created itself, and an engine you pass survives the machine's dispose, suspend and resume.

2. **Keep `estimateSize` accurate.** Set `estimateSize` to the rendered row height: rows are placed at multiples of it, so a wrong value overlaps rows or leaves gaps.

3. **Use `keywords` instead of long labels.** The search engine scores against both the `value` and `keywords` — put searchable aliases in `keywords` rather than making item labels longer.

4. **Avoid heavy render functions.** While the list virtualizes, every mounted `<Command.Item>`, visible or not, re-renders on each scroll event (the visible window is recomputed), and only the visible ones produce DOM. Keep item components lightweight — no inline fetches or heavy computations.

5. **Consider `filter={false}` with server-side search.** For very large datasets, delegate filtering to your API and use `<Command.AsyncItems>` instead of client-side filtering. See [Async Items](/guide/async-items).

6. **Set `overscan` appropriately.** The default `8` works well for most cases. For very fast scrolling scenarios, increase to `10-15`. For memory-constrained environments, decrease to `2-3`.

:::

## How It Works

The virtualizer uses a variable-height virtual scrolling strategy:

1. **Sizing** — `Command.List` gives every row `estimateSize` pixels (it measures no item); the `ResizeObserver` tracks only the list's height. `measureElement` from `useVirtualizer` measures the rows of a custom list during `requestIdleCallback` (`setTimeout(fn, 0)` without it).

2. **Windowing** — Only items within the visible viewport (plus overscan) render DOM nodes. A `<Command.Item>` outside the window still mounts and registers, but returns no DOM (`item.tsx:98`); `[data-command-list-virtual]` takes the height of every item together (`list.tsx:203-205`), so the scrollbar spans the whole list.

3. **Positioning** — Each visible item is absolutely positioned and offset with the individual CSS `translate` property (`item.tsx:104`), and `[data-command-list-virtual]` carries `will-change: transform` (`styles.css:228`), a hint that the element's transform will change.

4. **Scroll-to-active** — When the active item changes, the list scrolls it just into view (`'nearest'`): a row that is fully in view does not scroll, a row above meets the top edge and a row below meets the bottom edge. A virtual list scrolls by index with `scrollToIndex(index, 'nearest')` at once (`behavior: 'instant'`); a list that is not virtual calls `scrollIntoView({ block: 'nearest', behavior: 'smooth' })`. An active row under the pointer is not scrolled (`list.tsx:103-121`).

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

The `scrollToIndex(index, align = 'start')` that `useVirtualizer` returns takes an `align` of `'start'` or `'nearest'`. With `'start'` it sets `scrollTop` to the row's offset among the rows, so the row meets the top edge only when nothing precedes the rows, padding included. With `'nearest'` it measures from the element's first child, where the rows start: a row fully in view does not scroll, a row above meets the top edge, and a row below or partly below meets the bottom edge (`hooks/use-virtualizer.ts:26-32`, `:122-146`). `Command.List` scrolls the active row with `'nearest'`.

::: tip
The virtualizer integrates with the `useVirtualizer` hook, which you can also use directly for custom list implementations. See the [API Reference](/api/command-react#usevirtualizer-options).
:::
