# Theming

`modern-cmdk/styles.css` is themed through `--command-*` custom properties declared on `[data-command-root]` and through `data-*` attribute selectors. The OKLCH tokens below (`--color-hue`, `--color-*`, `--ease-*`, `--transition-*`) belong to this documentation site's theme (`apps/docs/.vitepress/theme/styles/vars.css`). They are an example to copy into your own stylesheet.

## OKLCH Design Tokens

::: info
These tokens belong to this documentation site's theme, not to the library. `modern-cmdk/styles.css` does not read `--color-hue` or any `--color-*`, `--ease-*` or `--transition-*` token. Its own tokens are the `--command-*` custom properties declared on `[data-command-root]`.
:::

All colors use the [OKLCH color space](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch) for perceptually uniform lightness. This means dark mode is achieved by inverting lightness values while preserving chroma and hue.

The base hue is controlled by a single CSS custom property:

```css
@property --color-hue {
  syntax: "<number>";
  inherits: true;
  initial-value: 265;
}
```

Change `--color-hue` to shift the entire color palette:

```css
/* Purple theme (default) */
:root { --color-hue: 265; }

/* Blue theme */
:root { --color-hue: 240; }

/* Green theme */
:root { --color-hue: 145; }

/* Rose theme */
:root { --color-hue: 350; }
```

## CSS Custom Properties

### Color Tokens

```css
:root {
  /* Primary palette */
  --color-primary:          oklch(0.65 0.25 var(--color-hue));
  --color-primary-hover:    oklch(0.60 0.28 var(--color-hue));
  --color-primary-active:   oklch(0.55 0.30 var(--color-hue));
  --color-primary-subtle:   oklch(0.95 0.05 var(--color-hue));

  /* Surface hierarchy — 4 levels for depth */
  --color-surface-0:        oklch(0.99 0.002 var(--color-hue));
  --color-surface-1:        oklch(0.97 0.005 var(--color-hue));
  --color-surface-2:        oklch(0.95 0.008 var(--color-hue));
  --color-surface-3:        oklch(0.93 0.010 var(--color-hue));
  --color-surface-overlay:  oklch(0.99 0.002 var(--color-hue) / 0.9);

  /* Text hierarchy */
  --color-text:             oklch(0.20 0.02 var(--color-hue));
  --color-text-secondary:   oklch(0.40 0.02 var(--color-hue));
  --color-text-muted:       oklch(0.55 0.02 var(--color-hue));
  --color-text-on-primary:  oklch(0.99 0.005 var(--color-hue));

  /* Borders */
  --color-border:           oklch(0.90 0.01 var(--color-hue));
  --color-border-hover:     oklch(0.80 0.02 var(--color-hue));
  --color-border-focus:     oklch(0.65 0.25 var(--color-hue) / 0.5);

  /* Semantic colors */
  --color-success:          oklch(0.72 0.19 145);
  --color-warning:          oklch(0.80 0.18 85);
  --color-danger:           oklch(0.65 0.25 25);
  --color-info:             oklch(0.68 0.20 240);
}
```

### Component Layout Tokens

```css
:root {
  /* List height — set automatically on Command.List via ResizeObserver; while the list is virtual it keeps its last non-virtual value */
  --command-list-height: 0px;
}
```

### Library Tokens

These are the custom properties `modern-cmdk/styles.css` declares on `[data-command-root]`, with their defaults. Override them on `[data-command-root]` in unlayered CSS loaded after `modern-cmdk/styles.css`, or on a more specific unlayered selector. That block sits outside every `@layer`, so a normal (non-`!important`) value set inside a layer (Tailwind's `@layer base` or `@layer components` included) loses whatever its selector, and a value set on `:root` is shadowed. Until 1.8.0 the dialog and overlay tokens (`--command-spring-easing`, `--command-spring-easing-bouncy`, `--command-easing-exit`, `--command-duration-enter`, `--command-duration-enter-scale`, `--command-duration-exit`, `--command-scale-from`, `--command-translate-from`, `--command-overlay-blur`, `--command-dialog-radius`, `--command-dialog-max-width`, `--command-dialog-max-height`) are the exception: the rules that read them sit on `[data-command-overlay]`, `[data-command-dialog]` and `[data-command-dialog-content]`, outside the root, so neither the defaults below nor an override on `[data-command-root]` reaches them, and you set them on those elements (all twelve of them, because one unset token voids the whole `transition`, `backdrop-filter` or size declaration that reads it; for example `[data-command-overlay], [data-command-dialog] { --command-spring-easing: ease-out; --command-spring-easing-bouncy: ease-out; --command-easing-exit: cubic-bezier(0.4, 0, 1, 1); --command-duration-enter: 200ms; --command-duration-enter-scale: 250ms; --command-duration-exit: 150ms; --command-scale-from: 0.96; --command-translate-from: 8px; --command-overlay-blur: 4px; --command-dialog-radius: 12px; --command-dialog-max-width: 640px; --command-dialog-max-height: 480px; }`) or on `:root`, which the portalled dialog inherits because no library declaration shadows it there.

| Property | Default |
|---|---|
| `--command-spring-easing` | `linear(...)` |
| `--command-spring-easing-bouncy` | `linear(...)` |
| `--command-easing-exit` | `cubic-bezier(0.4, 0, 1, 1)` |
| `--command-duration-enter` | `200ms` |
| `--command-duration-enter-scale` | `250ms` |
| `--command-duration-exit` | `150ms` |
| `--command-duration-item` | `120ms` |
| `--command-duration-list` | `200ms` |
| `--command-duration-page` | `200ms` |
| `--command-duration-loading` | `1.5s` |
| `--command-scale-from` | `0.96` |
| `--command-translate-from` | `8px` |
| `--command-overlay-blur` | `4px` |
| `--command-dialog-radius` | `12px` |
| `--command-dialog-max-width` | `640px` |
| `--command-dialog-max-height` | `480px` |
| `--command-item-height` | `44px` |
| `--command-fade-edge-size` | `16px` |
| `--command-highlight-color` | `oklch(0.85 0.15 90 / 0.3)` |
| `--command-muted-color` | `light-dark(oklch(0.45 0.015 260), oklch(0.75 0.015 260))` |

### Docs-site motion tokens (example)

```css
:root {
  /* Transitions */
  --ease-out-expo:    cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out-expo: cubic-bezier(0.87, 0, 0.13, 1);
  --ease-spring:      linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32%, 1.051 36.4%, 1.017 38.8%, 0.991, 0.977 43%, 0.974 44.8%, 0.975 47.2%, 0.997 53.3%, 1.003 55.5%, 1.003 58.1%, 1 63.2%, 0.999 70.2%, 1);

  --transition-fast:   120ms var(--ease-out-expo);
  --transition-normal: 200ms var(--ease-out-expo);
  --transition-slow:   350ms var(--ease-out-expo);
  --transition-spring: 500ms var(--ease-spring);
}
```

### Muted Text Token

`--command-muted-color` colours secondary text: group headings, shortcuts, the empty state and the input placeholder. Since 1.3.0 it replaces fading with opacity, so the contrast against your own text colour can be checked. The default is declared on `[data-command-root]` and follows the page's used `color-scheme`; override it on that selector, since a value set on `:root` is shadowed there:

```css
[data-command-root] {
  --command-muted-color: light-dark(oklch(0.45 0.015 260), oklch(0.75 0.015 260));
}
```

Under `prefers-contrast: more`, group headings use the full text colour instead.

## Dark Mode via OKLCH Lightness Inversion

Dark mode is achieved by flipping OKLCH lightness values. Since OKLCH is perceptually uniform, the same chroma and hue produce visually consistent results across light and dark:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-primary:          oklch(0.75 0.20 var(--color-hue));
    --color-primary-hover:    oklch(0.80 0.22 var(--color-hue));
    --color-surface-0:        oklch(0.15 0.01 var(--color-hue));
    --color-surface-1:        oklch(0.18 0.015 var(--color-hue));
    --color-surface-2:        oklch(0.21 0.018 var(--color-hue));
    --color-surface-3:        oklch(0.24 0.020 var(--color-hue));
    --color-surface-overlay:  oklch(0.15 0.01 var(--color-hue) / 0.9);
    --color-text:             oklch(0.93 0.01 var(--color-hue));
    --color-text-secondary:   oklch(0.75 0.015 var(--color-hue));
    --color-text-muted:       oklch(0.60 0.015 var(--color-hue));
    --color-border:           oklch(0.30 0.02 var(--color-hue));
    --color-border-hover:     oklch(0.40 0.03 var(--color-hue));
  }
}
```

::: tip
In this site's theme, one variable (`--color-hue`) shifts the whole palette. The lightness and chroma values are designed to work with any hue. To get the same effect with `modern-cmdk/styles.css`, define your own `--color-*` tokens and map them onto the `--command-*` properties on `[data-command-root]`.
:::

## `data-*` Attribute Selectors

Every component renders with a `data-command-*` attribute for styling. No class names are imposed:

| Selector | Component | Description |
|---|---|---|
| `[data-command-root]` | `Command` | Root container |
| `[data-command-input]` | `Command.Input` | Search input |
| `[data-command-list]` | `Command.List` | Scrollable results list |
| `[data-command-item]` | `Command.Item` | Individual item |
| `[data-command-item][data-active]` | `Command.Item` | Currently active (highlighted) item |
| `[data-command-item][data-disabled]` | `Command.Item` | Disabled item |
| `[data-command-group]` | `Command.Group` | Item group container |
| `[data-command-group-heading]` | `Command.Group` | Group heading |
| `[data-command-empty]` | `Command.Empty` | Empty state |
| `[data-command-loading]` | `Command.Loading` | Loading state |
| `[data-command-separator]` | `Command.Separator` | Group separator |
| `[data-command-shortcut]` | `Command.Shortcut` | Shortcut badge |
| `[data-command-badge]` | `Command.Badge` | Category badge |
| `[data-command-highlight]` | `Command.Highlight` | Matched character run inside an item |
| `[data-command-page]` | `Command.Page` | Nested page container (carries `data-command-page-id`) |
| `[data-command-dialog]` | `Command.Dialog` | Dialog root |
| `[data-command-dialog-content]` | `Command.Dialog` | Radix dialog content wrapper |
| `[data-command-overlay]` | `Command.Dialog` | Dialog overlay (backdrop) |

<details>
<summary>Structural attributes (layout internals)</summary>

These are emitted by the list, group and root internals. They are stable enough to style,
but they are implementation surface rather than a component-per-attribute mapping.

| Selector | Emitted by | Description |
|---|---|---|
| `[data-command-state]` | `Command` | Root open state -- the value is `"open"` or `"closed"` |
| `[data-command-group-items]` | `Command.Group` | Wrapper around a group's options |
| `[data-command-list-inner]` | `Command.List` | Content wrapper, carries the attribute **only** when not virtualizing |
| `[data-command-list-virtual]` | `Command.List` | Sized spacer, carries the attribute **only** while virtualizing |
| `[data-command-list-status]` | `Command.List` | Portal target for `Command.Empty`, kept outside the listbox for valid ARIA |
| `[data-command-aria-live]` | `Command.List` | Visually hidden result-count live region |

`[data-command-list-inner]` and `[data-command-list-virtual]` are mutually exclusive --
selecting on one is a reliable way to style only one virtualization mode.

> [!NOTE]
> `styles.css` also ships rules for `[data-command-virtual-item]` and
> `[data-command-scroll-indicator]`, but **no component currently emits either attribute**.
> They are styling hooks reserved for custom rows built on the `useVirtualizer` hook; the
> built-in list does not render a scroll-progress element. The scroll-driven timelines of the list fade edges and of `[data-command-scroll-indicator]` sit inside `@supports (animation-timeline: scroll())` (Chrome and Edge 115, Firefox 159, Safari 26, web-features `scroll-driven-animations` 3.45.0-dev-20261110231328-ed6bd69): below that the fade edges stay at `opacity: 0`.

</details>

### Example Styling

```css
[data-command-root] {
  background: var(--color-surface-1);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 16px 70px oklch(0 0 0 / 0.15);
}

[data-command-input] {
  width: 100%;
  padding: 12px 16px;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  font-size: 1rem;
  outline: none;
}

[data-command-item] {
  padding: 8px 16px;
  cursor: pointer;
  color: var(--color-text);
  transition: background var(--transition-fast);
}

[data-command-item][data-active] {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

[data-command-item][data-disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

[data-command-group-heading] {
  padding: 8px 16px 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

## `forced-colors` Support

Windows High Contrast mode is fully supported via `@media (forced-colors: active)`:

```css
@media (forced-colors: active) {
  [data-command-root] {
    border: 1px solid ButtonBorder;
  }

  [data-command-item][data-active] {
    background: Highlight;
    color: HighlightText;
    forced-color-adjust: none;
  }

  [data-command-input] {
    border-bottom: 1px solid ButtonBorder;
  }

  [data-command-shortcut] kbd {
    border-color: ButtonBorder;
  }
}
```

## `prefers-contrast` Support

Enhanced contrast for users who request it:

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
}
```

## Spring Easing via `linear()` CSS Function

The `--ease-spring` token uses the `linear()` CSS function to approximate spring physics without JavaScript:

```css
--ease-spring: linear(
  0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%,
  0.723 12.9%, 0.938 16.7%, 1.017, 1.077,
  1.121, 1.149 24.3%, 1.159, 1.163, 1.161,
  1.154 29.9%, 1.129 32%, 1.051 36.4%,
  1.017 38.8%, 0.991, 0.977 43%, 0.974 44.8%,
  0.975 47.2%, 0.997 53.3%, 1.003 55.5%,
  1.003 58.1%, 1 63.2%, 0.999 70.2%, 1
);
```

Use it for bouncy, natural-feeling transitions:

```css
[data-command-dialog][data-state="open"] {
  @starting-style {
    opacity: 0;
    scale: 0.96;
    translate: 0 8px;
  }
  opacity: 1;
  scale: 1;
  translate: 0 0;
  transition:
    opacity 200ms var(--ease-out-expo),
    scale 500ms var(--ease-spring),
    translate 500ms var(--ease-spring),
    display 200ms allow-discrete,
    overlay 200ms allow-discrete;
}
```

## Dialog Animations

Dialog enter and exit animations use CSS `@starting-style` and `transition-behavior: allow-discrete`. Until 1.8.0 the tokens these rules read are not defined outside `[data-command-root]`, so the transitions only run once you set them on `[data-command-dialog]` and `[data-command-overlay]` or on `:root` (see Library Tokens above):

```css
/* Enter */
[data-command-dialog][data-state="open"] {
  @starting-style {
    opacity: 0;
    scale: 0.96;
    translate: 0 8px;
  }
  opacity: 1;
  scale: 1;
  translate: 0 0;
  transition:
    opacity 200ms var(--ease-out-expo),
    scale 200ms var(--ease-out-expo),
    translate 200ms var(--ease-out-expo),
    display 200ms allow-discrete,
    overlay 200ms allow-discrete;
}

/* Exit */
[data-command-dialog][data-state="closed"] {
  opacity: 0;
  scale: 0.96;
  translate: 0 4px;
  transition:
    opacity 150ms cubic-bezier(0.4, 0, 1, 1),
    scale 150ms cubic-bezier(0.4, 0, 1, 1),
    translate 150ms cubic-bezier(0.4, 0, 1, 1),
    display 150ms allow-discrete,
    overlay 150ms allow-discrete;
}
```

::: warning
All animations respect `prefers-reduced-motion: reduce`. When reduced motion is preferred, transitions are instant (0ms duration). See the [Accessibility](/guide/accessibility) guide.
:::
