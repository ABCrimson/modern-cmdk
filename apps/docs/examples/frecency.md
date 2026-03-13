---
title: Frecency Example
description: Frecency-boosted search with IndexedDB persistence across browser sessions.
---

# Frecency

Demonstrates frecency-boosted search ranking. Items you use frequently and recently are promoted to the top of results, similar to Raycast, Alfred, and Spotlight.

## Basic Frecency

```tsx
'use client';

import { Command } from 'modern-cmdk/react';

export function FrecencyExample() {
  return (
    <Command frecency={{ enabled: true }} label="Frecency Demo">
      <Command.Input placeholder="Search (try selecting items multiple times)..." />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>

        <Command.Group heading="Actions">
          <Command.Item value="new-file" onSelect={() => console.log('New File')}>
            New File
            <Command.Shortcut shortcut="Mod+N" />
          </Command.Item>
          <Command.Item value="open-file" onSelect={() => console.log('Open File')}>
            Open File
            <Command.Shortcut shortcut="Mod+O" />
          </Command.Item>
          <Command.Item value="save" onSelect={() => console.log('Save')}>
            Save
            <Command.Shortcut shortcut="Mod+S" />
          </Command.Item>
          <Command.Item value="save-as" onSelect={() => console.log('Save As')}>
            Save As
            <Command.Shortcut shortcut="Mod+Shift+S" />
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Navigation">
          <Command.Item value="settings" onSelect={() => console.log('Settings')}>
            Settings
            <Command.Shortcut shortcut="Mod+," />
          </Command.Item>
          <Command.Item value="profile" onSelect={() => console.log('Profile')}>
            Profile
          </Command.Item>
          <Command.Item value="billing" onSelect={() => console.log('Billing')}>
            Billing
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command>
  );
}
```

Select "Settings" a few times, then clear the search. "Settings" will appear higher in the list because its frecency score is boosted by repeated recent usage.

## IndexedDB Persistence

Persist frecency data across browser sessions with `IdbFrecencyStorage`:

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { IdbFrecencyStorage } from 'modern-cmdk';

// Create storage once (singleton)
const storage = new IdbFrecencyStorage('my-app-db', 'frecency');

export function PersistentFrecencyExample() {
  return (
    <Command
      frecency={{
        enabled: true,
        storage,
        namespace: 'command-palette',
      }}
      label="Persistent Frecency"
    >
      <Command.Input placeholder="Your history persists across reloads..." />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>
        <Command.Item value="settings" onSelect={() => console.log('Settings')}>
          Settings
        </Command.Item>
        <Command.Item value="profile" onSelect={() => console.log('Profile')}>
          Profile
        </Command.Item>
        <Command.Item value="billing" onSelect={() => console.log('Billing')}>
          Billing
        </Command.Item>
        <Command.Item value="analytics" onSelect={() => console.log('Analytics')}>
          Analytics
        </Command.Item>
      </Command.List>
    </Command>
  );
}
```

::: tip
`IdbFrecencyStorage` uses `idb-keyval@6.2.2` under the hood. It is included as a direct dependency of `modern-cmdk`, so no separate install is needed.
:::

## Custom Decay Curve

Tune the decay weights to match your usage patterns:

```tsx
<Command
  frecency={{
    enabled: true,
    decayConfig: {
      hourWeight: 6.0,    // Very strong boost for items used in the last hour
      dayWeight: 3.0,     // Strong boost for today
      weekWeight: 1.5,    // Moderate boost for this week
      monthWeight: 0.8,   // Slight boost for this month
      olderWeight: 0.2,   // Minimal boost for older items
    },
  }}
>
  {/* ... */}
</Command>
```

## Core Engine Usage

Frecency works at the core state machine level, independent of React:

```typescript
import { createCommandMachine } from 'modern-cmdk';
import { IdbFrecencyStorage } from 'modern-cmdk';

async function demo() {
  await using storage = new IdbFrecencyStorage();

  using machine = createCommandMachine({
    items: [
      { id: 'settings', value: 'Settings' },
      { id: 'profile', value: 'Profile' },
    ],
    frecency: {
      enabled: true,
      storage,
      namespace: 'my-app',
    },
  });

  // Select an item -- recorded with Date.now()
  machine.send({ type: 'ITEM_SELECT', id: 'settings' });

  // Future empty searches rank "Settings" higher
  machine.send({ type: 'SEARCH_CHANGE', query: '' });
  const state = machine.getState();
  // state.filteredIds[0] === 'settings' (boosted by frecency)
}
```
