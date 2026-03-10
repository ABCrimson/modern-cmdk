# Controlled Dialog

`Command.Dialog` supports both controlled and uncontrolled modes.

## Uncontrolled (Default)

The dialog manages its own open/close state internally:

```tsx
<Command.Dialog>
  <Command.Input />
  <Command.List>...</Command.List>
</Command.Dialog>
```

To open it with `Ctrl+K`, add a manual `useEffect` listener that toggles the dialog state (see the Controlled Mode example below).

## Controlled Mode

Pass `open` and `onOpenChange` to fully control the dialog state:

```tsx
function App() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open Commands</button>
      <Command.Dialog open={open} onOpenChange={setOpen}>
        <Command.Input />
        <Command.List>
          <Command.Item onSelect={() => setOpen(false)}>Close</Command.Item>
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

import { useSearchParams, useRouter } from 'next/navigation';

function CommandPalette() {
  const router = useRouter();
  const params = useSearchParams();
  const open = params.get('cmd') === '1';

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(isOpen) => {
        const next = new URLSearchParams(params);
        if (isOpen) next.set('cmd', '1');
        else next.delete('cmd');
        router.replace(`?${next.toString()}`);
      }}
    >
      ...
    </Command.Dialog>
  );
}
```

## Preventing Close

Block closing when there's unsaved input:

```tsx
function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && hasUnsaved) {
          if (!confirm('Discard unsaved changes?')) return;
        }
        setOpen(isOpen);
      }}
    >
      ...
    </Command.Dialog>
  );
}
```

## Multiple Palettes

Use separate `Command` instances — each creates its own state machine:

```tsx
<Command.Dialog> {/* Main palette */}
  <Command.Input placeholder="Search commands..." />
  ...
</Command.Dialog>

<Command.Dialog> {/* Settings palette */}
  <Command.Input placeholder="Search settings..." />
  ...
</Command.Dialog>
```
