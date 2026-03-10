# Recipe: Spotlight Search

Build a macOS Spotlight-style global search across your entire app.

```tsx
import { Command } from 'modern-cmdk/react';
import { Suspense } from 'react';

function SpotlightSearch() {
  return (
    <Command.Dialog>
      <Command.Input placeholder="Spotlight Search..." />
      <Command.List>
        <Command.Group heading="Actions">
          <Command.Item value="new-doc" shortcut="Ctrl+N" onSelect={createDoc}>
            New Document
          </Command.Item>
          <Command.Item value="new-folder" shortcut="Ctrl+Shift+N" onSelect={createFolder}>
            New Folder
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Recent">
          <Suspense fallback={<Command.Loading>Loading recents...</Command.Loading>}>
            <Command.AsyncItems source={fetchRecentItems} />
          </Suspense>
        </Command.Group>

        <Command.Group heading="Navigation">
          <Command.Item value="home" onSelect={() => navigate('/')}>Home</Command.Item>
          <Command.Item value="settings" onSelect={() => navigate('/settings')}>Settings</Command.Item>
          <Command.Item value="profile" onSelect={() => navigate('/profile')}>Profile</Command.Item>
        </Command.Group>
      </Command.List>
      <Command.Empty>No results found.</Command.Empty>
    </Command.Dialog>
  );
}
```

## Global Keyboard Shortcut

Register `Ctrl+K` or `Cmd+K` to open from anywhere:

```tsx
// The dialog has built-in Ctrl+K / Cmd+K support
<Command.Dialog>...</Command.Dialog>
```

## With Frecency + WASM

For the ultimate search experience — items you use frequently appear first, and WASM provides sub-millisecond search:

```tsx
import { createWorkerSearchEngine } from 'modern-cmdk-search-wasm';

const engine = await createWorkerSearchEngine();

<Command.Dialog search={engine} frecency={{ enabled: true }}>
  ...
</Command.Dialog>
```
