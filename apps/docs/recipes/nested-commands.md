# Recipe: Nested Commands (Raycast-Style)

Build multi-level command palettes with page navigation.

Page navigation is driven by the state machine's `PAGE_PUSH` / `PAGE_POP` events. Grab the machine from `CommandStableContext` and send `PAGE_PUSH` from an item's `onSelect`:

```tsx
'use client';

import { use } from 'react';
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
  return (
    <Command.Dialog>
      <Command.Input placeholder="What do you need?" />
      <Command.List>
        <PageLink page="projects">Projects</PageLink>
        <PageLink page="settings">Settings</PageLink>
      </Command.List>

      <Command.Page id="projects">
        <Command.Item value="project-alpha">Project Alpha</Command.Item>
        <Command.Item value="project-beta">Project Beta</Command.Item>
      </Command.Page>

      <Command.Page id="settings">
        <Command.Item value="theme">Theme</Command.Item>
        <Command.Item value="shortcuts">Keyboard Shortcuts</Command.Item>
        <Command.Item value="account">Account</Command.Item>
      </Command.Page>
    </Command.Dialog>
  );
}
```

Pages stack — press `Backspace` on an empty input to pop back to the previous page. The page stack lives in the state machine (`state.page` / `state.pageStack`), and each `<Command.Page>` renders only when its `id` matches the active page.
