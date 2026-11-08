# Async Items

`<Command.AsyncItems>` lets you load command items from async data sources using React 19's `use()` hook and Suspense integration.

## Basic Usage

Wrap your async data source in `<Command.AsyncItems>`. The component suspends while the data is loading and shows its `fallback` prop from its own `<Suspense>` boundary until the promise resolves.

```tsx
'use client';

import type { CommandItem } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { useMemo } from 'react';

async function fetchCommands(): Promise<readonly CommandItem[]> {
  const res = await fetch('/api/commands');
  return res.json();
}

function AsyncCommandPalette() {
  // useMemo keeps one promise across re-renders; fetchCommands() inline in the JSX
  // would create a new promise on every render and suspend again each time.
  const commands = useMemo(() => fetchCommands(), []);

  return (
    <Command>
      <Command.Input placeholder="Search commands..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>

        <Command.AsyncItems
          items={commands}
          fallback={<div>Loading results...</div>}
        >
          {(items) =>
            items.map((item) => (
              <Command.Item
                key={item.id}
                id={item.id}
                value={item.value}
                onSelect={() => item.onSelect?.()}
              >
                {item.value}
              </Command.Item>
            ))
          }
        </Command.AsyncItems>
      </Command.List>
    </Command>
  );
}
```

## Debounced API Search

For real-world usage, you typically want to debounce the search input before making API calls. The sample defines a `useDebouncedValue` hook (a `setTimeout` that restarts on every keystroke) and passes the debounced query to a cached search, read through `useMemo` keyed on that query. `<Command.AsyncItems>` suspends while its promise is pending and shows `fallback` meanwhile.

The promise must be created where it is cached, not in render: a new promise on every render suspends again each time (see [Server-Side Rendering](/guide/ssr)). The module-level `Map` below keys one promise per query, so re-rendering with the same query reuses it and returning to an earlier query is served from the cache. It is never evicted, so bound it in a real app.

```tsx
'use client';

import type { CommandItem } from 'modern-cmdk';
import { itemId } from 'modern-cmdk';
import { Command, useCommandState } from 'modern-cmdk/react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

interface ApiResult {
  id: string;
  title: string;
  description: string;
  category: string;
}

// Returns `value` only after it has stopped changing for `delayMs`
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

// Map raw API results into CommandItem shape — AsyncItems requires
// Promise<readonly CommandItem[]> so it can register results with the machine
async function searchAPI(query: string): Promise<readonly CommandItem[]> {
  if (!query.trim()) return [];

  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) throw new Error(`Search failed: ${response.status}`);
  const results: ApiResult[] = await response.json();

  return results.map((r) => ({
    id: itemId(r.id),
    value: r.title,
    keywords: [r.description],
    data: { description: r.description, category: r.category },
  }));
}

// One promise per query, created here so it is stable across renders (React's pattern
// for a promise created on the client and read with use())
const cache = new Map<string, Promise<readonly CommandItem[]>>();

function cachedSearch(query: string): Promise<readonly CommandItem[]> {
  let promise = cache.get(query);
  if (!promise) {
    promise = searchAPI(query);
    cache.set(query, promise);
  }
  return promise;
}

function SearchResults() {
  const query = useDebouncedValue(
    useCommandState((state) => state.search),
    200,
  );

  // The promise comes from the cache, once per debounced query, never from a fetch in the JSX
  const results = useMemo(() => cachedSearch(query), [query]);

  return (
    <Command.AsyncItems
      items={results}
      fallback={<Command.Loading loading>Searching...</Command.Loading>}
    >
      {(loaded) => {
        const groups: ReactNode[] = [];
        for (const [category, items] of Map.groupBy(loaded, (r) => String(r.data?.category))) {
          groups.push(
            <Command.Group key={category} heading={category}>
              {items.map((item) => (
                <Command.Item
                  key={item.id}
                  id={item.id}
                  value={item.value}
                  keywords={item.keywords ?? []}
                  onSelect={() => console.log('Selected:', item.id)}
                >
                  <span>{item.value}</span>
                  <span className="text-muted">{String(item.data?.description)}</span>
                </Command.Item>
              ))}
            </Command.Group>,
          );
        }
        return groups;
      }}
    </Command.AsyncItems>
  );
}

export function DebouncedSearchPalette() {
  return (
    <Command label="Search" filter={false}>
      <Command.Input placeholder="Search anything..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>
        <SearchResults />
      </Command.List>
    </Command>
  );
}
```

## Loading States

Each `<Command.AsyncItems>` renders its own `<Suspense>` boundary around the loader and shows its `fallback` prop there, so give each one its own `fallback` for granular loading states; an enclosing `<Suspense>` never shows its fallback for it. `state.loading` is `true` while any `<Command.AsyncItems>` is pending (the machine's `LOADING` event, sent while the fallback is mounted), so `<Command.Loading>` without props and the list's `aria-busy` follow it. The `loading` prop of `<Command.Loading>` is an override, not a requirement; keep it on a `<Command.Loading>` used as a fallback so the element renders on the fallback's first render, before the machine's update:

```tsx
'use client';

import type { CommandItem } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';
import { useMemo } from 'react';

async function fetchRecent(): Promise<readonly CommandItem[]> {
  const res = await fetch('/api/commands/recent');
  return res.json();
}

async function fetchAllCommands(): Promise<readonly CommandItem[]> {
  const res = await fetch('/api/commands');
  return res.json();
}

export function GranularLoading() {
  // One promise per source, kept across re-renders by useMemo. The two endpoints return disjoint ids:
  // the registry holds one entry per id
  const recent = useMemo(() => fetchRecent(), []);
  const allCommands = useMemo(() => fetchAllCommands(), []);

  return (
    <Command>
      <Command.Input placeholder="Search commands..." />
      <Command.List>
        <Command.Group heading="Recent">
          <Command.AsyncItems
            items={recent}
            fallback={<Command.Loading loading>Loading recent...</Command.Loading>}
          >
            {(items) => items.map((item) => (
              <Command.Item key={item.id} id={item.id} value={item.value}>{item.value}</Command.Item>
            ))}
          </Command.AsyncItems>
        </Command.Group>

        <Command.Group heading="All Commands">
          <Command.AsyncItems
            items={allCommands}
            fallback={<Command.Loading loading>Loading commands...</Command.Loading>}
          >
            {(items) => items.map((item) => (
              <Command.Item key={item.id} id={item.id} value={item.value}>{item.value}</Command.Item>
            ))}
          </Command.AsyncItems>
        </Command.Group>
      </Command.List>
    </Command>
  );
}
```

## Error Handling

Wrap `<Command.AsyncItems>` in `<CommandErrorBoundary>`, exported by `modern-cmdk/react`, so a rejected promise renders a fallback instead of unmounting the tree. Its `fallback` is a node or a function `(error: Error, reset: () => void) => ReactNode`, and `onError` receives the error and React's `ErrorInfo`. The first sample retries by changing the boundary's `key`, which remounts the subtree; the second uses `reset` and `resetKeys`. The promise is cached at module level so re-renders reuse it, which means a rejected promise would be reused too: `onError` deletes the cache entry before the remount, so the retry fetches again.

```tsx
'use client';

import type { CommandItem } from 'modern-cmdk';
import { Command, CommandErrorBoundary } from 'modern-cmdk/react';
import { useMemo, useState } from 'react';

async function fetchCommands(): Promise<readonly CommandItem[]> {
  const res = await fetch('/api/commands');
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

// Created once per key and reused across renders; a rejected entry is deleted in onError
const cache = new Map<string, Promise<readonly CommandItem[]>>();

function cachedCommands(): Promise<readonly CommandItem[]> {
  let promise = cache.get('commands');
  if (!promise) {
    promise = fetchCommands();
    cache.set('commands', promise);
  }
  return promise;
}

function SearchResults() {
  // After the boundary resets, the remount reads the cache again, which onError emptied
  const commands = useMemo(() => cachedCommands(), []);

  return (
    <Command.AsyncItems
      items={commands}
      fallback={<Command.Loading loading>Searching...</Command.Loading>}
    >
      {(items) =>
        items.map((item) => (
          <Command.Item key={item.id} id={item.id} value={item.value}>
            {item.value}
          </Command.Item>
        ))
      }
    </Command.AsyncItems>
  );
}

export function ResilientSearch() {
  const [attempt, setAttempt] = useState(0);

  return (
    <Command>
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>
        <CommandErrorBoundary
          key={attempt}
          onError={() => cache.delete('commands')}
          fallback={(error) => (
            <div role="alert" data-command-error>
              <p>Search failed: {error.message}</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </button>
            </div>
          )}
        >
          <SearchResults />
        </CommandErrorBoundary>
      </Command.List>
    </Command>
  );
}
```

### Reset and resetKeys

Its function `fallback` also receives `reset`, which clears the caught error so the children render again, and `resetKeys` resets the boundary on its own when any entry changes (compared with `Object.is`, by position). A reset re-renders the same children, so `onError` clears the promise cache when the error is caught: a Retry click and a `resetKeys` change both fetch again.

```tsx
'use client';

import type { CommandItem } from 'modern-cmdk';
import { Command, CommandErrorBoundary } from 'modern-cmdk/react';

// App-owned: the promise cache of the sample above.
declare const cache: Map<string, Promise<readonly CommandItem[]>>;
declare function SearchResults(): React.ReactNode;

export function ResettableSearch({ tenant }: { tenant: string }) {
  return (
    <Command label="Search" filter={false}>
      <Command.Input placeholder="Search..." />
      <Command.List>
        <CommandErrorBoundary
          resetKeys={[tenant]}
          onError={() => cache.clear()}
          fallback={(error, reset) => (
            <div role="alert">
              <p>Search failed: {error.message}</p>
              <button type="button" onClick={reset}>
                Retry
              </button>
            </div>
          )}
        >
          <SearchResults />
        </CommandErrorBoundary>
      </Command.List>
    </Command>
  );
}
```

## Registration

When the promise resolves, the batch is registered with the machine and is searchable. Each resolution replaces the previous batch: the old batch's items leave the registry and the search index, and unmounting the component removes its batch. The registry holds one entry per id, so loaded ids must be unique across the `<Command.AsyncItems>` sources of one palette; a duplicate id replaces the other entry, and either source's cleanup unregisters it.

Render `<Command.Item id={item.id}>` for each loaded item, as the samples do: the rendered item and the loaded item are then one entry, and the rendered item's `onSelect` and `keywords` win. A `<Command.Item>` without `id` registers under a generated id and counts a second time; in development, an Item inside `<Command.AsyncItems>` without `id` whose `value` is in the batch warns once. A render function that renders no `<Command.Item>` keeps the loaded items searchable.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `items` | `Promise<readonly CommandItem[]>` | Required | Promise resolving to command items |
| `fallback` | `ReactNode` | `undefined` | Fallback UI while the promise is pending, shown by the component's own `<Suspense>` boundary; without it nothing renders while pending, and an enclosing `<Suspense>` never shows its fallback |
| `children` | `(items: readonly CommandItem[]) => ReactNode` | Required | Render function receiving resolved items |

::: tip
`<Command.AsyncItems>` uses React 19's `use()` hook internally. The promise passed to `items` is consumed directly by `use()`, triggering Suspense while pending. No additional state management is needed.

Once the promise resolves, the items are also sent to the machine in an `ITEMS_LOADED` event (from a layout effect). Like every `send()` it is scheduled, not synchronous: the machine registers the items, binds their `shortcut`s (the shortcut of a `disabled` item is not bound) and refilters once with the rest of the batch, so `machine.getState()` shows them on the next frame, not in the same call.
:::

::: warning
When using `filter={false}` on `<Command>`, all filtering is delegated to your API. The built-in search engine is bypassed entirely.
:::
