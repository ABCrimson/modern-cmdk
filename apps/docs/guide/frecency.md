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

Frecency is off by default: `enabled` is optional and defaults to `false`, so ranking applies only with `enabled: true` (the default flips to `true` in 2.0). When enabled, each time a user selects an item (a click, Enter, or a shortcut under `shortcutAction: 'select'`), the frecency engine records the selection with a `Date.now()` timestamp. Future searches re-rank results by applying a frecency bonus to the search score. Frecency re-ranks only non-empty queries: the empty query, and every query under `filter={false}`, list the items in registration order.

::: tip
Frecency only affects the **order** of results, not whether they appear. An item must still match the search query to be shown. The frecency bonus is added to the search score to promote frequently/recently used items.
:::

## IndexedDB Persistence

By default, frecency data is stored in memory and resets on page reload. For persistence across sessions, use the built-in `IdbFrecencyStorage` adapter backed by `idb-keyval`:

```tsx
'use client';

import { IdbFrecencyStorage } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';

// One IndexedDB storage for the page. A storage you pass is yours to dispose, so it belongs to this
// module and outlives every mount of <Command>.
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
        <Command.Item id="settings" value="settings" onSelect={() => console.log('settings')}>
          Settings
        </Command.Item>
        <Command.Item id="profile" value="profile" onSelect={() => console.log('profile')}>
          Profile
        </Command.Item>
      </Command.List>
    </Command>
  );
}
```

The stored history is keyed by item id. An `<Command.Item>` without `id` registers under a generated `useId` id, which follows the item's place in the React tree and not the item, so give every item whose history you persist a stable `id` (for a fetched item, `id={item.id}`).

A storage you pass in `frecency.storage` is yours to dispose; the engine disposes only a storage it created itself (the in-memory one it uses when you pass none). The React root keeps one machine per mount and never disposes it: when `<Command>` unmounts, StrictMode replays its effects in development, or an `<Activity>` hides it, the root suspends the machine, which starts the save of any pending selections and detaches the page-exit listeners, and it resumes the machine when the component is set up again. Your storage is untouched by that, so the palette in use keeps loading and saving. A disposed `IdbFrecencyStorage` loads empty data and ignores saves.

Selections are saved 1000 ms after the last one (a trailing debounce), when the page becomes hidden (`visibilitychange`) or is hidden for good (`pagehide`), when the machine is suspended (the React root does so on unmount and when an `<Activity>` hides it), and when the machine is disposed. When the stored data has loaded, it is merged into the engine (frequencies add up, the later `lastUsed` wins, selections made while it loaded are kept) and a non-empty search ranks with it. A save waits for the load in flight, so a selection made before the stored history arrives is merged into it, never written over it. A load that fails is reported once through `console.warn`; the palette keeps working with in-memory data, and that engine writes nothing for the rest of its life, so the stored history stays untouched. A load that never settles holds every save, and `await using` with it.

`new IdbFrecencyStorage(dbName?, storeName?)` defaults to the database `'modern-cmdk'` and the store `'frecency'`; a second `storeName` in an existing database works.

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

  // The storage is disposed when the scope exits. It only marks itself disposed: afterwards
  // load() returns empty data and save() and delete() do nothing. It keeps no write queue and
  // no open transaction (each operation opens its own and closes its connection), so there is
  // nothing in it to flush.
}
```

With the core state machine, the storage you pass is yours to dispose, so declare it with `await using` too:

```typescript
import { createCommandMachine, IdbFrecencyStorage, itemId } from 'modern-cmdk';

async function createMachineWithFrecency() {
  // Declarations dispose in reverse order: the machine first, then the storage. The machine's async
  // dispose writes the last selection to the storage, so the storage must still be live then.
  await using storage = new IdbFrecencyStorage();
  await using machine = createCommandMachine({
    items: [{ id: itemId('save'), value: 'Save' }],
    frecency: {
      enabled: true,
      storage,
      namespace: 'my-app',
    },
  });

  // Leaving the scope disposes the machine, which awaits the pending frecency save, and then the
  // storage. Pair the storage with a sync `using machine` and the storage is disposed before the
  // save runs, so the last selection is lost: keep `await using` for the machine.
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

Frecency works at the core engine level, independent of React. `send()` is scheduled (on `requestAnimationFrame` in a browser, on a microtask where there is none), so `getState()` right after it still returns the previous state: subscribe and read the state when it changes. Frecency re-ranks only non-empty queries, so the sample searches for `open`:

```typescript
import { createCommandMachine, itemId } from 'modern-cmdk';
import type { CommandState } from 'modern-cmdk';

async function rankByFrecency(): Promise<readonly string[]> {
  await using machine = createCommandMachine({
    items: [
      { id: itemId('settings'), value: 'Open settings' },
      { id: itemId('sessions'), value: 'Open sessions' },
    ],
    frecency: { enabled: true },
  });

  const next = Promise.withResolvers<CommandState>();
  using subscription = machine.subscribeState(next.resolve);

  // Both events run in the same batch, in order: the selection is recorded with Date.now(),
  // then the search ranks with it. The batch emits one stateChange; where there is no requestAnimationFrame (Node), the background frecency load can emit a second one with the same order.
  machine.send({ type: 'ITEM_SELECT', id: itemId('sessions') });
  machine.send({ type: 'SEARCH_CHANGE', query: 'open' });

  const state = await next.promise;
  return state.filteredIds; // ['sessions', 'settings']: "Open sessions" first, boosted by frecency
}
```
