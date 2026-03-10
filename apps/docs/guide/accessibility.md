# Accessibility

`modern-cmdk` implements the full [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) with live regions, forced-colors support, and motion preferences. The goal is a Lighthouse accessibility score of 100.

## WAI-ARIA Combobox Pattern

The command palette follows the ARIA combobox with listbox popup pattern:

```html
<!-- Rendered HTML structure -->
<div data-command-root>
  <input
    role="combobox"
    aria-expanded="true"
    aria-controls="command-list-:r1:"
    aria-activedescendant="command-item-:r3:"
    aria-autocomplete="list"
    aria-label="Command palette"
    data-command-input
  />

  <div
    role="listbox"
    id="command-list-:r1:"
    aria-label="Command palette"
    data-command-list
  >
    <div role="group" aria-labelledby="group-heading-:r2:" data-command-group>
      <div id="group-heading-:r2:" data-command-group-heading>Actions</div>

      <div
        role="option"
        id="command-item-:r3:"
        aria-selected="true"
        aria-keyshortcuts="Meta+C"
        data-command-item
        data-active
      >
        Copy
      </div>

      <div
        role="option"
        id="command-item-:r4:"
        aria-selected="false"
        aria-disabled="true"
        data-command-item
        data-disabled
      >
        Paste (disabled)
      </div>
    </div>
  </div>
</div>
```

### Key ARIA Attributes

| Attribute | Element | Purpose |
|---|---|---|
| `role="combobox"` | Input | Identifies the input as a combobox control |
| `aria-expanded` | Input | Whether the listbox popup is visible |
| `aria-controls` | Input | Points to the listbox element ID |
| `aria-activedescendant` | Input | Points to the currently active option ID |
| `aria-autocomplete="list"` | Input | Indicates the input provides a list of suggestions |
| `role="listbox"` | List | Identifies the results container as a listbox |
| `role="option"` | Item | Identifies each result as a selectable option |
| `aria-selected` | Item | Whether the option is currently active |
| `aria-disabled` | Item | Whether the option is disabled |
| `role="group"` | Group | Groups related options with a heading |
| `aria-labelledby` | Group | Points to the group heading element ID |
| `aria-keyshortcuts` | Item | Keyboard shortcut for the item (if registered) |

## `aria-activedescendant` Updates

Focus remains on the input at all times. The active item is communicated to assistive technology via `aria-activedescendant`, which updates as the user navigates with arrow keys:

```
User presses ArrowDown
  → Input: aria-activedescendant="command-item-:r4:"
  → Previous item: aria-selected="false", data-active removed
  → New item: aria-selected="true", data-active added
```

This pattern keeps keyboard focus on the input so users can continue typing while navigating results.

## `aria-live` Region for Result Announcements

When the search query changes and results are filtered, a live region announces the result count:

```html
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
  class="sr-only"
>
  5 results available
</div>
```

The announcement updates on every filter change so screen readers always reflect the current result count.

::: tip
The live region uses `aria-live="polite"` so announcements wait until the user pauses. This prevents interrupting screen reader output during active typing.
:::

## `role="status"` for Empty State

When no results match the query, `<Command.Empty>` renders with `role="status"` to announce the empty state:

```html
<div role="status" data-command-empty>
  No results found.
</div>
```

## Loading State

During async data loading, `<Command.Loading>` sets `aria-busy="true"` on the list:

```html
<div role="listbox" aria-busy="true" data-command-list>
  <div role="status" data-command-loading>
    Searching...
  </div>
</div>
```

## `forced-colors: active` Support

Windows High Contrast mode is fully supported. When `forced-colors: active` is detected, all custom colors are replaced with system colors:

```css
@media (forced-colors: active) {
  [data-command-root] {
    border: 1px solid ButtonBorder;
    background: Canvas;
    color: CanvasText;
  }

  [data-command-item][data-active] {
    background: Highlight;
    color: HighlightText;
    forced-color-adjust: none;
  }

  [data-command-input] {
    border-bottom: 1px solid ButtonBorder;
    color: CanvasText;
  }

  [data-command-input]:focus-visible {
    outline: 2px solid Highlight;
  }

  [data-command-shortcut] kbd {
    border-color: ButtonBorder;
    background: Canvas;
    color: CanvasText;
  }
}
```

::: warning
Never use `forced-color-adjust: none` on the root container. Only apply it to specific elements that need to preserve custom appearance (like the active item highlight) where system colors would be misleading.
:::

## `prefers-reduced-motion: reduce` Handling

All animations and transitions are gated behind `prefers-reduced-motion: no-preference`. When reduced motion is preferred, transitions complete instantly:

```css
@media (prefers-reduced-motion: reduce) {
  [data-command-dialog],
  [data-command-dialog-overlay],
  [data-command-item],
  [data-command-list] {
    transition-duration: 0ms !important;
    animation-duration: 0ms !important;
  }
}
```

This applies to:
- Dialog enter/exit animations (`@starting-style`, `scale`, `translate`, `opacity`)
- Item highlight transitions (`background-color`)
- List height transitions (`--command-list-height`)
- Scroll-driven animations (`animation-timeline`)
- Loading spinner animations

## `prefers-contrast: more` Enhancements

Users who request increased contrast get enhanced visual indicators:

```css
@media (prefers-contrast: more) {
  :root {
    --color-border: oklch(0.50 0.02 var(--color-hue));
    --color-text-muted: oklch(0.35 0.03 var(--color-hue));
  }

  [data-command-item][data-active] {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  [data-command-input]:focus-visible {
    outline: 3px solid var(--color-primary);
    outline-offset: -3px;
  }

  [data-command-separator] {
    border-color: var(--color-border);
  }
}
```

## Keyboard Navigation

Full keyboard navigation support:

| Key | Action |
|---|---|
| `ArrowDown` | Move to next item |
| `ArrowUp` | Move to previous item |
| `Home` | Move to first item |
| `End` | Move to last item |
| `Enter` | Select the active item |
| `Escape` | Close the dialog (in Dialog mode) |
| `Backspace` (empty input) | Pop to previous page (in multi-page mode) |

### Navigation Looping

By default, navigation loops — pressing `ArrowDown` on the last item wraps to the first item, and vice versa. Disable with `loop={false}`:

```tsx
<Command loop={false}>
  {/* Navigation stops at first/last item */}
</Command>
```

### Focus Management in Dialog Mode

When `<Command.Dialog>` opens:
1. Focus is trapped within the dialog via Radix Dialog focus management
2. Focus moves to `<Command.Input>` automatically
3. Background content is marked with the `inert` attribute (native browser support)
4. Pressing `Escape` closes the dialog and returns focus to the previously focused element

```tsx
<Command.Dialog open={open} onOpenChange={setOpen}>
  {/* Focus is trapped here */}
  <Command.Input placeholder="Search..." />
  <Command.List>
    {/* ... */}
  </Command.List>
</Command.Dialog>
```

## Visible Focus Indicators

The active item has a visible focus indicator styled via `[data-command-item][data-active]`. This is GPU-composited for smooth transitions:

```css
[data-command-item][data-active] {
  background: var(--color-primary-subtle);
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
  /* GPU layer promotion */
  transform: translate3d(0, 0, 0);
}

[data-command-item]:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: -2px;
}
```

## Screen Reader Testing

Recommended screen readers for testing:

| Platform | Screen Reader | Browser |
|---|---|---|
| macOS | VoiceOver | Safari |
| Windows | NVDA | Firefox or Chrome |
| Windows | JAWS | Chrome |
| Android | TalkBack | Chrome |
| iOS | VoiceOver | Safari |

::: details Expected Announcements

When the palette opens:
> "Command palette, combobox, type a command, expanded"

When typing a query and results filter:
> "5 results available"

When navigating with ArrowDown:
> "Copy, option 1 of 5, selected"

When selecting with Enter:
> (Action executes, dialog may close)

When no results match:
> "No results found."
:::
