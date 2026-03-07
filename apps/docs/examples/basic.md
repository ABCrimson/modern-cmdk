# Basic Example

A minimal command palette with search, groups, and keyboard navigation.

```tsx
'use client';

import { Command } from '@crimson_dev/command-react';

export function BasicExample() {
  return (
    <Command label="Command Menu">
      <Command.Input placeholder="What do you need?" />
      <Command.List>
        <Command.Loading>Searching...</Command.Loading>
        <Command.Empty>No results found.</Command.Empty>

        <Command.Group heading="Suggestions">
          <Command.Item value="calendar" onSelect={() => console.log('Calendar')}>
            Calendar
          </Command.Item>
          <Command.Item value="search-emoji" onSelect={() => console.log('Emoji')}>
            Search Emoji
          </Command.Item>
          <Command.Item value="calculator" onSelect={() => console.log('Calculator')}>
            Calculator
          </Command.Item>
        </Command.Group>

        <Command.Separator />

        <Command.Group heading="Settings">
          <Command.Item value="profile" onSelect={() => console.log('Profile')}>
            Profile
            <Command.Shortcut shortcut="Mod+P" />
          </Command.Item>
          <Command.Item value="billing" onSelect={() => console.log('Billing')}>
            Billing
            <Command.Shortcut shortcut="Mod+B" />
          </Command.Item>
          <Command.Item value="settings" onSelect={() => console.log('Settings')}>
            Settings
            <Command.Shortcut shortcut="Mod+," />
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command>
  );
}
```
