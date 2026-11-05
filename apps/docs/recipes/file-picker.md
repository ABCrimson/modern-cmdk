# Recipe: File Picker

Build a Notion/Linear-style file picker with fuzzy search and recent files.

```tsx
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
  return (
    <Command label="File picker">
      <Command.Input placeholder="Find a file..." />
      <Command.List>
        <Command.Group heading="Recent">
          {files.filter(f => f.recent).map(file => (
            <Command.Item
              key={file.path}
              value={file.path}
              keywords={[file.name, file.extension]}
              onSelect={() => onSelect(file)}
            >
              <FileIcon extension={file.extension} />
              <span>{file.name}</span>
              <span style={{ opacity: 0.5 }}>{file.directory}</span>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="All Files">
          {files.map(file => (
            <Command.Item
              key={file.path}
              value={file.path}
              keywords={[file.name, file.extension, file.directory]}
              onSelect={() => onSelect(file)}
            >
              <FileIcon extension={file.extension} />
              <span>{file.name}</span>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Empty>No files found.</Command.Empty>
      </Command.List>
    </Command>
  );
}
```

## With Frecency

Add automatic learning — files you open frequently rise to the top:

```tsx
import { IdbFrecencyStorage } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';

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
