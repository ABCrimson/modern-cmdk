# Server-Side Rendering

@crimson_dev/command-react is fully SSR-compatible with Next.js App Router, Remix, and any React 19 streaming framework.

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

import { Command } from '@crimson_dev/command-react';

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

Only the components you import are included in the client bundle. The core engine (`@crimson_dev/command`) has zero DOM dependencies and can run in any JavaScript environment.

## Streaming SSR

The `<Command.Dialog>` component works with React Suspense boundaries. Async items via `<Command.AsyncItems>` integrate with `use()` for streaming:

```tsx
<Suspense fallback={<Command.Loading>Searching...</Command.Loading>}>
  <Command.AsyncItems load={fetchResults} />
</Suspense>
```

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
