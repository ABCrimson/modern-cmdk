---
title: Async Search Example
description: Async data loading with Command.Loading, Command.Empty, and useTransition for a smooth search experience.
---

# Async Search

Demonstrates async data loading from an API, debounced input, loading states, and error handling using React 19 Suspense and `useTransition`.

## Basic Async Search

```tsx
'use client';

import { Command, useCommandState } from 'modern-cmdk/react';
import { Suspense } from 'react';

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
      items={searchAPI(query)}
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
                  <span style={{ opacity: 0.5, fontSize: '0.875em' }}>
                    {item.description}
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
        <Suspense fallback={<Command.Loading>Searching...</Command.Loading>}>
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

Wrap async items in an error boundary for graceful error handling:

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div role="alert" style={{ padding: '16px', textAlign: 'center' }}>
      <p>Search failed: {error.message}</p>
      <button onClick={resetErrorBoundary}>Retry</button>
    </div>
  );
}

export function ResilientSearchExample() {
  return (
    <Command label="Search" filter={false}>
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <Command.AsyncItems
            items={searchAPI(query)}
            fallback={<Command.Loading>Searching...</Command.Loading>}
          >
            {(items) =>
              items.map((item) => (
                <Command.Item key={item.id} value={item.title} onSelect={() => {}}>
                  {item.title}
                </Command.Item>
              ))
            }
          </Command.AsyncItems>
        </ErrorBoundary>
      </Command.List>
    </Command>
  );
}
```

## Multiple Async Sources

Load items from multiple sources with independent Suspense boundaries:

```tsx
<Command.List>
  <Command.Group heading="Recent">
    <Suspense fallback={<Command.Loading>Loading recent...</Command.Loading>}>
      <Command.AsyncItems items={fetchRecent()}>
        {(items) => items.map((item) => (
          <Command.Item key={item.id} value={item.value}>{item.label}</Command.Item>
        ))}
      </Command.AsyncItems>
    </Suspense>
  </Command.Group>

  <Command.Group heading="All Commands">
    <Suspense fallback={<Command.Loading>Loading commands...</Command.Loading>}>
      <Command.AsyncItems items={fetchAllCommands()}>
        {(items) => items.map((item) => (
          <Command.Item key={item.id} value={item.value}>{item.label}</Command.Item>
        ))}
      </Command.AsyncItems>
    </Suspense>
  </Command.Group>
</Command.List>
```

Each group loads independently and shows its own loading state. The first group to resolve renders immediately.
