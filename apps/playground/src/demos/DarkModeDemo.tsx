import { useState } from 'react';
import { Command } from '@crimson_dev/command-react';

export function DarkModeDemo() {
  const [dark, setDark] = useState(true);

  return (
    <div>
      <h3>Dark Mode Demo</h3>
      <button onClick={() => setDark(!dark)}>Toggle: {dark ? 'Dark' : 'Light'}</button>
      <div
        style={{
          marginBlockStart: '1rem',
          padding: '1.5rem',
          borderRadius: 12,
          background: dark ? '#1a1a2e' : '#ffffff',
          color: dark ? '#e0e0e0' : '#1a1a2e',
          border: `1px solid ${dark ? '#333' : '#ddd'}`,
          transition: 'all 200ms ease',
        }}
      >
        <Command label="Dark mode demo">
          <Command.Input placeholder="Search commands..." />
          <Command.List>
            <Command.Group heading="Theme">
              <Command.Item value="light" onSelect={() => setDark(false)}>Light Mode</Command.Item>
              <Command.Item value="dark" onSelect={() => setDark(true)}>Dark Mode</Command.Item>
              <Command.Item value="system">System Default</Command.Item>
            </Command.Group>
            <Command.Group heading="Actions">
              <Command.Item value="new">New Document</Command.Item>
              <Command.Item value="open">Open File</Command.Item>
              <Command.Item value="save">Save</Command.Item>
            </Command.Group>
          </Command.List>
          <Command.Empty>No results.</Command.Empty>
        </Command>
      </div>
    </div>
  );
}
