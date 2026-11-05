import { Command } from 'modern-cmdk/react';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

export function App(): ReactElement {
  const [open, setOpen] = useState(false);

  // Mod+K: Cmd+K on macOS, Ctrl+K elsewhere. event.key is 'K' with Caps Lock on, so compare lower-cased.
  useEffect((): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return (): void => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Command Palette</h1>
      <p>
        Press <kbd>Ctrl+K</kbd> (<kbd>Cmd+K</kbd> on macOS) to open.
      </p>
      <Command.Dialog open={open} onOpenChange={setOpen}>
        <Command.Input placeholder="Search commands..." />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>
          <Command.Item value="home" onSelect={(): void => alert('Home!')}>
            Home
          </Command.Item>
          <Command.Item value="settings" onSelect={(): void => alert('Settings!')}>
            Settings
          </Command.Item>
          <Command.Item value="profile" onSelect={(): void => alert('Profile!')}>
            Profile
          </Command.Item>
        </Command.List>
      </Command.Dialog>
    </div>
  );
}
