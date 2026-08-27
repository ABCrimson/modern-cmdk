# Migration from cmdk

This guide covers migrating from `cmdk` (pacocoursey/cmdk) to `modern-cmdk/react`. For simple cases, it is a package swap. For advanced usage, there are breaking changes to address.

## Quick Start: Drop-in Compatibility

For the simplest migration, swap the import:

```diff
- import { Command } from 'cmdk';
+ import { Command } from 'modern-cmdk/react';
```

The compound component API works identically for basic usage. Data attributes and CSS custom properties are renamed (`[cmdk-*]` to `[data-command-*]`, `--cmdk-*` to `--command-*`) -- the codemod below rewrites those for you.

## Automated Migration with Codemod

`modern-cmdk` ships a codemod CLI. It runs **one transform per invocation** against a file glob -- `modern-cmdk <transform> <glob>` -- so apply the transforms you need in sequence:

::: code-group
```bash [npx]
npx modern-cmdk import-rewrite ./src
npx modern-cmdk data-attrs ./src
npx modern-cmdk forward-ref ./src
npx modern-cmdk should-filter ./src
```

```bash [pnpm]
pnpm dlx modern-cmdk import-rewrite ./src
pnpm dlx modern-cmdk data-attrs ./src
pnpm dlx modern-cmdk forward-ref ./src
pnpm dlx modern-cmdk should-filter ./src
```
:::

### Available Transforms

| Transform | What it does |
|---|---|
| `import-rewrite` | Rewrites `'cmdk'` imports to `'modern-cmdk/react'` |
| `data-attrs` | Renames `[cmdk-*]` selectors (e.g. `[cmdk-item]` to `[data-command-item]`) and `--cmdk-*` CSS custom properties (e.g. `--cmdk-list-height` to `--command-list-height`) |
| `forward-ref` | Removes `React.forwardRef` wrappers, using `ref` as a prop |
| `should-filter` | Converts `shouldFilter={false}` to `filter={false}` |

### Codemod Options

Two flags are supported:

```bash
npx modern-cmdk import-rewrite ./src \
  --dry-run          # Preview changes without writing files
  --concurrency=8    # Files processed per batch (default: 8)
```

`node_modules`, `dist`, `build`, and `.next` are skipped automatically.

::: tip
Always run with `--dry-run` first to review changes before applying them.
:::

## Breaking Changes

### 1. Data Attributes Renamed

All `[cmdk-*]` data attributes are renamed to `[data-command-*]`. There are **no runtime aliases** -- the old selectors simply stop matching, so update your CSS and tests (the `data-attrs` codemod rewrites them for you).

::: code-group
```css [Before (cmdk)]
[cmdk-root] { /* root styles */ }
[cmdk-input] { /* input styles */ }
[cmdk-item] { /* item styles */ }
[cmdk-item][data-selected="true"] { /* active item */ }
[cmdk-group] { /* group styles */ }
[cmdk-group-heading] { /* heading styles */ }
[cmdk-list] { /* list styles */ }
[cmdk-separator] { /* separator styles */ }
[cmdk-empty] { /* empty state */ }
[cmdk-loading] { /* loading state */ }
```

```css [After (modern-cmdk/react)]
[data-command-root] { /* root styles */ }
[data-command-input] { /* input styles */ }
[data-command-item] { /* item styles */ }
[data-command-item][data-active] { /* active item */ }
[data-command-group] { /* group styles */ }
[data-command-group-heading] { /* heading styles */ }
[data-command-list] { /* list styles */ }
[data-command-separator] { /* separator styles */ }
[data-command-empty] { /* empty state */ }
[data-command-loading] { /* loading state */ }
```
:::

### 2. CSS Custom Property Renamed

```diff
- height: var(--cmdk-list-height);
+ height: var(--command-list-height);
```

There is no `--cmdk-list-height` alias at runtime -- update to `--command-list-height` (the `data-attrs` codemod rewrites this too).

### 3. `shouldFilter` Renamed to `filter`

::: code-group
```tsx [Before (cmdk)]
<Command shouldFilter={false}>
  {/* External filtering */}
</Command>
```

```tsx [After (modern-cmdk/react)]
<Command filter={false}>
  {/* External filtering */}
</Command>
```
:::

The `filter` prop also accepts a custom filter function (not just `false`). Note the signature differs from cmdk -- it receives the whole `CommandItem`, not separate `value`/`keywords` arguments:

```tsx
<Command filter={(item, query) => {
  // Return a score (higher = better match), or false to exclude the item
  return item.value.toLowerCase().includes(query.toLowerCase()) ? 1 : false;
}}>
```

### 4. `forwardRef` Removed (React 19)

React 19 passes `ref` as a regular prop. All `forwardRef` wrappers are removed.

::: code-group
```tsx [Before (cmdk + React 18)]
import { forwardRef } from 'react';

const CustomInput = forwardRef<HTMLInputElement, Props>((props, ref) => (
  <Command.Input ref={ref} {...props} />
));
```

```tsx [After (modern-cmdk/react + React 19)]
function CustomInput({ ref, ...props }: Props & { ref?: React.Ref<HTMLInputElement> }) {
  return <Command.Input ref={ref} {...props} />;
}
```
:::

### 5. `"use client"` Directive Required

Every component in `modern-cmdk/react` has `"use client"` at the top. If you are importing from a server component, you must use the component from a client component boundary:

```tsx
// This file is a Server Component
import { CommandPalette } from './command-palette'; // Client Component

export default function Page() {
  return <CommandPalette />;
}
```

### 6. Radix UI Package Change

The Dialog component uses the unified `radix-ui` package instead of individual `@radix-ui/*` packages:

```diff
- "@radix-ui/react-dialog": "^1.1.2"
+ "radix-ui": "1.6.7"
```

You do not need to install Radix separately unless you use it directly.

### 7. `useSyncExternalStore` Shim Removed

`use-sync-external-store` is no longer a dependency. React 19 provides `useSyncExternalStore` natively. If you were importing the shim directly, remove it:

```diff
- import { useSyncExternalStore } from 'use-sync-external-store/shim';
+ // No longer needed — React 19 native
```

### 8. Active Item Attribute Change

::: code-group
```css [Before (cmdk)]
[cmdk-item][data-selected="true"] {
  background: #f0f0f0;
}
```

```css [After (modern-cmdk/react)]
[data-command-item][data-active] {
  background: var(--color-primary-subtle);
}
```
:::

The `data-selected="true"` attribute is replaced with `data-active` (presence-based, no value).

## Full Before/After Comparison

::: code-group
```tsx [Before (cmdk)]
import { Command } from 'cmdk';
import { forwardRef, useState } from 'react';

const CommandPalette = forwardRef<HTMLDivElement>((props, ref) => {
  const [open, setOpen] = useState(false);

  return (
    <Command.Dialog
      ref={ref}
      open={open}
      onOpenChange={setOpen}
      shouldFilter={false}
      label="Command palette"
    >
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Loading>Loading...</Command.Loading>
        <Command.Empty>No results.</Command.Empty>
        <Command.Group heading="Actions">
          <Command.Item value="copy" onSelect={() => console.log('copy')}>
            Copy
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
});
```

```tsx [After (modern-cmdk/react)]
'use client';

import { Command } from 'modern-cmdk/react';
import { useState } from 'react';

function CommandPalette() {
  const [open, setOpen] = useState(false);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      filter={false}
      label="Command palette"
    >
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Loading>Loading...</Command.Loading>
        <Command.Empty>No results.</Command.Empty>
        <Command.Group heading="Actions">
          <Command.Item value="copy" onSelect={() => console.log('copy')}>
            Copy
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
```
:::

## Complete API Differences

| cmdk | modern-cmdk/react | Notes |
|---|---|---|
| `import { Command } from 'cmdk'` | `import { Command } from 'modern-cmdk/react'` | Import path |
| `[cmdk-root]` | `[data-command-root]` | Codemod: `data-attrs` |
| `[cmdk-input]` | `[data-command-input]` | Codemod: `data-attrs` |
| `[cmdk-item]` | `[data-command-item]` | Codemod: `data-attrs` |
| `[cmdk-group]` | `[data-command-group]` | Codemod: `data-attrs` |
| `[cmdk-group-heading]` | `[data-command-group-heading]` | Codemod: `data-attrs` |
| `[cmdk-list]` | `[data-command-list]` | Codemod: `data-attrs` |
| `[cmdk-separator]` | `[data-command-separator]` | Codemod: `data-attrs` |
| `[cmdk-empty]` | `[data-command-empty]` | Codemod: `data-attrs` |
| `[cmdk-loading]` | `[data-command-loading]` | Codemod: `data-attrs` |
| `--cmdk-list-height` | `--command-list-height` | Codemod: `data-attrs` |
| `shouldFilter={false}` | `filter={false}` | Also accepts filter function |
| `React.forwardRef` | `ref` as regular prop | React 19 native |
| No `"use client"` | `"use client"` on every component | RSC boundary |
| No virtualization | Automatic at 100+ items | Opt-out with `virtualize={false}` |
| `@radix-ui/react-dialog` | `radix-ui` (peer `>=1.4.0 <2.0.0`) | Unified package |
| `use-sync-external-store` shim | Native `useSyncExternalStore` | React 19 built-in |
| `data-selected="true"` | `data-active` | Presence-based attribute |

## New Features Available After Migration

After migrating, you get access to features not available in cmdk:

- **[Frecency ranking](/guide/frecency)** -- Items ranked by frequency + recency via `Date.now()`
- **[Keyboard shortcuts](/guide/shortcuts)** -- Built-in registry with `<Command.Shortcut />`
- **[Fuzzy search](/guide/wasm-search)** -- Optional WASM-accelerated search for large datasets
- **[Virtualization](/guide/virtualization)** -- Automatic for 100+ items
- **[Match highlighting](/api/command-react#commandhighlight)** -- `<Command.Highlight />` component
- **[Async items](/guide/async-items)** -- `<Command.AsyncItems />` with Suspense
- **[Multi-page navigation](/api/command-react#commandpage)** -- `<Command.Page />` with a page stack (Backspace pops)
- **[Activity preservation](/api/command-react#commandactivity)** -- `<Command.Activity />` for state preservation
- **[Full ARIA support](/guide/accessibility)** -- Live regions, `forced-colors`, `prefers-contrast`
