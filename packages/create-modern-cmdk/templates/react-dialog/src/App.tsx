import { matchesShortcut, parseShortcut } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

export function App(): ReactElement {
  const [open, setOpen] = useState(false);

  // Mod+K is Cmd+K on Apple platforms and Ctrl+K elsewhere; matchesShortcut ignores Caps Lock.
  useEffect((): (() => void) => {
    const toggle = parseShortcut('Mod+K');
    const controller = new AbortController();
    document.addEventListener(
      'keydown',
      (event): void => {
        if (!matchesShortcut(event, toggle)) return;
        event.preventDefault();
        setOpen((current) => !current);
      },
      { signal: controller.signal },
    );
    return (): void => controller.abort();
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Command Palette</h1>
      <p>
        Press <Command.Shortcut shortcut="Mod+K" /> to open.
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
