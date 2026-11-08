# Controlled Dialog

`Command.Dialog` opens when its `open` prop becomes `true` and closes when it becomes `false`. Escape and overlay clicks close the dialog and then call `onOpenChange(false)`, so pass your setter (`onOpenChange={setOpen}`) to keep your state in step. Without `open`, nothing opens the dialog. Every open change goes through the machine on its next scheduler batch (the next animation frame in a browser): the dialog sends `OPEN` or `CLOSE`, the machine calls `onOpenChange` with that value, and then it emits the batch's single `stateChange`, which closes or opens the DOM when React renders it (`react/dialog.tsx`; `core/machine.ts` `setOpen()`, `commit()`). The machine calls `onOpenChange` for every `OPEN` and `CLOSE` it handles, whether the value changed or not, so the callback also echoes your own prop: on mount and after every change of `open`, and a single user close (Escape, an overlay click) can call it more than once with the same value. A state setter ignores the repeats; make any other handler idempotent.

## Controlled Mode

Pass `open` and `onOpenChange` to control the dialog state:

```tsx
import { Command } from 'modern-cmdk/react';
import { useState } from 'react';

function App() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open Commands</button>
      <Command.Dialog open={open} onOpenChange={setOpen}>
        <Command.Input />
        <Command.List>
          <Command.Item value="close" onSelect={() => setOpen(false)}>Close</Command.Item>
        </Command.List>
      </Command.Dialog>
    </>
  );
}
```

## URL-Driven State

Sync dialog state with URL search params:

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { useRouter, useSearchParams } from 'next/navigation';

function CommandPalette() {
  const router = useRouter();
  const params = useSearchParams();
  const open = params.get('cmd') === '1';

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(isOpen: boolean) => {
        if (isOpen === open) return; // the machine also echoes the prop: do nothing when the URL already matches
        const next = new URLSearchParams(params);
        if (isOpen) next.set('cmd', '1');
        else next.delete('cmd');
        router.replace(`?${next.toString()}`);
      }}
    >
      <Command.Input placeholder="Search commands..." />
      <Command.List>{/* command items */}</Command.List>
    </Command.Dialog>
  );
}
```

## Multiple Palettes

Use separate `Command.Dialog` components, each with its own `open` state — each creates its own state machine:

```tsx
import { Command } from 'modern-cmdk/react';
import { useState } from 'react';

function Palettes() {
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <Command.Dialog open={commandsOpen} onOpenChange={setCommandsOpen}> {/* Main palette */}
        <Command.Input placeholder="Search commands..." />
        <Command.List>{/* command items */}</Command.List>
      </Command.Dialog>

      <Command.Dialog open={settingsOpen} onOpenChange={setSettingsOpen}> {/* Settings palette */}
        <Command.Input placeholder="Search settings..." />
        <Command.List>{/* settings items */}</Command.List>
      </Command.Dialog>
    </>
  );
}
```
