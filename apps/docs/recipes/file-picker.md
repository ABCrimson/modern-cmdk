# Recipe: File Picker

Build a Notion/Linear-style file picker with fuzzy search and recent files.

```tsx
'use client';

import { Command } from 'modern-cmdk/react';

interface FileEntry {
  readonly path: string;
  readonly name: string;
  readonly extension: string;
  readonly directory: string;
  readonly recent: boolean;
}

function FileIcon({ extension }: { extension: string }) {
  return <span aria-hidden="true">{extension}</span>;
}

function FilePicker({ files, onSelect }: { files: FileEntry[]; onSelect: (file: FileEntry) => void }) {
  // Each file is one item in one group, so it registers once under its path
  const byRecent = Map.groupBy(files, (file) => file.recent);
  const sections = [
    ['Recent', byRecent.get(true) ?? []],
    ['Other Files', byRecent.get(false) ?? []],
  ] as const;

  return (
    <Command label="File picker">
      <Command.Input placeholder="Find a file..." />
      <Command.List>
        {sections.map(([heading, group]) => (
          <Command.Group key={heading} heading={heading}>
            {group.map(file => (
              <Command.Item
                key={file.path}
                id={file.path}
                value={file.path}
                keywords={[file.name, file.extension, file.directory]}
                onSelect={() => onSelect(file)}
              >
                <FileIcon extension={file.extension} />
                <span>{file.name}</span>
                <span style={{ opacity: 0.5 }}>{file.directory}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ))}
        <Command.Empty>No files found.</Command.Empty>
      </Command.List>
    </Command>
  );
}
```

`id={file.path}` is the item's registration id (and its DOM id), so it stays the same across renders and page loads; the default is a `useId` id, which does not.

## With Frecency

Add automatic learning — files you open frequently rank higher for a query (the default active item and the arrow-key order follow the ranking; a list of 100 or fewer matches keeps its JSX order on screen). Frecency is keyed by item id, so the stable `id={file.path}` above is what ties a saved history to a file. The history saves 1000 ms after the last selection, when the page is hidden, and when the palette unmounts:

```tsx
'use client';

import { IdbFrecencyStorage } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';

// One IndexedDB storage for the page, created once at module scope; a storage you pass is yours to dispose.
const storage = new IdbFrecencyStorage();

export function FrecentFilePicker() {
  return (
    <Command label="File picker" frecency={{ enabled: true, storage }}>
      {/* Command.Input and Command.List as above */}
    </Command>
  );
}
```

## With Keyboard Shortcut

```tsx
import { Command } from 'modern-cmdk/react';
import { useEffect, useState } from 'react';

export function FilePickerDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'p' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen}>
      <Command.Input placeholder="Find a file (Ctrl+P)..." />
      {/* Command.List as above */}
    </Command.Dialog>
  );
}
```

Register `Ctrl+P` globally to open the file picker.
