---
title: Frecency Example
description: Frecency-boosted search with IndexedDB persistence across browser sessions.
---

# Frecency

Demonstrates frecency-boosted search ranking. Items you use frequently and recently get a bonus added to their match score for non-empty queries, which changes the ranked result order the machine uses for the default active item and keyboard navigation.

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

Select "Settings" a few times, then type a query that matches it (for example `s`). Its frecency bonus is added to its match score, so it moves up the machine's ranked results (`state.filteredIds`): that order picks the default active item and the arrow-key order. The rendered (non-virtualized) list keeps the JSX order of the `<Command.Item>` elements, so the item does not move on screen. With an empty search frecency is not applied, and `state.filteredIds` is registration order.

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
`IdbFrecencyStorage` uses `idb-keyval@6.3.0` under the hood. It is included as a direct dependency of `modern-cmdk`, so no separate install is needed.
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
import { createCommandMachine, itemId } from 'modern-cmdk';
import type { CommandState } from 'modern-cmdk';
import { IdbFrecencyStorage } from 'modern-cmdk';

async function demo() {
  await using storage = new IdbFrecencyStorage();

  using machine = createCommandMachine({
    items: [
      { id: itemId('settings'), value: 'Settings' },
      { id: itemId('profile'), value: 'Profile' },
    ],
    frecency: {
      enabled: true,
      storage,
      namespace: 'my-app',
    },
  });

  // Select an item -- recorded with Date.now() when the event runs
  machine.send({ type: 'ITEM_SELECT', id: itemId('settings') });

  // Frecency adds its bonus only for a non-empty query; an empty query keeps
  // registration order.
  machine.send({ type: 'SEARCH_CHANGE', query: 'set' });

  // send() is batched: both events run on the machine's next scheduler tick
  // (requestAnimationFrame in browsers). Wait for that tick before the `using`
  // scope ends, because disposing the machine drops events that have not run.
  const state = await new Promise<CommandState>((resolve) => {
    const sub = machine.subscribeState((next) => {
      if (next.search !== 'set') return;
      sub[Symbol.dispose]();
      resolve(next);
    });
  });
  return state.filteredIds; // the ranked order for 'set'
}
```
