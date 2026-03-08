'use client';

// apps/playground/src/demos/DarkModeDemo.tsx
// Side-by-side dark/light theme preview
// React 19: useId, useCallback

import { Command } from '@crimson_dev/command-react';
import { useCallback, useId, useState } from 'react';

export function DarkModeDemo(): React.ReactNode {
  const [dark, setDark] = useState(true);
  const headingId = useId();

  const handleSelect = useCallback((value: string) => {
    if (value === 'light') setDark(false);
    if (value === 'dark') setDark(true);
  }, []);

  return (
    <div className="demo-container" role="region" aria-labelledby={headingId}>
      <h2 className="demo-title" id={headingId}>
        Dark Mode
      </h2>
      <p className="demo-description">
        Toggle between dark and light themes. The palette uses OKLCH color tokens that can be
        swapped via CSS custom properties or a <code>data-theme</code> attribute.
      </p>

      <button
        type="button"
        className="trigger-button"
        onClick={() => setDark(!dark)}
        aria-pressed={dark}
      >
        {dark ? '\u263E Dark Mode' : '\u2600 Light Mode'}
      </button>

      <div className="theme-preview" data-theme-preview={dark ? 'dark' : 'light'}>
        <Command className="command-palette" label="Dark mode demo">
          <Command.Input placeholder="Search commands..." />
          <Command.List>
            <Command.Empty>No results.</Command.Empty>

            <Command.Group heading="Theme">
              <Command.Item value="light" onSelect={() => handleSelect('light')}>
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    {'\u2600'}
                  </span>
                  <span className="item-label">Light Mode</span>
                </span>
              </Command.Item>
              <Command.Item value="dark" onSelect={() => handleSelect('dark')}>
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    {'\u263E'}
                  </span>
                  <span className="item-label">Dark Mode</span>
                </span>
              </Command.Item>
              <Command.Item value="system">
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    {'\uD83D\uDCBB'}
                  </span>
                  <span className="item-label">System Default</span>
                </span>
              </Command.Item>
            </Command.Group>

            <Command.Separator />

            <Command.Group heading="Actions">
              <Command.Item value="new">
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    {'\u2795'}
                  </span>
                  <span className="item-label">New Document</span>
                </span>
              </Command.Item>
              <Command.Item value="open">
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    {'\uD83D\uDCC2'}
                  </span>
                  <span className="item-label">Open File</span>
                </span>
              </Command.Item>
              <Command.Item value="save">
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    {'\uD83D\uDCBE'}
                  </span>
                  <span className="item-label">Save</span>
                </span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
