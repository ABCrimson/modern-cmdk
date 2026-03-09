# Async Items

`<Command.AsyncItems>` lets you load command items from async data sources using React 19's `use()` hook and Suspense integration.

## Basic Usage

Wrap your async data source in `<Command.AsyncItems>`. The component suspends while the data is loading, showing a fallback via `<Command.Loading>` or a custom `fallback` prop.

```tsx
'use client';

import { Command } from 'modern-cmdk/react';

async function fetchCommands(query: string): Promise<CommandItem[]> {
  const res = await fetch(`/api/commands?q=${encodeURIComponent(query)}`);
  return res.json();
}

function AsyncCommandPalette() {
  return (
    <Command>
      <Command.Input placeholder="Search commands..." />
      <Command.List>
        <Command.Loading>Searching...</Command.Loading>
        <Command.Empty>No results found.</Command.Empty>

        <Command.AsyncItems
          source={(query) => fetchCommands(query)}
          fallback={<div>Loading results...</div>}
        >
          {(items) =>
            items.map((item) => (
              <Command.Item key={item.id} value={item.value} onSelect={item.onSelect}>
                {item.label}
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

For real-world usage, you typically want to debounce the search input before making API calls. Combine `<Command.AsyncItems>` with `useTransition` for a smooth experience:

```tsx
'use client';

import { Command, useCommandState } from 'modern-cmdk/react';
import { Suspense, use, useTransition } from 'react';

interface SearchResult {
  id: string;
  title: string;
  description: string;
  category: string;
}

async function searchAPI(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) throw new Error(`Search failed: ${response.status}`);
  return response.json();
}

function SearchResults() {
  const query = useCommandState((state) => state.search);

  return (
    <Command.AsyncItems
      source={() => searchAPI(query)}
      debounce={300}
      fallback={<Command.Loading>Searching...</Command.Loading>}
    >
      {(results) => (
        <>
          {Object.entries(
            Object.groupBy(results, (r) => r.category)
          ).map(([category, items]) => (
            <Command.Group key={category} heading={category}>
              {items!.map((item) => (
                <Command.Item
                  key={item.id}
                  value={item.title}
                  keywords={[item.description]}
                  onSelect={() => console.log('Selected:', item.id)}
                >
                  <span>{item.title}</span>
                  <span className="text-muted">{item.description}</span>
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
        <Suspense fallback={<Command.Loading>Searching...</Command.Loading>}>
          <SearchResults />
        </Suspense>
      </Command.List>
    </Command>
  );
}
```

## Loading States

`<Command.AsyncItems>` integrates with React Suspense boundaries. You can nest multiple `<Suspense>` boundaries for granular loading states:

```tsx
<Command.List>
  <Command.Group heading="Recent">
    <Suspense fallback={<Command.Loading>Loading recent...</Command.Loading>}>
      <Command.AsyncItems source={() => fetchRecent()}>
        {(items) => items.map((item) => (
          <Command.Item key={item.id} value={item.value}>{item.label}</Command.Item>
        ))}
      </Command.AsyncItems>
    </Suspense>
  </Command.Group>

  <Command.Group heading="All Commands">
    <Suspense fallback={<Command.Loading>Loading commands...</Command.Loading>}>
      <Command.AsyncItems source={() => fetchAllCommands()}>
        {(items) => items.map((item) => (
          <Command.Item key={item.id} value={item.value}>{item.label}</Command.Item>
        ))}
      </Command.AsyncItems>
    </Suspense>
  </Command.Group>
</Command.List>
```

## Error Handling

Wrap `<Command.AsyncItems>` in an error boundary for graceful error handling. React 19's error boundary API works seamlessly:

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div role="alert" data-command-error>
      <p>Search failed: {error.message}</p>
      <button onClick={resetErrorBoundary}>Retry</button>
    </div>
  );
}

export function ResilientSearch() {
  return (
    <Command>
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <Command.AsyncItems
            source={(query) => searchAPI(query)}
            fallback={<Command.Loading>Searching...</Command.Loading>}
          >
            {(items) => items.map((item) => (
              <Command.Item key={item.id} value={item.value} onSelect={item.onSelect}>
                {item.label}
              </Command.Item>
            ))}
          </Command.AsyncItems>
        </ErrorBoundary>
      </Command.List>
    </Command>
  );
}
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `source` | `(query: string) => Promise<T[]>` | Required | Async function returning items |
| `fallback` | `ReactNode` | `undefined` | Fallback UI during loading (also works via `<Suspense>`) |
| `debounce` | `number` | `0` | Debounce delay in ms before calling `source` |
| `children` | `(items: T[]) => ReactNode` | Required | Render function receiving resolved items |

::: tip
`<Command.AsyncItems>` uses React 19's `use()` hook internally. The promise returned by `source` is consumed directly by `use()`, triggering Suspense while pending. No additional state management is needed.
:::

::: warning
When using `filter={false}` on `<Command>`, all filtering is delegated to your API. The built-in search engine is bypassed entirely, and the `source` function receives the raw search query.
:::
