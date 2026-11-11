import { matchesShortcut, parseShortcut } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

export function App(): ReactElement {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  // Mod+K is Cmd+K on Apple platforms and Ctrl+K elsewhere; matchesShortcut compares the key
  // lower-cased, so Caps Lock does not matter.
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

  const choose = (name: string): void => {
    setLast(name);
    setOpen(false);
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Command Palette</h1>
      <p>
        Press <Command.Shortcut shortcut="Mod+K" /> to open.
      </p>
      <p role="status">Chosen: {last ?? 'nothing yet'}</p>
      <Command.Dialog open={open} onOpenChange={setOpen}>
        <Command.Input placeholder="Search commands..." />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>
          <Command.Item value="home" onSelect={(): void => choose('Home')}>
            Home
          </Command.Item>
          <Command.Item value="settings" onSelect={(): void => choose('Settings')}>
            Settings
          </Command.Item>
          <Command.Item value="profile" onSelect={(): void => choose('Profile')}>
            Profile
          </Command.Item>
        </Command.List>
      </Command.Dialog>
    </div>
  );
}
