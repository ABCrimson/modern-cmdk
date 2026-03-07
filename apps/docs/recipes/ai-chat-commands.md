# Recipe: AI Chat Commands

Build slash commands for an AI chat interface (like ChatGPT or Claude).

```tsx
import { Command } from '@crimson_dev/command-react';

const COMMANDS = [
  { id: 'summarize', label: '/summarize', description: 'Summarize the conversation' },
  { id: 'translate', label: '/translate', description: 'Translate to another language' },
  { id: 'code', label: '/code', description: 'Generate code snippet' },
  { id: 'image', label: '/image', description: 'Generate an image' },
  { id: 'web', label: '/web', description: 'Search the web' },
];

function SlashCommands({ onCommand }: { onCommand: (cmd: string) => void }) {
  return (
    <Command filter={false} label="Slash commands">
      <Command.Input placeholder="Type a command..." />
      <Command.List>
        {COMMANDS.map(cmd => (
          <Command.Item key={cmd.id} value={cmd.label} onSelect={() => onCommand(cmd.id)}>
            <span style={{ fontFamily: 'monospace' }}>{cmd.label}</span>
            <span style={{ opacity: 0.6 }}>{cmd.description}</span>
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}
```

## Triggering on "/" Keystroke

Show the palette inline when the user types `/` in the chat input:

```tsx
function ChatInput() {
  const [showCommands, setShowCommands] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <textarea onKeyDown={(e) => {
        if (e.key === '/' && e.currentTarget.value === '') {
          setShowCommands(true);
        }
      }} />
      {showCommands && (
        <div style={{ position: 'absolute', bottom: '100%' }}>
          <SlashCommands onCommand={(cmd) => { setShowCommands(false); executeCommand(cmd); }} />
        </div>
      )}
    </div>
  );
}
```
