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

import { useRouter } from 'next/navigation';
import { Command } from 'modern-cmdk/react';

export function CommandPalette() {
  const router = useRouter();

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

`import { Command } from 'modern-cmdk/react'` pulls every subcomponent, `Command.Dialog` and its `radix-ui` import included, into the client bundle. `Command` is a compound: `Object.assign(CommandRoot, { Input, List, Item, ..., Dialog, ... })` attaches all of its members, so a bundler cannot drop the ones you never render. Importing a single named export does not escape that either. The committed size record [`benchmarks/size-history/1.4.0.json`](https://github.com/ABCrimson/modern-cmdk/blob/6e7c04d/benchmarks/size-history/1.4.0.json) (git blob `045fec5`, measured at `9827e1f` with size-limit 14.3.0) measures `import { CommandSeparator } from 'modern-cmdk/react'` at **4767 B gzip** (`react`, `react-dom`, `radix-ui` and `modern-cmdk` ignored), against 5403 B for the whole adapter: that bundle still contains `CommandDialog`, `CommandRoot` and the `radix-ui` import. A tree-shaking claim for the compound is out of 1.x; the plan to change it is 2.0 (the barrel drops `Command.Dialog`).

`modern-cmdk` declares `"sideEffects": ["./dist/react/styles.css"]` and nothing else, so a bundler may drop any unused module but keeps `import 'modern-cmdk/styles.css'`. That removes unused exports of the core (`modern-cmdk`), not the members of the `Command` compound. The core has no hard DOM dependency (DOM APIs are feature-detected) and can run in any JavaScript environment.

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
API rows will not register. See [Async Items](/guide/async-items) for the debounced
version.
:::

## Static Generation (SSG)

Command palettes are inherently interactive — they render an empty initial state during SSG, then hydrate on the client. No special configuration needed.

## Common Patterns

### URL-Driven Open State

```tsx
'use client';

import { Command } from 'modern-cmdk/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function CommandPalette() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const isOpen = params.get('cmd') === 'true';

  function handleOpenChange(open: boolean) {
    const next = new URLSearchParams(params);
    if (open) next.set('cmd', 'true');
    else next.delete('cmd');
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <Command.Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <Command.Input placeholder="Search..." />
      <Command.List />
    </Command.Dialog>
  );
}
```

### Pre-loading Items Server-Side

Map the rows to items with `itemId()` on the server (see the warning above) and pass them as props. The `id` is a plain string at runtime, so the objects cross the Server to Client boundary; an `onSelect` function would not, so attach callbacks in the Client Component.

```tsx
// app/command-wrapper.tsx (Server Component)
import { itemId } from 'modern-cmdk';
import { db } from './db';
import { CommandPalette } from './command-palette';

export async function CommandWrapper() {
  const rows = await db.commands.findMany();
  const items = rows.map((row) => ({ id: itemId(row.slug), value: row.title }));
  return <CommandPalette initialItems={items} />;
}
```

```tsx
// app/command-palette.tsx (Client Component)
'use client';

import type { CommandItem } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';

export function CommandPalette({ initialItems }: { readonly initialItems: readonly CommandItem[] }) {
  return (
    <Command>
      <Command.Input placeholder="Search..." />
      <Command.List>
        {initialItems.map((item) => (
          <Command.Item key={item.id} value={item.value}>
            {item.value}
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}
```
