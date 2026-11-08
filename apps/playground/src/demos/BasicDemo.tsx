'use client';

// apps/playground/src/demos/BasicDemo.tsx
// Basic inline command palette with 15 items across 3 groups
// Hooks: useId, useState

import { Command, useCommandDevtools } from 'modern-cmdk/react';
import { useId, useState } from 'react';

/**
 * Registers this palette on `globalThis.__MODERN_CMDK_DEVTOOLS__` and fires `modern-cmdk-devtools`
 * events (dev builds only).
 */
function DevtoolsBridge(): null {
  useCommandDevtools('basic');
  return null;
}

export function BasicDemo(): React.ReactNode {
  const headingId = useId();
  const [lastSelected, setLastSelected] = useState('');
  const handleSelect = (item: string): void => setLastSelected(item);

  return (
    <div className="demo-container" role="region" aria-labelledby={headingId}>
      <h2 className="demo-title" id={headingId}>
        Basic Inline Palette
      </h2>
      <p className="demo-description">
        A static command palette with grouped items, keyboard shortcuts, disabled states, and
        keyword-based search. Type to filter items across all groups.
      </p>

      <Command className="command-palette" label="Basic command palette">
        <DevtoolsBridge />
        <Command.Input placeholder="Type a command or search..." />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>

          {/* Suggestions group */}
          <Command.Group heading="Suggestions" id="group-suggestions">
            <Command.Item value="apple" id="item-apple" onSelect={() => handleSelect('apple')}>
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83C\uDF4E'}
                </span>
                <span className="item-label">Apple</span>
              </span>
            </Command.Item>
            <Command.Item value="banana" id="item-banana" onSelect={() => handleSelect('banana')}>
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83C\uDF4C'}
                </span>
                <span className="item-label">Banana</span>
              </span>
            </Command.Item>
            <Command.Item
              value="orange"
              id="item-orange"
              onSelect={() => handleSelect('orange')}
              keywords={['citrus', 'fruit']}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83C\uDF4A'}
                </span>
                <span className="item-label">Orange</span>
              </span>
            </Command.Item>
            <Command.Item value="grape" id="item-grape" onSelect={() => handleSelect('grape')}>
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83C\uDF47'}
                </span>
                <span className="item-label">Grape</span>
              </span>
            </Command.Item>
            <Command.Item
              value="pear"
              id="item-pear"
              onSelect={() => handleSelect('pear')}
              disabled
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83C\uDF50'}
                </span>
                <span className="item-label">Pear (disabled)</span>
              </span>
            </Command.Item>
          </Command.Group>

          <Command.Separator />

          {/* Actions group */}
          <Command.Group heading="Actions" id="group-actions">
            <Command.Item
              value="create new file"
              id="item-create-file"
              onSelect={() => handleSelect('create new file')}
              shortcut="Mod+N"
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\u2795'}
                </span>
                <span className="item-label">Create New File</span>
                <Command.Shortcut shortcut="Mod+N" />
              </span>
            </Command.Item>
            <Command.Item
              value="open terminal"
              id="item-open-terminal"
              onSelect={() => handleSelect('open terminal')}
              shortcut="Mod+`"
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\u25B6'}
                </span>
                <span className="item-label">Open Terminal</span>
                <Command.Shortcut shortcut="Mod+`" />
              </span>
            </Command.Item>
            <Command.Item
              value="search files"
              id="item-search-files"
              onSelect={() => handleSelect('search files')}
              keywords={['find', 'lookup']}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83D\uDD0D'}
                </span>
                <span className="item-label">Search Files</span>
              </span>
            </Command.Item>
            <Command.Item
              value="toggle sidebar"
              id="item-toggle-sidebar"
              onSelect={() => handleSelect('toggle sidebar')}
              shortcut="Mod+B"
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\u2630'}
                </span>
                <span className="item-label">Toggle Sidebar</span>
                <Command.Shortcut shortcut="Mod+B" />
              </span>
            </Command.Item>
            <Command.Item
              value="run task"
              id="item-run-task"
              onSelect={() => handleSelect('run task')}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\u26A1'}
                </span>
                <span className="item-label">Run Task</span>
              </span>
            </Command.Item>
          </Command.Group>

          <Command.Separator />

          {/* Settings group */}
          <Command.Group heading="Settings" id="group-settings">
            <Command.Item
              value="application settings"
              id="item-app-settings"
              onSelect={() => handleSelect('application settings')}
              keywords={['preferences', 'config']}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\u2699'}
                </span>
                <span className="item-label">Application Settings</span>
              </span>
            </Command.Item>
            <Command.Item
              value="keyboard shortcuts"
              id="item-keyboard-shortcuts"
              onSelect={() => handleSelect('keyboard shortcuts')}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\u2328'}
                </span>
                <span className="item-label">Keyboard Shortcuts</span>
              </span>
            </Command.Item>
            <Command.Item
              value="color theme"
              id="item-color-theme"
              onSelect={() => handleSelect('color theme')}
              keywords={['dark', 'light', 'appearance']}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83C\uDFA8'}
                </span>
                <span className="item-label">Color Theme</span>
              </span>
            </Command.Item>
            <Command.Item
              value="user profile"
              id="item-user-profile"
              onSelect={() => handleSelect('user profile')}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83D\uDC64'}
                </span>
                <span className="item-label">User Profile</span>
              </span>
            </Command.Item>
            <Command.Item
              value="extensions"
              id="item-extensions"
              onSelect={() => handleSelect('extensions')}
              keywords={['plugins', 'addons']}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83E\uDDE9'}
                </span>
                <span className="item-label">Extensions</span>
              </span>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>

      <p>
        Last selected: <output data-testid="last-selected">{lastSelected}</output>
      </p>
    </div>
  );
}
