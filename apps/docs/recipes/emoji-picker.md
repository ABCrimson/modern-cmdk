# Recipe: Emoji Picker

Build a high-performance emoji picker with 5000+ items using virtualization.

```tsx
import { Command } from 'modern-cmdk/react';

const EMOJIS = loadEmojis(); // Array of { emoji, name, keywords }

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
      </Command.List>
      <Command.Empty>No emoji found.</Command.Empty>
    </Command>
  );
}
```

Virtualization activates automatically when the item count exceeds the threshold (default: 100). With 5000+ emojis, only visible items render.

## With WASM Search

For instant search across thousands of emojis:

```tsx
import { createWasmSearchEngine } from 'modern-cmdk-search-wasm';

const wasmEngine = await createWasmSearchEngine();

<Command search={wasmEngine}>
  ...
</Command>
```
