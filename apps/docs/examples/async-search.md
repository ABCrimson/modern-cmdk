---
title: Async Search Example
description: Async data loading with Command.Loading, Command.Empty, and React Suspense.
---

# Async Search

Demonstrates async data loading from an API, loading states, and error handling using React 19 Suspense; each `Command.AsyncItems` suspends through its own boundary and shows its own `fallback`.

## Basic Async Search

```tsx
'use client';

import type { CommandItem } from 'modern-cmdk';
import { itemId } from 'modern-cmdk';
import { Command, useCommandState } from 'modern-cmdk/react';

interface ApiResult {
  id: string;
  title: string;
  description: string;
  category: string;
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

// One promise per query, created here so it is stable across renders: a promise created
// in render is new every time and suspends again (see the Server-Side Rendering guide).
// The Map is never evicted; bound it in a real app.
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
  const query = useCommandState((state) => state.search);

  return (
    <Command.AsyncItems
      items={cachedSearch(query)}
      fallback={<Command.Loading loading>Searching...</Command.Loading>}
    >
      {(results) => (
        <>
          {Object.entries(
            Object.groupBy(results, (r) => String(r.data?.category))
          ).map(([category, items]) => (
            <Command.Group key={category} heading={category}>
              {items!.map((item) => (
                <Command.Item
                  key={item.id}
                  id={item.id}
                  value={item.value}
                  keywords={item.keywords ?? []}
                  onSelect={() => console.log('Selected:', item.id)}
                >
                  <span>{item.value}</span>
                  <span style={{ opacity: 0.5, fontSize: '0.875em' }}>
                    {String(item.data?.description)}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </>
      )}
    </Command.AsyncItems>
  );
}

export function AsyncSearchExample() {
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

::: tip
Setting `filter={false}` on `<Command>` disables client-side filtering. All filtering is delegated to your API.
:::

Each `Command.Item` passes `id={item.id}`, the id of the loaded item, so the rendered item and the loaded item are one registration and the rendered item's `onSelect` and `keywords` win. An item without an `id` registers under a generated id and counts twice; in development it warns once. With `filter={false}` every resolved batch replaces the previous one: `Command.AsyncItems` unregisters exactly the ids of the old batch when the promise changes or the component unmounts, so results of earlier queries do not stay counted or keyboard-reachable.

## With Error Boundary

`modern-cmdk/react` exports `CommandErrorBoundary`. Wrap async items in it so a failed request renders a fallback instead of unmounting the palette. Its `fallback` prop takes a node or a function `(error, reset)`, and `onError` receives the error and React's `ErrorInfo`. The sample retries by changing the boundary's `key` so React mounts a fresh boundary; `reset` and `resetKeys` are the alternative (see below). The search promises are cached per query, so a rejected one would be reused: the Retry button clears the cache before it changes the key, so the retry fetches again.

```tsx
'use client';

import type { CommandItem } from 'modern-cmdk';
import { Command, CommandErrorBoundary, useCommandState } from 'modern-cmdk/react';
import { useState } from 'react';

// App-owned: the cache and cachedSearch from the example above.
declare const cache: Map<string, Promise<readonly CommandItem[]>>;
declare function cachedSearch(query: string): Promise<readonly CommandItem[]>;

function SearchResults() {
  const query = useCommandState((state) => state.search);

  return (
    <Command.AsyncItems
      items={cachedSearch(query)}
      fallback={<Command.Loading loading>Searching...</Command.Loading>}
    >
      {(results) =>
        results.map((item) => (
          <Command.Item key={item.id} id={item.id} value={item.value}>
            {item.value}
          </Command.Item>
        ))
      }
    </Command.AsyncItems>
  );
}

export function ResilientSearchExample() {
  const [attempt, setAttempt] = useState(0);

  return (
    <Command label="Search" filter={false}>
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>
        <CommandErrorBoundary
          key={attempt}
          onError={(error) => console.error('Search failed:', error)}
          fallback={(error) => (
            <div role="alert" style={{ padding: '16px', textAlign: 'center' }}>
              <p>Search failed: {error.message}</p>
              <button
                type="button"
                onClick={() => {
                  // A rejected promise stays cached: clear it so the retry fetches again
                  cache.clear();
                  setAttempt((n) => n + 1);
                }}
              >
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

The fallback's second argument `reset` clears the caught error so the children render again, and `resetKeys` resets the boundary on its own when any entry changes. A reset re-renders the same children, so `onError` clears the promise cache when the error is caught: a Retry click and a `resetKeys` change both fetch again.

```tsx
'use client';

import type { CommandItem } from 'modern-cmdk';
import { Command, CommandErrorBoundary } from 'modern-cmdk/react';

// App-owned: the cache from the example above.
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

## Multiple Async Sources

Load items from multiple sources with independent Suspense boundaries:

```tsx
import type { CommandItem } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';

// App-owned data sources. Create the promises where they can be cached
// (a framework loader or a cache); a promise created in render restarts on every render.
declare const recent: Promise<readonly CommandItem[]>;
declare const allCommands: Promise<readonly CommandItem[]>;

export function MultiSourceExample() {
  return (
    <Command label="Search">
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Group heading="Recent">
          <Command.AsyncItems
            items={recent}
            fallback={<Command.Loading loading>Loading recent...</Command.Loading>}
          >
            {(items) =>
              items.map((item) => (
                <Command.Item key={item.id} id={item.id} value={item.value}>
                  {item.value}
                </Command.Item>
              ))
            }
          </Command.AsyncItems>
        </Command.Group>

        <Command.Group heading="All Commands">
          <Command.AsyncItems
            items={allCommands}
            fallback={<Command.Loading loading>Loading commands...</Command.Loading>}
          >
            {(items) =>
              items.map((item) => (
                <Command.Item key={item.id} id={item.id} value={item.value}>
                  {item.value}
                </Command.Item>
              ))
            }
          </Command.AsyncItems>
        </Command.Group>
      </Command.List>
    </Command>
  );
}
```

Item ids must be unique across the sources of one palette: both sources register through the same machine, and a replaced or unmounted batch unregisters the ids it loaded, so an id shared by two sources would remove the other source's entry. Each group loads independently and shows its own loading state. `state.loading` is `true` while any of them is pending; the `loading` prop on a fallback `<Command.Loading>` is an override, kept so the element renders on the fallback's first render. The first group to resolve renders immediately.
