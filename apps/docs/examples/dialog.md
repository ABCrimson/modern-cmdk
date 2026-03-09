---
title: Dialog Example
description: Command palette dialog with Cmd+K trigger, @starting-style animation, and controlled open/close state.
---

# Dialog

A complete command palette dialog triggered by `Cmd+K` (Mac) / `Ctrl+K` (Windows/Linux), with GPU-composited `@starting-style` enter/exit animations.

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { useEffect, useState } from 'react';

export function DialogExample() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <button onClick={() => setOpen(true)}>
        Open Command Palette
        <kbd>Cmd+K</kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Command Menu"
      >
        <Command.Input placeholder="What do you need?" />
        <Command.List>
          <Command.Loading>Searching...</Command.Loading>
          <Command.Empty>No results found.</Command.Empty>

          <Command.Group heading="Navigation">
            <Command.Item value="home" onSelect={() => setOpen(false)}>
              Home
            </Command.Item>
            <Command.Item value="dashboard" onSelect={() => setOpen(false)}>
              Dashboard
            </Command.Item>
            <Command.Item value="settings" onSelect={() => setOpen(false)}>
              Settings
              <Command.Shortcut shortcut="Mod+," />
            </Command.Item>
          </Command.Group>

          <Command.Separator />

          <Command.Group heading="Actions">
            <Command.Item value="new-project" onSelect={() => setOpen(false)}>
              New Project
              <Command.Shortcut shortcut="Mod+N" />
            </Command.Item>
            <Command.Item value="invite-member" onSelect={() => setOpen(false)}>
              Invite Team Member
            </Command.Item>
            <Command.Item value="export" onSelect={() => setOpen(false)}>
              Export Data
              <Command.Shortcut shortcut="Mod+Shift+E" />
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command.Dialog>
    </>
  );
}
```

## Animation CSS

The dialog uses `@starting-style` for zero-JavaScript enter animations and `transition-behavior: allow-discrete` for exit animations:

```css
/* Enter -- spring easing via linear() */
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
    scale 250ms var(--ease-spring),
    translate 250ms var(--ease-spring),
    display 250ms allow-discrete,
    overlay 250ms allow-discrete;
}

/* Exit -- quick fade without spring overshoot */
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

/* Overlay backdrop */
[data-command-overlay][data-state="open"] {
  @starting-style {
    opacity: 0;
  }
  opacity: 1;
  background: oklch(0 0 0 / 0.4);
  backdrop-filter: blur(4px);
  transition: opacity 200ms var(--ease-out-expo);
}
```

::: tip
All animations respect `prefers-reduced-motion: reduce`. When the user prefers reduced motion, transitions complete instantly.
:::
