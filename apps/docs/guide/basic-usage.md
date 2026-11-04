# Basic Usage

## Minimal Example

```tsx
'use client';

import { Command } from 'modern-cmdk/react';

function CommandPalette() {
  return (
    <Command>
      <Command.Input placeholder="Type a command..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>
        <Command.Group heading="Actions">
          <Command.Item value="copy" onSelect={() => navigator.clipboard.writeText('Hello')}>
            Copy to clipboard
          </Command.Item>
          <Command.Item value="paste" onSelect={() => console.log('paste')}>
            Paste
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command>
  );
}
```

## Dialog Mode

Wrap in `Command.Dialog` for a modal command palette:

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { useState } from 'react';

function App() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open Command Palette</button>

      <Command.Dialog open={open} onOpenChange={setOpen}>
        <Command.Input placeholder="Search..." />
        <Command.List>
          <Command.Empty>No results.</Command.Empty>
          <Command.Item value="home" onSelect={() => setOpen(false)}>
            Go Home
          </Command.Item>
        </Command.List>
      </Command.Dialog>
    </>
  );
}
```

## Keyboard Shortcuts

Items can register global keyboard shortcuts:

```tsx
import { Command } from 'modern-cmdk/react';

export function CopyPalette() {
  return (
    <Command>
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Item
          value="copy"
          shortcut="Mod+C"
          onSelect={() => void navigator.clipboard.writeText(window.location.href)}
        >
          Copy
          <Command.Shortcut shortcut="Mod+C" />
        </Command.Item>
      </Command.List>
    </Command>
  );
}
```

## Search Match Highlighting

Use `Command.Highlight` to show where the search query matched. `ranges` takes half-open `[start, end)` tuples; the core's `scoreItem(query, item)` returns them as `matches`. They index the item's `value` unless one of its `keywords` scores higher, in which case they index that keyword; this item has no keywords, so they always index its label:

```tsx
import { itemId, scoreItem } from 'modern-cmdk';
import { Command, useCommandState } from 'modern-cmdk/react';

const settings = { id: itemId('settings'), value: 'Application Settings' };

function HighlightedLabel() {
  const query = useCommandState((state) => state.search);
  const ranges = scoreItem(query, settings)?.matches ?? [];

  return <Command.Highlight text={settings.value} ranges={ranges} />;
}

export function HighlightedItem() {
  return (
    <Command>
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Item value={settings.value}>
          <HighlightedLabel />
        </Command.Item>
      </Command.List>
    </Command>
  );
}
```

## Component Reference

| Component | Purpose |
|---|---|
| `Command` | Root container and state machine provider |
| `Command.Input` | Search input with ARIA combobox role |
| `Command.List` | Scrollable results list with automatic virtualization |
| `Command.Item` | Individual command item |
| `Command.Group` | Group of related items with heading |
| `Command.Empty` | Shown when no results match |
| `Command.Loading` | Shown during async loading |
| `Command.Separator` | Visual separator between groups |
| `Command.Dialog` | Modal dialog wrapper |
| `Command.Highlight` | Search match highlighting |
| `Command.Shortcut` | Keyboard shortcut badge |
| `Command.Badge` | Category/type badge |
| `Command.Page` | Multi-page navigation |
| `Command.AsyncItems` | Async data source with Suspense |
| `Command.Activity` | State preservation via the React Activity API |
