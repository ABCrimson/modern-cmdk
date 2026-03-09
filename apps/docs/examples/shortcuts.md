---
title: Keyboard Shortcuts Example
description: Keyboard shortcut registration, platform-aware display, and conflict detection.
---

# Keyboard Shortcuts

Demonstrates keyboard shortcut registration on items, platform-aware display via `<Command.Shortcut>`, and conflict detection using `Object.groupBy`.

## Shortcut Registration

```tsx
'use client';

import { Command } from 'modern-cmdk/react';

export function ShortcutsExample() {
  return (
    <Command label="Shortcuts Demo">
      <Command.Input placeholder="Search commands..." />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>

        <Command.Group heading="File">
          <Command.Item value="new-file" shortcut="Mod+N" onSelect={() => console.log('New File')}>
            <span>New File</span>
            <Command.Shortcut shortcut="Mod+N" />
          </Command.Item>
          <Command.Item value="open-file" shortcut="Mod+O" onSelect={() => console.log('Open File')}>
            <span>Open File</span>
            <Command.Shortcut shortcut="Mod+O" />
          </Command.Item>
          <Command.Item value="save" shortcut="Mod+S" onSelect={() => console.log('Save')}>
            <span>Save</span>
            <Command.Shortcut shortcut="Mod+S" />
          </Command.Item>
          <Command.Item value="save-as" shortcut="Mod+Shift+S" onSelect={() => console.log('Save As')}>
            <span>Save As</span>
            <Command.Shortcut shortcut="Mod+Shift+S" />
          </Command.Item>
        </Command.Group>

        <Command.Separator />

        <Command.Group heading="Edit">
          <Command.Item value="undo" shortcut="Mod+Z" onSelect={() => console.log('Undo')}>
            <span>Undo</span>
            <Command.Shortcut shortcut="Mod+Z" />
          </Command.Item>
          <Command.Item value="redo" shortcut="Mod+Shift+Z" onSelect={() => console.log('Redo')}>
            <span>Redo</span>
            <Command.Shortcut shortcut="Mod+Shift+Z" />
          </Command.Item>
          <Command.Item value="find" shortcut="Mod+F" onSelect={() => console.log('Find')}>
            <span>Find</span>
            <Command.Shortcut shortcut="Mod+F" />
          </Command.Item>
          <Command.Item value="find-replace" shortcut="Mod+Shift+F" onSelect={() => console.log('Find and Replace')}>
            <span>Find and Replace</span>
            <Command.Shortcut shortcut="Mod+Shift+F" />
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command>
  );
}
```

The `shortcut` prop on `<Command.Item>` registers the shortcut globally. Pressing `Cmd+N` (Mac) or `Ctrl+N` (Windows) fires the item `onSelect` even when the palette is closed.

## Conflict Detection

Detect conflicting shortcuts at runtime using `detectConflicts`:

```typescript
import { parseShortcut, detectConflicts } from 'modern-cmdk';

const shortcuts = [
  parseShortcut('Mod+S'),
  parseShortcut('Mod+S'),       // conflict with above
  parseShortcut('Mod+Shift+S'),  // no conflict (different shortcut)
];

const conflicts = detectConflicts(shortcuts);
// Map { 'meta+s' => [ParsedShortcut, ParsedShortcut] }

for (const [normalized, group] of conflicts) {
  console.warn(`Conflict on "${normalized}": ${group.length} bindings`);
}
```

`detectConflicts` uses `Object.groupBy` internally to group shortcuts by their normalized form, then filters groups with more than one entry. This runs in O(n) time.

## Platform-Aware Display

`<Command.Shortcut>` renders platform-appropriate symbols:

```tsx
{/* macOS: Cmd+N  |  Windows: Ctrl+N */}
<Command.Shortcut shortcut="Mod+N" />

{/* macOS: Cmd+Shift+S  |  Windows: Ctrl+Shift+S */}
<Command.Shortcut shortcut="Mod+Shift+S" />

{/* macOS: Option+Enter  |  Windows: Alt+Enter */}
<Command.Shortcut shortcut="Alt+Enter" />
```

## Shortcut Styling

Style shortcut badges via the `[data-command-shortcut]` selector:

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
