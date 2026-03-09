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
<Command.Item
  value="copy"
  shortcut="Mod+C"
  onSelect={handleCopy}
>
  Copy
  <Command.Shortcut shortcut="Mod+C" />
</Command.Item>
```

## Search Match Highlighting

Use `Command.Highlight` to show where the search query matched:

```tsx
<Command.Item value="application settings">
  <Command.Highlight
    text="Application Settings"
    ranges={[/* match ranges from scorer */]}
  />
</Command.Item>
```

## Component Reference

| Component | Purpose |
|---|---|
| `Command` / `Command.Root` | Root container and state machine provider |
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
