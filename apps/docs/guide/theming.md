# Theming

`modern-cmdk` uses OKLCH color space, CSS custom properties, and `data-*` attribute selectors for a fully customizable theming system.

## OKLCH Design Tokens

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
  /* List height — set automatically via ResizeObserver */
  --command-list-height: 0px;

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
You only need to change one variable — `--color-hue` — to create an entirely different color theme. The lightness and chroma values are designed to work with any hue.
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
| `[data-command-item][data-selected]` | `Command.Item` | Selected item |
| `[data-command-group]` | `Command.Group` | Item group container |
| `[data-command-group-heading]` | `Command.Group` | Group heading |
| `[data-command-empty]` | `Command.Empty` | Empty state |
| `[data-command-loading]` | `Command.Loading` | Loading state |
| `[data-command-separator]` | `Command.Separator` | Group separator |
| `[data-command-shortcut]` | `Command.Shortcut` | Shortcut badge |
| `[data-command-badge]` | `Command.Badge` | Category badge |
| `[data-command-dialog]` | `Command.Dialog` | Dialog container |
| `[data-command-dialog-overlay]` | `Command.Dialog` | Dialog overlay |

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

Dialog enter/exit animations use CSS `@starting-style` and `transition-behavior: allow-discrete` for zero-JavaScript animation:

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
