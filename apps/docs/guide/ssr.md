# Server-Side Rendering

modern-cmdk/react is fully SSR-compatible with Next.js App Router, Remix, and any React 19 streaming framework.

## How It Works

The React adapter uses `useSyncExternalStore` with a `getServerSnapshot` parameter, ensuring hydration safety:

```tsx
const state = useSyncExternalStore(
  machine.subscribe,
  machine.getState,
  machine.getState, // Server snapshot — returns initial state
);
```

## Next.js App Router

All components are marked with `'use client'` — they automatically become Client Components when imported into Server Component trees:

```tsx
// app/page.tsx (Server Component)
import { CommandPalette } from './command-palette';

export default function Page() {
  return (
    <main>
      <h1>My App</h1>
      <CommandPalette /> {/* Client boundary */}
    </main>
  );
}
```

```tsx
// app/command-palette.tsx (Client Component)
'use client';

import { Command } from 'modern-cmdk/react';

export function CommandPalette() {
  return (
    <Command>
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Item value="home" onSelect={() => router.push('/')}>
          Home
        </Command.Item>
      </Command.List>
    </Command>
  );
}
```

## Tree-Shaking

Only the components you import are included in the client bundle. The core engine (`modern-cmdk`) has zero DOM dependencies and can run in any JavaScript environment.

## Streaming SSR

The `<Command.Dialog>` component works with React Suspense boundaries. Async items via `<Command.AsyncItems>` integrate with `use()` for streaming.

`items` takes the **promise itself**, not a function, and `children` is a render function
that receives the resolved items:

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { itemId } from 'modern-cmdk';

// Created once, outside render — a new promise on every render re-suspends forever.
const resultsPromise = fetchResults().then((rows) =>
  rows.map((row) => ({ id: itemId(row.slug), value: row.title })),
);

<Command.AsyncItems
  items={resultsPromise}
  fallback={<Command.Loading>Searching...</Command.Loading>}
>
  {(items) =>
    items.map((item) => (
      <Command.Item key={item.id} value={item.value}>
        {item.value}
      </Command.Item>
    ))
  }
</Command.AsyncItems>;
```

::: warning
`items` must resolve to `CommandItem[]` -- objects with a branded `id` and a `value`. Raw
API rows will not register. See [Async Items](/guide/async-items) for the debounced,
transition-driven version.
:::

## Static Generation (SSG)

Command palettes are inherently interactive — they render an empty initial state during SSG, then hydrate on the client. No special configuration needed.

## Common Patterns

### URL-Driven Open State

```tsx
'use client';

import { useSearchParams } from 'next/navigation';

function CommandPalette() {
  const params = useSearchParams();
  const isOpen = params.get('cmd') === 'true';

  return <Command.Dialog open={isOpen} onOpenChange={handleOpenChange}>...</Command.Dialog>;
}
```

### Pre-loading Items Server-Side

```tsx
// Fetch items on the server, pass as props
async function CommandWrapper() {
  const items = await db.commands.findMany();
  return <CommandPalette initialItems={items} />;
}
```
