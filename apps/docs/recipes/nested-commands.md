# Recipe: Nested Commands (Raycast-Style)

Build multi-level command palettes with page navigation.

Page navigation is driven by the state machine's `PAGE_PUSH` / `PAGE_POP` events. Grab the machine from `CommandStableContext` and send `PAGE_PUSH` from an item's `onSelect`:

```tsx
'use client';

import { use, useEffect, useState } from 'react';
import { Command, CommandStableContext } from 'modern-cmdk/react';

function PageLink({ page, children }: { page: string; children: React.ReactNode }) {
  const stable = use(CommandStableContext);
  return (
    <Command.Item
      value={page}
      onSelect={() => stable?.machine.send({ type: 'PAGE_PUSH', page })}
    >
      {children}
    </Command.Item>
  );
}

function NestedPalette() {
  const [open, setOpen] = useState(false);

  // Nothing opens the dialog for you: toggle it from a Mod+K listener (Cmd+K / Ctrl+K).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen}>
      <Command.Input placeholder="What do you need?" />
      <Command.List>
        <Command.Page id="root">
          <PageLink page="projects">Projects</PageLink>
          <PageLink page="settings">Settings</PageLink>
        </Command.Page>

        <Command.Page id="projects">
          <Command.Item value="project-alpha">Project Alpha</Command.Item>
          <Command.Item value="project-beta">Project Beta</Command.Item>
        </Command.Page>

        <Command.Page id="settings">
          <Command.Item value="theme">Theme</Command.Item>
          <Command.Item value="shortcuts">Keyboard Shortcuts</Command.Item>
          <Command.Item value="account">Account</Command.Item>
        </Command.Page>
      </Command.List>
    </Command.Dialog>
  );
}
```

Pages stack — press `Backspace` on an empty input to pop back to the previous page. The page stack lives in the state machine (`state.page` / `state.pageStack`), and each `<Command.Page>` renders only when its `id` matches the active page. The machine starts on the page `root`, so the top-level links sit inside `<Command.Page id="root">`; every page sits inside `Command.List`, which holds the options. The dialog is controlled (`open` and `onOpenChange`): nothing else opens it.
