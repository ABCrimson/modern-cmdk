---
title: Frecency Example
description: Frecency-boosted search with IndexedDB persistence across browser sessions.
---

# Frecency

Demonstrates frecency-boosted search ranking. Items you use frequently and recently get a bonus added to their match score for non-empty queries, which changes the ranked result order the machine uses for the default active item and keyboard navigation.

## Basic Frecency

Frecency is off unless `enabled: true` is set (`enabled` is optional and defaults to `false`), so every sample here sets it.

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

import { IdbFrecencyStorage } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';

// One IndexedDB storage for the page. A storage you pass is yours to dispose, so it belongs to this
// module and outlives every mount of <Command>.
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

What persists, and when:

- A selection is saved 1000 ms after the last selection (a trailing debounce), so a burst of selections is one write.
- The data is also saved at once when the page becomes hidden (`visibilitychange`) or is hidden for good (`pagehide`), and when the machine is disposed (the `Command` unmounts).
- On the next mount the machine loads the stored data in the background and merges it into the new session's selections (frequencies add, the later `lastUsed` wins). If a search is in progress when the load finishes, the results re-rank once; an empty search is unaffected, because frecency only re-ranks non-empty queries. A save that runs before the load has finished writes only this session's selections over the stored ones.

::: tip
`IdbFrecencyStorage` uses `idb-keyval@6.3.0` under the hood. It is included as a direct dependency of `modern-cmdk`, so no separate install is needed.
:::

## Custom Decay Curve

Tune the decay weights to match your usage patterns:

```tsx
import { Command } from 'modern-cmdk/react';

export function TunedFrecencyExample() {
  return (
    <Command
      label="Tuned Frecency"
      frecency={{
        enabled: true,
        decayConfig: {
          hourWeight: 6.0, // Very strong boost for items used in the last hour
          dayWeight: 3.0, // Strong boost for today
          weekWeight: 1.5, // Moderate boost for this week
          monthWeight: 0.8, // Slight boost for this month
          olderWeight: 0.2, // Minimal boost for older items
        },
      }}
    >
      {/* ... */}
    </Command>
  );
}
```

## Core Engine Usage

Frecency works at the core state machine level, independent of React:

```typescript
import { createCommandMachine, itemId } from 'modern-cmdk';
import type { CommandState } from 'modern-cmdk';
import { IdbFrecencyStorage } from 'modern-cmdk';
async function demo() {
  // Declarations dispose in reverse order: the machine first (its async dispose writes the last
  // selection), then the storage, which is yours to dispose. With a sync `using machine` after the
  // storage, the storage would be disposed before that save ran and the selection would be lost.
  await using storage = new IdbFrecencyStorage();
  await using machine = createCommandMachine({
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
  // (requestAnimationFrame in browsers, a microtask where it is absent). Subscribe
  // instead of reading getState() right after send(), which still returns the previous state,
  // and wait for that tick before the scope ends: disposing drops events that have not run.
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
