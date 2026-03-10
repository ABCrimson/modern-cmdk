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

When enabled, each time a user selects an item via `onSelect`, the frecency engine records the selection with a `Temporal.Now.instant()` timestamp. Future searches re-rank results by applying a frecency bonus to the search score.

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

The `IdbFrecencyStorage` class implements `AsyncDisposable`, so you can use the `await using` pattern (ES2026 Explicit Resource Management) for automatic cleanup:

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
import { createCommandMachine } from 'modern-cmdk';
import { IdbFrecencyStorage } from 'modern-cmdk';

async function createMachineWithFrecency() {
  await using storage = new IdbFrecencyStorage();

  using machine = createCommandMachine({
    items: [...],
    frecency: {
      enabled: true,
      storage,
      namespace: 'my-app',
    },
  });

  // Both machine and storage are cleaned up when scope exits
}
```

## Temporal Duration Decay Buckets

The frecency algorithm uses `Temporal.Duration` to define time-based decay buckets. Items receive a recency multiplier based on when they were last used:

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

Where `frequency` is the total number of selections and `recencyWeight` is determined by the elapsed `Temporal.Duration` since the last use.

## Custom Decay Curves

Override the default decay configuration with `decayConfig`:

```tsx
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
```

::: details How Decay Weights Are Evaluated
The elapsed time since an item was last used is computed in hours using `Temporal.Instant`. The weight corresponding to the matching time bucket is applied. If the item is older than a month, `olderWeight` is used.

```typescript
// Internal implementation using Temporal
export function computeFrecencyBonus(
  history: FrecencyRecord,
  now: Temporal.Instant = Temporal.Now.instant(),
): number {
  const elapsed = now.since(history.lastUsed);
  const hours = elapsed.total('hours');

  const recencyWeight =
    hours < 1    ? 4.0 :
    hours < 24   ? 2.0 :
    hours < 168  ? 1.5 :   // 1 week
    hours < 720  ? 1.0 :   // 1 month
                   0.5;

  return history.frequency * recencyWeight;
}
```
:::

## Frecency Options

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Enable frecency ranking |
| `storage` | `FrecencyStorage` | `MemoryFrecencyStorage` | Storage adapter (memory or IndexedDB) |
| `namespace` | `string` | `'default'` | Namespace for storage isolation (useful for multiple palettes) |
| `decayConfig` | `DecayConfig` | See table above | Custom decay curve configuration |

## Core State Machine Usage

Frecency works at the core engine level, independent of React:

```typescript
import { createCommandMachine } from 'modern-cmdk';

using machine = createCommandMachine({
  items: [
    { id: 'settings', value: 'Settings' },
    { id: 'profile', value: 'Profile' },
  ],
  frecency: { enabled: true },
});

// Select an item — frecency is recorded with Temporal.Now.instant()
machine.send({ type: 'ITEM_SELECT', id: 'settings' });

// Future searches rank "Settings" higher due to frecency bonus
machine.send({ type: 'SEARCH_CHANGE', query: '' });
const state = machine.getState();
// state.filtered[0].id === 'settings' (boosted by frecency)
```
