# Frecency

Frecency combines **frequency** and **recency** into a single ranking score. Items you use often and recently are ranked higher, similar to how Raycast, Alfred, and Spotlight work.

## Enabling Frecency

Pass the `frecency` option to `<Command>` to enable frecency ranking:

```tsx
'use client';

import { Command } from 'modern-cmdk/react';

function FrecencyPalette() {
  return (
    <Command frecency={{ enabled: true }}>
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>
        <Command.Item value="settings" onSelect={() => console.log('settings')}>
          Settings
        </Command.Item>
        <Command.Item value="profile" onSelect={() => console.log('profile')}>
          Profile
        </Command.Item>
        <Command.Item value="billing" onSelect={() => console.log('billing')}>
          Billing
        </Command.Item>
      </Command.List>
    </Command>
  );
}
```

Frecency is off by default: `enabled` is optional and defaults to `false`, so ranking applies only with `enabled: true` (the default flips to `true` in 2.0). When enabled, each time a user selects an item via `onSelect`, the frecency engine records the selection with a `Date.now()` timestamp. Future searches re-rank results by applying a frecency bonus to the search score.

::: tip
Frecency only affects the **order** of results, not whether they appear. An item must still match the search query to be shown. The frecency bonus is added to the search score to promote frequently/recently used items.
:::

## IndexedDB Persistence

By default, frecency data is stored in memory and resets on page reload. For persistence across sessions, use the built-in `IdbFrecencyStorage` adapter backed by `idb-keyval`:

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { IdbFrecencyStorage } from 'modern-cmdk';

const storage = new IdbFrecencyStorage();

function PersistentFrecencyPalette() {
  return (
    <Command
      frecency={{
        enabled: true,
        storage,
        namespace: 'my-app',
      }}
    >
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>
        <Command.Item value="settings" onSelect={() => console.log('settings')}>
          Settings
        </Command.Item>
        <Command.Item value="profile" onSelect={() => console.log('profile')}>
          Profile
        </Command.Item>
      </Command.List>
    </Command>
  );
}
```

::: tip
`idb-keyval` is included as a direct dependency of `modern-cmdk`, so no separate install is needed.
:::

## `await using` Pattern for Storage Cleanup

The `IdbFrecencyStorage` class implements `AsyncDisposable`, so you can use the `await using` pattern (ESNext explicit resource management) for automatic cleanup:

```typescript
import { IdbFrecencyStorage } from 'modern-cmdk';

async function withFrecencyStorage() {
  await using storage = new IdbFrecencyStorage();

  // Load existing frecency data
  const data = await storage.load('my-app');
  console.log('Frecency records:', data.records.size);

  // Storage is automatically disposed when scope exits
  // Pending writes are flushed, transactions are closed
}
```

When used with the core state machine directly:

```typescript
import { createCommandMachine, IdbFrecencyStorage, itemId } from 'modern-cmdk';

async function createMachineWithFrecency() {
  await using storage = new IdbFrecencyStorage();

  using machine = createCommandMachine({
    items: [{ id: itemId('save'), value: 'Save' }],
    frecency: {
      enabled: true,
      storage,
      namespace: 'my-app',
    },
  });

  // Both machine and storage are cleaned up when scope exits
}
```

## Time-Based Decay Buckets

The frecency algorithm uses time-based decay buckets. Items receive a recency multiplier based on when they were last used:

| Time Since Last Use | Recency Multiplier |
|---|---|
| < 1 hour | 4.0x |
| < 1 day | 2.0x |
| < 1 week | 1.5x |
| < 1 month | 1.0x |
| > 1 month | 0.5x |

The final frecency score is:

```
frecencyScore = frequency x recencyWeight
```

Where `frequency` is the total number of selections and `recencyWeight` is determined by the elapsed time since the last use.

## Custom Decay Curves

Override the default decay configuration with `decayConfig`:

```tsx
import { Command } from 'modern-cmdk/react';

export function FrecencyPalette() {
  return (
    <Command
      frecency={{
        enabled: true,
        decayConfig: {
          hourWeight: 5.0,   // Used within the last hour
          dayWeight: 3.0,    // Used within the last day
          weekWeight: 2.0,   // Used within the last week
          monthWeight: 1.5,  // Used within the last month
          olderWeight: 0.3,  // Anything older than a month
        },
      }}
    >
      {/* ... */}
    </Command>
  );
}
```

::: details How Decay Weights Are Evaluated
The elapsed time since an item was last used is computed in hours using `Date.now()`. The weight corresponding to the matching time bucket is applied. If the item is older than a month, `olderWeight` is used.

```typescript
import { DEFAULT_FRECENCY_DECAY } from 'modern-cmdk';
import type { FrecencyDecayConfig, FrecencyRecord } from 'modern-cmdk';

// Internal implementation using Date.now()
export function computeFrecencyBonus(
  history: FrecencyRecord,
  now: number = Date.now(),
  config: FrecencyDecayConfig = DEFAULT_FRECENCY_DECAY,
): number {
  const hours = (now - history.lastUsed) / 3_600_000;
  const { hourWeight = 4, dayWeight = 2, weekWeight = 1.5, monthWeight = 1, olderWeight = 0.5 } = config;

  const recencyWeight =
    hours < 1    ? hourWeight :
    hours < 24   ? dayWeight :
    hours < 168  ? weekWeight :   // 1 week
    hours < 720  ? monthWeight :  // 1 month
                   olderWeight;

  return history.frequency * recencyWeight;
}
```
:::

## Frecency Options

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` (optional) | `false` | Enable frecency ranking; the machine ranks by frecency only with `enabled: true`. `new FrecencyEngine({ storage, namespace })` needs no `enabled` field |
| `storage` | `FrecencyStorage` | `MemoryFrecencyStorage` | Storage adapter (memory or IndexedDB) |
| `namespace` | `string` | `'default'` | Namespace for storage isolation (useful for multiple palettes) |
| `decayConfig` | `FrecencyDecayConfig` | See table above | Custom decay curve configuration |

## Core State Machine Usage

Frecency works at the core engine level, independent of React:

```typescript
import { createCommandMachine, itemId } from 'modern-cmdk';

using machine = createCommandMachine({
  items: [
    { id: itemId('settings'), value: 'Settings' },
    { id: itemId('profile'), value: 'Profile' },
  ],
  frecency: { enabled: true },
});

// Select an item — frecency is recorded with Date.now()
machine.send({ type: 'ITEM_SELECT', id: itemId('settings') });

// Future searches rank "Settings" higher due to frecency bonus
machine.send({ type: 'SEARCH_CHANGE', query: '' });
const state = machine.getState();
// state.filteredIds[0] === 'settings' (boosted by frecency)
```
