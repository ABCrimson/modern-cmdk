# Recipe: Emoji Picker

Build a high-performance emoji picker with 5000+ items using virtualization.

```tsx
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

The WASM engine does not work yet (see [WASM Search](/guide/wasm-search)), so this sample shows the intended API, not today's behaviour:

```tsx
import { Command } from 'modern-cmdk/react';
import { createWasmSearchEngine } from 'modern-cmdk-search-wasm';

const wasmEngine = await createWasmSearchEngine();

export function WasmEmojiPicker() {
  return (
    <Command label="Emoji picker" search={wasmEngine}>
      {/* Command.Input and Command.List as above */}
    </Command>
  );
}
```
