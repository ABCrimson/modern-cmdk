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

`<Command.Shortcut>` renders a platform-aware keyboard shortcut badge. On macOS it shows glyphs like `⌘`, on Windows/Linux it shows `Ctrl`. The platform is read through `useSyncExternalStore` with a neutral server snapshot: the server and the hydration pass render the text for `'other'` (`Ctrl+C`), so the HTML matches on every platform, and the client then re-renders with the detected platform (`packages/modern-cmdk/src/react/shortcut.tsx:21-30`):

```tsx
import { Command } from 'modern-cmdk/react';

export function ShortcutBadges() {
  return (
    <>
      {/* macOS renders: ⌘C */}
      {/* Windows/Linux renders: Ctrl+C */}
      <Command.Shortcut shortcut="Mod+C" />

      {/* macOS renders: ⌘⇧F */}
      {/* Windows/Linux renders: Ctrl+Shift+F */}
      <Command.Shortcut shortcut="Mod+Shift+F" />
    </>
  );
}
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

### `parseShortcut(shortcut, platform?)`

Parses a shortcut string into a structured `ParsedShortcut` object. It splits on `+`, resolves modifier aliases such as `Mod`, and normalizes the key. The optional `platform` is a `ShortcutPlatform` (`'mac' | 'other'`): `Mod` resolves to Meta on `'mac'` and to Ctrl on `'other'`. Without it the platform is read from `navigator` when the function is called (`'other'` where there is no `navigator`), so importing `modern-cmdk` reads no platform (`packages/modern-cmdk/src/core/keyboard/parser.ts:24-37`, `:60`):

```typescript
import { parseShortcut } from 'modern-cmdk';

const parsed = parseShortcut('Mod+Shift+K');
// {
//   key: 'k',
//   meta: false,
//   ctrl: true,
//   shift: true,
//   alt: false,
//   raw: 'Mod+Shift+K',
//   normalized: 'ctrl+shift+k'  // 'meta+shift+k' on macOS
// }

parseShortcut('Mod+Shift+K', 'mac').normalized; // 'meta+shift+k' on every platform
parseShortcut('Mod+Shift+K', 'other').normalized; // 'ctrl+shift+k' on every platform
```

### `formatShortcut(parsed, platform?)`

Formats a parsed shortcut (the result of `parseShortcut`) into a human-readable display string using the symbols for the platform: the `platform` argument, or the platform read from `navigator` when the function is called. Pass `'other'` to render the same text on a server and in the hydration pass (`parser.ts:118-124`):

```typescript
import { formatShortcut, parseShortcut } from 'modern-cmdk';

formatShortcut(parseShortcut('Mod+Shift+K'));
// macOS: '⌘⇧K'
// Windows/Linux: 'Ctrl+Shift+K'

formatShortcut(parseShortcut('Mod+Shift+K', 'other'), 'other'); // 'Ctrl+Shift+K' everywhere
```

### `detectConflicts(shortcuts)`

Detects conflicting keyboard shortcuts by grouping shortcuts by normalized form:

```typescript
import { parseShortcut, detectConflicts } from 'modern-cmdk';

const shortcuts = [
  parseShortcut('Mod+C'),
  parseShortcut('Mod+C'),   // conflict!
  parseShortcut('Mod+V'),
];

const conflicts = detectConflicts(shortcuts);
// ReadonlyMap {
//   'ctrl+c' => [ParsedShortcut, ParsedShortcut],  // 'meta+c' on macOS
// }
```

::: tip
`detectConflicts` is a plain function: it groups the shortcuts you pass by their normalized form, keeps the groups with more than one entry and returns them. It runs in O(n) when you call it. The registry never calls it during registration and logs no warning on a conflict; ask for the conflicts when you want them (see below).
:::

## How the Registry Resolves Conflicts

The machine binds each item's `shortcut` in a `KeyboardShortcutRegistry`, which `machine.getKeyboardRegistry()` returns. Bindings are kept in a stack per normalized key (`Mod+K` and `mod+k` are the same key), one binding per item:

- When two items share a key, the later binding handles the keydown. Removing it, or disposing the `Disposable` that `register()` returns, makes the earlier one handle the key again.
- Re-binding an item on the key it already holds, which is what an `UPDATE_ITEM` does, replaces its binding in place and keeps its position in the stack, so updating the earlier of two items does not make it win the key.
- `getConflicts()` returns the keys with two or more bindings (the parsed shortcuts, earliest first), computed on demand. `getBindings()` returns a snapshot of the winning binding of every key.
- `unregister(shortcut)` removes every binding of that key. `unregisterByItem(itemId, keep?)` removes the item's bindings, except the one on the `keep` shortcut.

```typescript
import { createCommandMachine, itemId, parseShortcut } from 'modern-cmdk';

const machine = createCommandMachine({
  items: [
    { id: itemId('copy'), value: 'Copy', shortcut: 'Mod+K', onSelect: () => console.log('copy') },
    { id: itemId('clear'), value: 'Clear', shortcut: 'Mod+K', onSelect: () => console.log('clear') },
  ],
});

const registry = machine.getKeyboardRegistry();
for (const [key, shortcuts] of registry.getConflicts()) {
  console.warn(`${shortcuts.length} items share ${key}`); // "2 items share ctrl+k" ('meta+k' on macOS)
}
registry.getBindings().get(parseShortcut('Mod+K').normalized)?.itemId; // 'clear': the later binding handles the key

// Dispose on teardown, not at module top level: dispose removes the global shortcut listener.
export function teardown(): void {
  machine[Symbol.dispose]();
}
```

What an item's shortcut does follows its state and the `shortcutAction` option:

- A disabled item is not bound at all: its shortcut does nothing and leaves the key to the page and to other items. Enabling it through `UPDATE_ITEM` binds it.
- With `shortcutAction: 'direct'` (the default through 1.x) the shortcut calls the item's `onSelect` and binds only items that have one. With `'select'` it dispatches `ITEM_SELECT`, so the item's `onSelect`, the machine's `onSelect` option, the `select` event and frecency all run, and every enabled item with a shortcut is bound. 2.0 makes `'select'` the default.
- Items delivered by an `ITEMS_LOADED` event (`<Command.AsyncItems>`) bind their shortcuts like any other item.

## ARIA Integration

Items with shortcuts automatically receive `aria-keyshortcuts` for screen reader discoverability:

```html
<!-- Rendered HTML -->
<div role="option" aria-keyshortcuts="Mod+C" data-command-item data-value="copy">
  Copy
  <kbd data-command-shortcut>⌘C</kbd>
</div>
```

::: warning
Avoid registering shortcuts that conflict with browser defaults (e.g., `Ctrl+T`, `Ctrl+W`, `Ctrl+N`). These cannot be reliably intercepted and will confuse users.
:::
