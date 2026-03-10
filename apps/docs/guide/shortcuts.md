# Keyboard Shortcuts

`modern-cmdk` includes a built-in keyboard shortcut registry. Shortcuts are registered alongside items, displayed via `<Command.Shortcut>`, and active even when the command palette is closed.

## Registering Shortcuts

Add the `shortcut` prop to any `<Command.Item>`:

```tsx
'use client';

import { Command } from 'modern-cmdk/react';

function ShortcutPalette() {
  return (
    <Command>
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Item value="copy" shortcut="Mod+C" onSelect={() => navigator.clipboard.writeText('Hello')}>
          Copy
          <Command.Shortcut shortcut="Mod+C" />
        </Command.Item>
        <Command.Item value="paste" shortcut="Mod+V" onSelect={() => console.log('paste')}>
          Paste
          <Command.Shortcut shortcut="Mod+V" />
        </Command.Item>
        <Command.Item value="save" shortcut="Mod+S" onSelect={() => console.log('save')}>
          Save
          <Command.Shortcut shortcut="Mod+S" />
        </Command.Item>
        <Command.Item value="find" shortcut="Mod+Shift+F" onSelect={() => console.log('find')}>
          Find in Files
          <Command.Shortcut shortcut="Mod+Shift+F" />
        </Command.Item>
      </Command.List>
    </Command>
  );
}
```

## `<Command.Shortcut>` Display Component

`<Command.Shortcut>` renders a platform-aware keyboard shortcut badge. On macOS it shows symbols like `Cmd`, on Windows/Linux it shows `Ctrl`:

```tsx
{/* macOS renders: ⌘C */}
{/* Windows/Linux renders: Ctrl+C */}
<Command.Shortcut shortcut="Mod+C" />

{/* macOS renders: ⌘⇧F */}
{/* Windows/Linux renders: Ctrl+Shift+F */}
<Command.Shortcut shortcut="Mod+Shift+F" />
```

The component renders with `[data-command-shortcut]` for styling:

```css
[data-command-shortcut] {
  display: inline-flex;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

[data-command-shortcut] kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  height: 1.5rem;
  padding-inline: 0.375rem;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  background: var(--color-surface-2);
}
```

## Platform-Aware `Mod` Key

The `Mod` modifier is a cross-platform alias:

| Platform | `Mod` resolves to |
|---|---|
| macOS | `Cmd` (Command) |
| Windows | `Ctrl` |
| Linux | `Ctrl` |

This means `Mod+K` registers as `Cmd+K` on Mac and `Ctrl+K` on Windows/Linux. Users see the correct key for their platform.

## Shortcut Syntax

Shortcuts use a `+`-separated modifier and key format:

```
Modifier+Modifier+Key
```

### Supported Modifiers

| Modifier | Description |
|---|---|
| `Mod` | Platform-aware: Cmd on Mac, Ctrl elsewhere |
| `Ctrl` | Control key (explicit) |
| `Shift` | Shift key |
| `Alt` | Alt key (Option on Mac) |
| `Meta` | Meta key (Cmd on Mac, Win on Windows) |

### Examples

| Shortcut String | macOS | Windows |
|---|---|---|
| `Mod+K` | Cmd+K | Ctrl+K |
| `Mod+Shift+P` | Cmd+Shift+P | Ctrl+Shift+P |
| `Alt+Enter` | Option+Enter | Alt+Enter |
| `Ctrl+Shift+F` | Ctrl+Shift+F | Ctrl+Shift+F |

## Utility Functions

### `parseShortcut(shortcut)`

Parses a shortcut string into a structured `ParsedShortcut` object. Uses `RegExp.escape` (ES2026) internally for safe pattern construction:

```typescript
import { parseShortcut } from 'modern-cmdk';

const parsed = parseShortcut('Mod+Shift+K');
// {
//   modifiers: Set { 'mod', 'shift' },
//   key: 'k',
//   normalized: 'mod+shift+k',
//   platform: { mac: 'meta+shift+k', other: 'ctrl+shift+k' }
// }
```

### `formatShortcut(shortcut, platform?)`

Formats a shortcut string into a human-readable, platform-specific display string:

```typescript
import { formatShortcut } from 'modern-cmdk';

formatShortcut('Mod+Shift+K');
// macOS: '⌘⇧K'
// Windows: 'Ctrl+Shift+K'

formatShortcut('Mod+Shift+K', 'mac');
// Always: '⌘⇧K'

formatShortcut('Mod+Shift+K', 'windows');
// Always: 'Ctrl+Shift+K'
```

### `detectConflicts(shortcuts)`

Detects conflicting keyboard shortcuts using `Map.groupBy` (ES2026):

```typescript
import { parseShortcut, detectConflicts } from 'modern-cmdk';

const shortcuts = [
  parseShortcut('Mod+C'),
  parseShortcut('Mod+C'),   // conflict!
  parseShortcut('Mod+V'),
];

const conflicts = detectConflicts(shortcuts);
// ReadonlyMap {
//   'mod+c' => [ParsedShortcut, ParsedShortcut],
// }
```

::: tip
`detectConflicts` uses `Map.groupBy` internally to group shortcuts by their normalized form, then filters for groups with more than one entry. This is O(n) and runs during registration, not on every keystroke.
:::

## ARIA Integration

Items with shortcuts automatically receive `aria-keyshortcuts` for screen reader discoverability:

```html
<!-- Rendered HTML -->
<div role="option" aria-keyshortcuts="Meta+C" data-command-item data-value="copy">
  Copy
  <kbd data-command-shortcut>⌘C</kbd>
</div>
```

::: warning
Avoid registering shortcuts that conflict with browser defaults (e.g., `Ctrl+T`, `Ctrl+W`, `Ctrl+N`). These cannot be reliably intercepted and will confuse users.
:::
