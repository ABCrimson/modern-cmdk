# Recipe: File Picker

Build a Notion/Linear-style file picker with fuzzy search and recent files.

```tsx
import { Command } from 'modern-cmdk/react';
import { createCommandMachine, itemId } from 'modern-cmdk';

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

<Command frecency={{ enabled: true, storage: new IdbFrecencyStorage() }}>
  ...
</Command>
```

## With Keyboard Shortcut

```tsx
<Command.Dialog>
  <Command.Input placeholder="Find a file (Ctrl+P)..." />
  ...
</Command.Dialog>
```

Register `Ctrl+P` globally to open the file picker.
