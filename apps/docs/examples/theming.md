---
title: Theming Example
description: Custom theme with OKLCH color variables, dark mode, and spring easing animations.
---

# Custom Theme

Demonstrates theming by overriding OKLCH CSS custom properties. Change a single `--color-hue` variable to shift the entire palette.

## Hue Override

```tsx
'use client';

import { Command } from '@crimson_dev/command-react';

export function ThemedExample() {
  return (
    <div style={{ '--color-hue': 145 } as React.CSSProperties}>
      <Command label="Green Theme">
        <Command.Input placeholder="Search..." />
        <Command.List>
          <Command.Empty>No results.</Command.Empty>

          <Command.Group heading="Actions">
            <Command.Item value="deploy" onSelect={() => console.log('Deploy')}>
              Deploy to Production
              <Command.Badge>New</Command.Badge>
            </Command.Item>
            <Command.Item value="rollback" onSelect={() => console.log('Rollback')}>
              Rollback Deployment
            </Command.Item>
            <Command.Item value="logs" onSelect={() => console.log('Logs')}>
              View Logs
              <Command.Shortcut shortcut="Mod+L" />
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
```

## Custom Color Palette

Override individual design tokens for full control:

```css
/* Ocean theme */
.theme-ocean {
  --color-hue: 210;
  --color-primary: oklch(0.60 0.22 210);
  --color-primary-hover: oklch(0.55 0.25 210);
  --color-primary-subtle: oklch(0.95 0.04 210);
  --color-surface-0: oklch(0.98 0.005 210);
  --color-surface-1: oklch(0.96 0.008 210);
  --color-surface-2: oklch(0.94 0.010 210);
  --color-text: oklch(0.15 0.02 210);
  --color-text-muted: oklch(0.50 0.02 210);
  --color-border: oklch(0.88 0.015 210);
}

/* Rose theme */
.theme-rose {
  --color-hue: 350;
  --color-primary: oklch(0.65 0.22 350);
  --color-primary-hover: oklch(0.60 0.25 350);
  --color-primary-subtle: oklch(0.95 0.04 350);
  --color-surface-0: oklch(0.99 0.003 350);
  --color-surface-1: oklch(0.97 0.005 350);
  --color-text: oklch(0.18 0.02 350);
  --color-border: oklch(0.90 0.012 350);
}

/* Amber theme */
.theme-amber {
  --color-hue: 85;
  --color-primary: oklch(0.70 0.18 85);
  --color-primary-hover: oklch(0.65 0.20 85);
  --color-primary-subtle: oklch(0.96 0.05 85);
  --color-surface-0: oklch(0.99 0.003 85);
  --color-text: oklch(0.20 0.02 85);
  --color-border: oklch(0.90 0.012 85);
}
```

## Dark Mode Automatic Inversion

OKLCH enables dark mode by flipping lightness values. The same hue and chroma produce visually consistent results:

```css
@media (prefers-color-scheme: dark) {
  .theme-ocean {
    --color-primary: oklch(0.75 0.18 210);
    --color-surface-0: oklch(0.14 0.01 210);
    --color-surface-1: oklch(0.17 0.015 210);
    --color-surface-2: oklch(0.20 0.018 210);
    --color-text: oklch(0.92 0.01 210);
    --color-text-muted: oklch(0.58 0.015 210);
    --color-border: oklch(0.28 0.02 210);
  }
}
```

## Full Styled Example

```css
[data-command-root] {
  background: var(--color-surface-1);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 16px 70px oklch(0 0 0 / 0.15);
  font-family: var(--font-sans);
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
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

[data-command-separator] {
  height: 1px;
  margin: 4px 0;
  background: var(--color-border);
}

[data-command-empty] {
  padding: 24px;
  text-align: center;
  color: var(--color-text-muted);
}
```

## Theme Switcher

```tsx
'use client';

import { Command } from '@crimson_dev/command-react';
import { useState } from 'react';

const themes = [
  { value: 'purple', hue: 265, label: 'Purple (Default)' },
  { value: 'blue', hue: 240, label: 'Blue' },
  { value: 'green', hue: 145, label: 'Green' },
  { value: 'rose', hue: 350, label: 'Rose' },
  { value: 'amber', hue: 85, label: 'Amber' },
];

export function ThemeSwitcherExample() {
  const [hue, setHue] = useState(265);

  return (
    <div style={{ '--color-hue': hue } as React.CSSProperties}>
      <Command label="Theme Switcher">
        <Command.Input placeholder="Pick a theme..." />
        <Command.List>
          <Command.Empty>No themes found.</Command.Empty>
          {themes.map((theme) => (
            <Command.Item
              key={theme.value}
              value={theme.value}
              keywords={[theme.label]}
              onSelect={() => setHue(theme.hue)}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: `oklch(0.65 0.25 ${theme.hue})`,
                  display: 'inline-block',
                  marginRight: 8,
                }}
              />
              {theme.label}
            </Command.Item>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
```

::: tip
Since OKLCH is perceptually uniform, changing just `--color-hue` produces a cohesive palette at any hue angle. No manual tuning of lightness or saturation is needed.
:::
