'use client';

// apps/playground/src/demos/BasicDemo.tsx
// Basic inline command palette with ~15 items across 3 groups
// React 19: useId, useCallback, ref as prop
// ES2026: Iterator Helpers (.map on Set)

import { Command } from '@crimson_dev/command-react';
import { useCallback, useId } from 'react';

export function BasicDemo(): React.ReactNode {
  const headingId = useId();
  const handleSelect = useCallback((_item: string) => {
    // Selection handler — wired to analytics/telemetry in production
  }, []);

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
        <Command.Input placeholder="Type a command or search..." />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>

          {/* Suggestions group */}
          <Command.Group heading="Suggestions" forceId="group-suggestions">
            <Command.Item value="apple" forceId="item-apple" onSelect={() => handleSelect('apple')}>
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83C\uDF4E'}
                </span>
                <span className="item-label">Apple</span>
              </span>
            </Command.Item>
            <Command.Item
              value="banana"
              forceId="item-banana"
              onSelect={() => handleSelect('banana')}
            >
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83C\uDF4C'}
                </span>
                <span className="item-label">Banana</span>
              </span>
            </Command.Item>
            <Command.Item
              value="orange"
              forceId="item-orange"
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
            <Command.Item value="grape" forceId="item-grape" onSelect={() => handleSelect('grape')}>
              <span className="item-content">
                <span className="item-icon" aria-hidden="true">
                  {'\uD83C\uDF47'}
                </span>
                <span className="item-label">Grape</span>
              </span>
            </Command.Item>
            <Command.Item
              value="pear"
              forceId="item-pear"
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
          <Command.Group heading="Actions" forceId="group-actions">
            <Command.Item
              value="create new file"
              forceId="item-create-file"
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
              forceId="item-open-terminal"
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
              forceId="item-search-files"
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
              forceId="item-toggle-sidebar"
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
              forceId="item-run-task"
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
          <Command.Group heading="Settings" forceId="group-settings">
            <Command.Item
              value="application settings"
              forceId="item-app-settings"
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
              forceId="item-keyboard-shortcuts"
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
              forceId="item-color-theme"
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
              forceId="item-user-profile"
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
              forceId="item-extensions"
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
    </div>
  );
}
