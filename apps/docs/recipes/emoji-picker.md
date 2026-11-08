# Recipe: Emoji Picker

Build a high-performance emoji picker with 5000+ items using virtualization.

```tsx
'use client';

import { Command } from 'modern-cmdk/react';

interface EmojiEntry {
  readonly emoji: string;
  readonly name: string;
  readonly keywords: readonly string[];
}

// App-owned: your emoji dataset
declare function loadEmojis(): readonly EmojiEntry[];

const EMOJIS = loadEmojis();

function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <Command label="Emoji picker">
      <Command.Input placeholder="Search emoji..." />
      <Command.List>
        {EMOJIS.map(({ emoji, name, keywords }) => (
          <Command.Item
            key={name}
            value={name}
            keywords={keywords}
            onSelect={() => onSelect(emoji)}
          >
            <span style={{ fontSize: '1.5em' }}>{emoji}</span>
            <span>{name}</span>
          </Command.Item>
        ))}
        <Command.Empty>No emoji found.</Command.Empty>
      </Command.List>
    </Command>
  );
}
```

Virtualization activates automatically when more than 100 items match (a fixed threshold). With 5000+ emojis, every `<Command.Item>` still mounts and registers with the machine (in one scheduler batch, so one refilter); virtualization only skips the off-screen DOM, so only the rows in the viewport plus `overscan` render elements.

## With WASM Search

The WASM engine does not work yet (see [WASM Search](/guide/wasm-search)), so this sample shows the intended API, not today's behaviour.

A `Command` without a `searchEngine` creates its engine and disposes it with its machine. An engine you pass is yours to dispose: the machine never disposes it, and it survives the machine's dispose, suspend and resume. So the component creates the engine per mount, as its owner disposes it, and renders the palette once the engine exists (the palette reads `searchEngine` once, when it mounts):

```tsx
'use client';

import type { SearchEngine } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { createWasmSearchEngine } from 'modern-cmdk-search-wasm';
import { useEffect, useState } from 'react';

export function WasmEmojiPicker() {
  const [engine, setEngine] = useState<SearchEngine | null>(null);

  useEffect(() => {
    let current = true;
    const pending = createWasmSearchEngine();
    void pending.then((created) => {
      if (current) setEngine(created);
    });
    return () => {
      current = false;
      setEngine(null);
      void pending.then((created) => created[Symbol.dispose]());
    };
  }, []);

  if (engine === null) return null;

  return (
    <Command label="Emoji picker" searchEngine={engine}>
      {/* Command.Input and Command.List as above */}
    </Command>
  );
}
```
