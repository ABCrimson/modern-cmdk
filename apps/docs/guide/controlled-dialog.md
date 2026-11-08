# Controlled Dialog

`Command.Dialog` is open exactly while its `open` prop is `true` and closed while it is `false`; pass `open` and `onOpenChange` to control it. Without `open` the dialog is uncontrolled: it starts closed and nothing in the package opens it (no trigger, no shortcut), so open it through `open`. A controlled dialog never changes its own open state. Every request to open or close it (Escape, a click outside the content or on the overlay, `OPEN`, `CLOSE` or `TOGGLE` from a shortcut or from `send`) calls `onOpenChange(requested)` once and changes nothing else, so your state decides: `onOpenChange={setOpen}` accepts every request, and a handler that ignores one vetoes it (see [Vetoing a close](#vetoing-a-close)). A change of the `open` prop does not call `onOpenChange`, and a request that equals the current `open` is not reported.

## Controlled Mode

Pass `open` and `onOpenChange` to control the dialog state:

```tsx
'use client';

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

## Vetoing a close

The dialog follows `open`, not the request, so a parent that keeps `open={true}` keeps the dialog open: Escape, an outside click and a `CLOSE` reach `onOpenChange(false)`, and the content and its focus stay mounted. The sample refuses every close while a save is running and accepts the rest:

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { useState } from 'react';

function GuardedPalette() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open Commands</button>
      <button type="button" onClick={() => setSaving((current) => !current)}>
        {saving ? 'Finish saving' : 'Start saving'}
      </button>
      <Command.Dialog
        open={open}
        onOpenChange={(requested) => {
          if (!requested && saving) return; // veto: `open` stays true, the dialog stays open
          setOpen(requested);
        }}
      >
        <Command.Input placeholder="Search commands..." />
        <Command.List>{/* command items */}</Command.List>
      </Command.Dialog>
    </>
  );
}
```

## Opening with Ctrl+K

Nothing in the dialog listens for an opening shortcut, so the page does: a `keydown` listener on the document toggles the state that `open` reads.

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { useEffect, useState } from 'react';

function ShortcutPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'k' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen}>
      <Command.Input placeholder="Search commands..." />
      <Command.List>{/* command items */}</Command.List>
    </Command.Dialog>
  );
}
```

## Multiple Palettes

Use separate `Command.Dialog` components, each with its own `open` state — each creates its own state machine:

```tsx
'use client';

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
