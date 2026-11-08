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

import type { FrecencyStorage } from 'modern-cmdk';
import { IdbFrecencyStorage } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';

// One IndexedDB storage for the page. The machine disposes the storage it is given, and <Command>
// disposes its machine when it unmounts, and once more before the remount under StrictMode in
// development, so the palette gets a view that forwards load and save and leaves disposal to
// this module.
const idb = new IdbFrecencyStorage();
const storage: FrecencyStorage = {
  load: (namespace) => idb.load(namespace),
  save: (namespace, data) => idb.save(namespace, data),
  [Symbol.dispose]: () => {},
};

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

The machine owns the storage it is given: when the machine is disposed it saves any pending selection and then disposes the storage, and a disposed `IdbFrecencyStorage` loads empty data and ignores saves. React disposes the machine when `<Command>` unmounts, and under StrictMode in development it does so once before the remount that keeps running; a storage handed straight to `<Command>` is then already disposed when the palette is in use (every later `load()` is empty, every `save()` a no-op). So give `<Command>` a view like the one above, which forwards `load` and `save` and ignores the dispose; give a storage straight to `createCommandMachine`, which is created and disposed once, as shown below.

Selections are saved 1000 ms after the last one (a trailing debounce), when the page becomes hidden (`visibilitychange`) or is hidden for good (`pagehide`), and when the machine is disposed. When the stored data has loaded, it is merged into the engine (frequencies add up, the later `lastUsed` wins, selections made while it loaded are kept) and a non-empty search ranks with it. A load that fails is reported once through `console.warn` and the palette keeps working with in-memory data.

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
  // nothing to flush; the frecency engine awaits its own save before it disposes the storage.
}
```

With the core state machine, let the machine own the storage:

```typescript
import { createCommandMachine, IdbFrecencyStorage, itemId } from 'modern-cmdk';

async function createMachineWithFrecency() {
  const storage = new IdbFrecencyStorage();

  await using machine = createCommandMachine({
    items: [{ id: itemId('save'), value: 'Save' }],
    frecency: {
      enabled: true,
      storage,
      namespace: 'my-app',
    },
  });

  // Leaving the scope awaits the pending frecency save, then disposes the machine and, with it,
  // the storage. A storage with its own `await using` declared before a sync `using machine`
  // would be marked disposed before the machine's queued save runs, and drop it.
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
