import { Command } from 'modern-cmdk/react';
import type { ReactElement } from 'react';

export function App(): ReactElement {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Command Palette</h1>
      <Command label="Command menu">
        <Command.Input placeholder="Search..." />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>
          <Command.Group heading="Actions">
            <Command.Item value="copy" onSelect={(): void => alert('Copied!')}>
              Copy
            </Command.Item>
            <Command.Item value="paste" onSelect={(): void => alert('Pasted!')}>
              Paste
            </Command.Item>
          </Command.Group>
          <Command.Group heading="Navigation">
            <Command.Item value="home" onSelect={(): void => alert('Home!')}>
              Home
            </Command.Item>
            <Command.Item value="settings" onSelect={(): void => alert('Settings!')}>
              Settings
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
