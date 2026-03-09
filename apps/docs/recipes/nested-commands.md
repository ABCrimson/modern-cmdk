# Recipe: Nested Commands (Raycast-Style)

Build multi-level command palettes with page navigation.

```tsx
import { Command } from 'modern-cmdk/react';

function NestedPalette() {
  return (
    <Command.Dialog>
      <Command.Input placeholder="What do you need?" />
      <Command.List>
        <Command.Item value="Projects" onSelect={() => {}}>
          Projects
        </Command.Item>
        <Command.Item value="Settings" onSelect={() => {}}>
          Settings
        </Command.Item>
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

Pages stack — press `Backspace` on empty input to go back. The page stack is maintained by the state machine.
