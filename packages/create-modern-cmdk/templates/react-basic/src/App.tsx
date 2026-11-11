import { Command } from 'modern-cmdk/react';
import type { ReactElement } from 'react';
import { useState } from 'react';

export function App(): ReactElement {
  const [last, setLast] = useState<string | null>(null);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Command Palette</h1>
      <p role="status">Chosen: {last ?? 'nothing yet'}</p>
      <Command label="Command menu">
        <Command.Input placeholder="Search..." />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>
          <Command.Group heading="Actions">
            <Command.Item value="copy" onSelect={(): void => setLast('Copy')}>
              Copy
            </Command.Item>
            <Command.Item value="paste" onSelect={(): void => setLast('Paste')}>
              Paste
            </Command.Item>
          </Command.Group>
          <Command.Group heading="Navigation">
            <Command.Item value="home" onSelect={(): void => setLast('Home')}>
              Home
            </Command.Item>
            <Command.Item value="settings" onSelect={(): void => setLast('Settings')}>
              Settings
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
