# Recipe: Spotlight Search

Build a macOS Spotlight-style global search across your entire app.

```tsx
'use client';

import type { CommandItem } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { useMemo, useState } from 'react';

// App-owned actions and data source
declare function createDoc(): void;
declare function createFolder(): void;
declare function fetchRecentItems(): Promise<readonly CommandItem[]>;

// A real platform API in place of a router; swap in your router's navigate
function navigate(path: string): void {
  window.location.assign(path);
}

function SpotlightSearch() {
  const [open, setOpen] = useState(false);
  // The promise is created once per mount, never in JSX: a new promise on every render suspends again
  const recent = useMemo(fetchRecentItems, []);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen}>
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
          <Command.AsyncItems
            items={recent}
            fallback={<Command.Loading loading>Loading recents...</Command.Loading>}
          >
            {(items) => items.map((item) => (
              <Command.Item key={item.id} id={item.id} value={item.value} onSelect={() => console.log(item)}>
                {item.value}
              </Command.Item>
            ))}
          </Command.AsyncItems>
        </Command.Group>

        <Command.Group heading="Navigation">
          <Command.Item value="home" onSelect={() => navigate('/')}>Home</Command.Item>
          <Command.Item value="settings" onSelect={() => navigate('/settings')}>Settings</Command.Item>
          <Command.Item value="profile" onSelect={() => navigate('/profile')}>Profile</Command.Item>
        </Command.Group>
        <Command.Empty>No results found.</Command.Empty>
      </Command.List>
    </Command.Dialog>
  );
}
```

## Global Keyboard Shortcut

Register `Cmd+K` / `Ctrl+K` to open from anywhere with a document-level listener (the dialog does not bind this for you):

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { useEffect, useState } from 'react';

export function GlobalSpotlight() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen}>
      {/* Command.Input and Command.List as above */}
    </Command.Dialog>
  );
}
```

## With Frecency + WASM

Items you use frequently appear first. The WASM engine does not work yet (see [WASM Search](/guide/wasm-search)), so this sample shows the intended API, not today's behaviour:

```tsx
'use client';

import type { SearchEngine } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { createWorkerSearchEngine } from 'modern-cmdk-search-wasm';
import { useEffect, useState } from 'react';

// An engine you pass is yours to dispose: create it per mount and dispose it in the cleanup.
function useWorkerEngine(): SearchEngine | null {
  const [engine, setEngine] = useState<SearchEngine | null>(null);

  useEffect(() => {
    let current = true;
    const pending = createWorkerSearchEngine();
    void pending.then((created) => {
      if (current) setEngine(created);
    });
    return () => {
      current = false;
      setEngine(null);
      void pending.then((created) => created[Symbol.dispose]());
    };
  }, []);

  return engine;
}

export function WasmSpotlight() {
  const [open, setOpen] = useState(false);
  const engine = useWorkerEngine();

  // `searchEngine` is read once, when the palette mounts, so render it after the engine exists
  if (engine === null) return null;

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} searchEngine={engine} frecency={{ enabled: true }}>
      {/* Command.Input and Command.List as above */}
    </Command.Dialog>
  );
}
```
