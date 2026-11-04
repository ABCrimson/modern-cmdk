# Async Items

`<Command.AsyncItems>` lets you load command items from async data sources using React 19's `use()` hook and Suspense integration.

## Basic Usage

Wrap your async data source in `<Command.AsyncItems>`. The component suspends while the data is loading and shows its `fallback` prop from its own `<Suspense>` boundary until the promise resolves.

```tsx
'use client';

import type { CommandItem } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';

async function fetchCommands(): Promise<readonly CommandItem[]> {
  const res = await fetch('/api/commands');
  return res.json();
}

function AsyncCommandPalette() {
  return (
    <Command>
      <Command.Input placeholder="Search commands..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>

        <Command.AsyncItems
          items={fetchCommands()}
          fallback={<div>Loading results...</div>}
        >
          {(items) =>
            items.map((item) => (
              <Command.Item key={item.id} value={item.value} onSelect={() => item.onSelect?.()}>
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

For real-world usage, you typically want to debounce the search input before making API calls. `<Command.AsyncItems>` suspends while its promise is pending and shows `fallback` meanwhile:

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
              {(items ?? []).map((item) => (
                <Command.Item
                  key={item.id}
                  value={item.value}
                  keywords={item.keywords ?? []}
                  onSelect={() => console.log('Selected:', item.id)}
                >
                  <span>{item.value}</span>
                  <span className="text-muted">{String(item.data?.description)}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </>
      )}
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

Each `<Command.AsyncItems>` renders its own `<Suspense>` boundary around the loader and shows its `fallback` prop there, so give each one its own `fallback` for granular loading states; an enclosing `<Suspense>` never shows its fallback for it. `<Command.Loading>` renders only while the machine reports loading, so pass `loading` to show it as a fallback:

```tsx
'use client';

import type { CommandItem } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';

async function fetchRecent(): Promise<readonly CommandItem[]> {
  const res = await fetch('/api/commands/recent');
  return res.json();
}

async function fetchAllCommands(): Promise<readonly CommandItem[]> {
  const res = await fetch('/api/commands');
  return res.json();
}

export function GranularLoading() {
  return (
    <Command>
      <Command.Input placeholder="Search commands..." />
      <Command.List>
        <Command.Group heading="Recent">
          <Command.AsyncItems
            items={fetchRecent()}
            fallback={<Command.Loading loading>Loading recent...</Command.Loading>}
          >
            {(items) => items.map((item) => (
              <Command.Item key={item.id} value={item.value}>{item.value}</Command.Item>
            ))}
          </Command.AsyncItems>
        </Command.Group>

        <Command.Group heading="All Commands">
          <Command.AsyncItems
            items={fetchAllCommands()}
            fallback={<Command.Loading loading>Loading commands...</Command.Loading>}
          >
            {(items) => items.map((item) => (
              <Command.Item key={item.id} value={item.value}>{item.value}</Command.Item>
            ))}
          </Command.AsyncItems>
        </Command.Group>
      </Command.List>
    </Command>
  );
}
```

## Error Handling

Wrap `<Command.AsyncItems>` in `<CommandErrorBoundary>`, exported by `modern-cmdk/react`, so a rejected promise renders a fallback instead of unmounting the tree. Its `fallback` is a node or a function `(error: Error) => ReactNode`, and `onError` receives the error and React's `ErrorInfo`. It has no reset prop: change its `key` to remount the subtree and retry, as the sample does.

```tsx
'use client';

import type { CommandItem } from 'modern-cmdk';
import { Command, CommandErrorBoundary } from 'modern-cmdk/react';
import { useState } from 'react';

async function fetchCommands(): Promise<readonly CommandItem[]> {
  const res = await fetch('/api/commands');
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

function SearchResults() {
  return (
    <Command.AsyncItems
      items={fetchCommands()}
      fallback={<Command.Loading loading>Searching...</Command.Loading>}
    >
      {(items) =>
        items.map((item) => (
          <Command.Item key={item.id} value={item.value}>
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

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `items` | `Promise<readonly CommandItem[]>` | Required | Promise resolving to command items |
| `fallback` | `ReactNode` | `undefined` | Fallback UI while the promise is pending, shown by the component's own `<Suspense>` boundary (an enclosing `<Suspense>` never shows its fallback) |
| `children` | `(items: readonly CommandItem[]) => ReactNode` | Required | Render function receiving resolved items |

::: tip
`<Command.AsyncItems>` uses React 19's `use()` hook internally. The promise passed to `items` is consumed directly by `use()`, triggering Suspense while pending. No additional state management is needed.
:::

::: warning
When using `filter={false}` on `<Command>`, all filtering is delegated to your API. The built-in search engine is bypassed entirely.
:::
