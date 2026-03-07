'use client';

// apps/playground/src/demos/BasicDemo.tsx
// Basic inline command palette with ~15 items across 3 groups

import { Command } from '@crimson_dev/command-react';
import { useCallback } from 'react';

export function BasicDemo(): React.ReactNode {
  const handleSelect = useCallback((_item: string) => {}, []);

  return (
    <div className="demo-container">
      <h2 className="demo-title">Basic Inline Palette</h2>
      <Command className="command-palette" label="Basic command palette">
        <Command.Input placeholder="Type a command or search..." />
        <Command.List>
          <Command.Empty>No results found.</Command.Empty>

          {/* Suggestions group */}
          <Command.Group heading="Suggestions" forceId="group-suggestions">
            <Command.Item value="apple" forceId="item-apple" onSelect={() => handleSelect('apple')}>
              Apple
            </Command.Item>
            <Command.Item
              value="banana"
              forceId="item-banana"
              onSelect={() => handleSelect('banana')}
            >
              Banana
            </Command.Item>
            <Command.Item
              value="orange"
              forceId="item-orange"
              onSelect={() => handleSelect('orange')}
              keywords={['citrus', 'fruit']}
            >
              Orange
            </Command.Item>
            <Command.Item value="grape" forceId="item-grape" onSelect={() => handleSelect('grape')}>
              Grape
            </Command.Item>
            <Command.Item
              value="pear"
              forceId="item-pear"
              onSelect={() => handleSelect('pear')}
              disabled
            >
              Pear (disabled)
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
                <span>Create New File</span>
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
                <span>Open Terminal</span>
                <Command.Shortcut shortcut="Mod+`" />
              </span>
            </Command.Item>
            <Command.Item
              value="search files"
              forceId="item-search-files"
              onSelect={() => handleSelect('search files')}
              keywords={['find', 'lookup']}
            >
              Search Files
            </Command.Item>
            <Command.Item
              value="toggle sidebar"
              forceId="item-toggle-sidebar"
              onSelect={() => handleSelect('toggle sidebar')}
              shortcut="Mod+B"
            >
              <span className="item-content">
                <span>Toggle Sidebar</span>
                <Command.Shortcut shortcut="Mod+B" />
              </span>
            </Command.Item>
            <Command.Item
              value="run task"
              forceId="item-run-task"
              onSelect={() => handleSelect('run task')}
            >
              Run Task
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
              Application Settings
            </Command.Item>
            <Command.Item
              value="keyboard shortcuts"
              forceId="item-keyboard-shortcuts"
              onSelect={() => handleSelect('keyboard shortcuts')}
            >
              Keyboard Shortcuts
            </Command.Item>
            <Command.Item
              value="color theme"
              forceId="item-color-theme"
              onSelect={() => handleSelect('color theme')}
              keywords={['dark', 'light', 'appearance']}
            >
              Color Theme
            </Command.Item>
            <Command.Item
              value="user profile"
              forceId="item-user-profile"
              onSelect={() => handleSelect('user profile')}
            >
              User Profile
            </Command.Item>
            <Command.Item
              value="extensions"
              forceId="item-extensions"
              onSelect={() => handleSelect('extensions')}
              keywords={['plugins', 'addons']}
            >
              Extensions
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
