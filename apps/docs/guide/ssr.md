# Server-Side Rendering

modern-cmdk/react is fully SSR-compatible with Next.js App Router, Remix, and any React 19 streaming framework.

## How It Works

The React adapter uses `useSyncExternalStore` with a `getServerSnapshot` parameter, ensuring hydration safety:

```tsx
import type { CommandMachine } from 'modern-cmdk';
import { useSyncExternalStore } from 'react';

// What the adapter does with the machine it holds in context
export function useMachineState(machine: CommandMachine) {
  return useSyncExternalStore(
    machine.subscribe,
    machine.getState,
    machine.getState, // Server snapshot — returns initial state
  );
}
```

## Next.js App Router

The built entries of `modern-cmdk/react` start with `'use client'`, so a Server Component that imports them gets client references: the palette renders on the client (and in the server HTML), and a Server Component can place it. The `Command.X` members (`Command.Input`, `Command.List`, `Command.Item`, ...) are properties of the `Command` client reference, which a Server Component cannot read (`Cannot access Command.Input on the server`), so write them only in `'use client'` modules. Wrap the palette in a Client Component, as below (a Server Component can also render the named exports `CommandInput`, `CommandList`, `CommandItem`, ... as elements, with no function props):

```tsx fragment
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

`import { Command } from 'modern-cmdk/react'` pulls every subcomponent, `Command.Dialog` and its `radix-ui` import included, into the client bundle. `Command` is a compound: `Object.assign(CommandRoot, { Input, List, Item, ..., Dialog, ... })` attaches all of its members, so a bundler cannot drop the ones you never render. Importing a single named export does not escape that either. The committed size record [`benchmarks/size-history/1.5.0.json`](https://github.com/ABCrimson/modern-cmdk/blob/4498a0f/benchmarks/size-history/1.5.0.json) (git blob `3df2e95`, measured at `d5ce6ff` with size-limit 14.3.0) measures `import { CommandSeparator } from 'modern-cmdk/react'` at **4812 B gzip** (`react`, `react-dom`, `radix-ui` and `modern-cmdk` ignored), against 5539 B for the whole adapter: that bundle still contains `CommandDialog`, `CommandRoot` and the `radix-ui` import. A tree-shaking claim for the compound is out of 1.x; the plan to change it is 2.0 (the barrel drops `Command.Dialog`).

`modern-cmdk` declares `"sideEffects": ["./dist/react/styles.css"]` and nothing else, so a bundler may drop any unused module but keeps `import 'modern-cmdk/styles.css'`. That removes unused exports of the core (`modern-cmdk`), not the members of the `Command` compound. The core has no hard DOM dependency (DOM APIs are feature-detected) and can run in any JavaScript environment.

## Streaming SSR

The `<Command.Dialog>` component works with React Suspense boundaries. Async items via `<Command.AsyncItems>` integrate with `use()` for streaming.

`items` takes the **promise itself**, not a function, and `children` is a render function
that receives the resolved items. The promise is created per request: an async Server Component calls the
fetcher without awaiting it and passes the promise as a prop to a `'use client'` palette, which hands it to
`Command.AsyncItems items`. The promise belongs to the request, not to the module, and it is the same object on every render of the palette:

```tsx fragment
// app/page.tsx (Server Component)
import { itemId } from 'modern-cmdk';
import type { CommandItem } from 'modern-cmdk';
import { db } from './db';
import { StreamedPalette } from './streamed-palette';

async function loadResults(): Promise<readonly CommandItem[]> {
  const rows = await db.commands.findMany();
  return rows.map((row) => ({ id: itemId(row.slug), value: row.title }));
}

export default function Page() {
  // Called on every request and not awaited: the palette receives the promise
  return <StreamedPalette results={loadResults()} />;
}
```

```tsx
// app/streamed-palette.tsx (Client Component)
'use client';

import type { CommandItem } from 'modern-cmdk';
import { Command } from 'modern-cmdk/react';

export function StreamedPalette({ results }: { readonly results: Promise<readonly CommandItem[]> }) {
  return (
    <Command>
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.AsyncItems
          items={results}
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
      </Command.List>
    </Command>
  );
}
```

A fetch started at module scope of a Client Component runs once per server process, so every request would share its result, and a new promise created in render suspends again on every render. Create the promise per request in a Server Component, as above, or per query in a client cache (see [Async Items](/guide/async-items)).

::: warning
`items` must resolve to `CommandItem[]` -- objects with a branded `id` and a `value`. Raw
API rows will not register. See [Async Items](/guide/async-items) for the debounced
version.
:::

## Static Generation (SSG)

The server HTML lists the palette's items and groups under an empty query. Items and groups register with the machine in layout effects, which do not run on the server, so an `Item` or `Group` that the registry does not hold yet renders instead of waiting for registration (`item.tsx`, `group.tsx`), and the hydration pass renders the same markup. Three parts wait for the client:

- `Command.Empty` renders nothing on the server and in the hydration pass, because an empty registry says nothing about the query before the items register (`empty.tsx`; the `useHydrated` server snapshot is `false`).
- The live region of `Command.List` stays empty until hydration, and then announces the result count.
- `Command.Shortcut` renders the neutral platform's text (`formatShortcut` with `'other'`) on the server and in the hydration pass, then re-renders with the detected platform's, so the markup matches on every platform.

No special configuration needed.

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

```tsx fragment
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
          <Command.Item key={item.id} id={item.id} value={item.value}>
            {item.value}
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}
```
