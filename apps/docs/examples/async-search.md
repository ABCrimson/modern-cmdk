---
title: Async Search Example
description: Async data loading with Command.Loading, Command.Empty, and React Suspense.
---

# Async Search

Demonstrates async data loading from an API, loading states, and error handling using React 19 Suspense.

## Basic Async Search

```tsx
'use client';

import type { CommandItem } from 'modern-cmdk';
import { itemId } from 'modern-cmdk';
import { Command, useCommandState } from 'modern-cmdk/react';
import { Suspense } from 'react';

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

function SearchResults() {
  const query = useCommandState((state) => state.search);

  return (
    <Command.AsyncItems
      items={searchAPI(query)}
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
        <Suspense fallback={<Command.Loading loading>Searching...</Command.Loading>}>
          <SearchResults />
        </Suspense>
      </Command.List>
    </Command>
  );
}
```

::: tip
Setting `filter={false}` on `<Command>` disables client-side filtering. All filtering is delegated to your API.
:::

## With Error Boundary

`modern-cmdk/react` exports `CommandErrorBoundary`. Wrap async items in it so a failed request renders a fallback instead of unmounting the palette. Its `fallback` prop takes a node or a function of the caught `Error`, and `onError` receives the error and React's `ErrorInfo`. The boundary has no reset method: to retry, change its `key` so React mounts a fresh boundary.

```tsx
'use client';

import type { CommandItem } from 'modern-cmdk';
import { Command, CommandErrorBoundary, useCommandState } from 'modern-cmdk/react';
import { Suspense, useState } from 'react';

// App-owned: the searchAPI from the example above.
declare function searchAPI(query: string): Promise<readonly CommandItem[]>;

function SearchResults() {
  const query = useCommandState((state) => state.search);

  return (
    <Command.AsyncItems items={searchAPI(query)}>
      {(results) =>
        results.map((item) => (
          <Command.Item key={item.id} value={item.value}>
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
              <button type="button" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </button>
            </div>
          )}
        >
          <Suspense fallback={<Command.Loading loading>Searching...</Command.Loading>}>
            <SearchResults />
          </Suspense>
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
import { Suspense } from 'react';

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
          <Suspense fallback={<Command.Loading loading>Loading recent...</Command.Loading>}>
            <Command.AsyncItems items={recent}>
              {(items) =>
                items.map((item) => (
                  <Command.Item key={item.id} value={item.value}>
                    {item.value}
                  </Command.Item>
                ))
              }
            </Command.AsyncItems>
          </Suspense>
        </Command.Group>

        <Command.Group heading="All Commands">
          <Suspense fallback={<Command.Loading loading>Loading commands...</Command.Loading>}>
            <Command.AsyncItems items={allCommands}>
              {(items) =>
                items.map((item) => (
                  <Command.Item key={item.id} value={item.value}>
                    {item.value}
                  </Command.Item>
                ))
              }
            </Command.AsyncItems>
          </Suspense>
        </Command.Group>
      </Command.List>
    </Command>
  );
}
```

Each group loads independently and shows its own loading state. The first group to resolve renders immediately.
