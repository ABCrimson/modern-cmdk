# Migration from cmdk

This guide covers migrating from `cmdk` (pacocoursey/cmdk) to `modern-cmdk/react`. For simple cases, it is a package swap. For advanced usage, there are breaking changes to address.

## Quick Start: Drop-in Compatibility

For the simplest migration, swap the import:

```diff
- import { Command } from 'cmdk';
+ import { Command } from 'modern-cmdk/react';
```

The compound component API, data attributes, and CSS custom properties all work identically for basic usage.

## Automated Migration with Codemod

The fastest way to migrate is the provided codemod CLI:

::: code-group
```bash [npx]
npx modern-cmdk (codemods) migrate ./src
```

```bash [pnpm]
pnpm dlx modern-cmdk (codemods) migrate ./src
```
:::

### What the Codemod Handles

| Transformation | Example |
|---|---|
| Import rewriting | `'cmdk'` to `'modern-cmdk/react'` |
| Data attribute renaming | `[cmdk-root]` to `[data-command-root]` |
| CSS custom property renaming | `--cmdk-list-height` to `--command-list-height` |
| `forwardRef` removal | Removes `forwardRef` wrapper, uses `ref` as prop |
| `shouldFilter` to `filter` | `shouldFilter={false}` to `filter={false}` |

### Codemod Options

```bash
npx modern-cmdk (codemods) migrate ./src \
  --dry-run          # Preview changes without writing
  --verbose          # Show detailed transformation log
  --extensions ts,tsx # File extensions to process (default: ts,tsx,js,jsx)
  --ignore node_modules,dist  # Directories to skip
```

::: tip
Always run with `--dry-run` first to review changes before applying them.
:::

## Breaking Changes

### 1. Data Attributes Renamed

All `[cmdk-*]` data attributes are renamed to `[data-command-*]`. Legacy aliases are provided for backward compatibility, but you should update your CSS and tests.

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

The `--cmdk-list-height` alias is provided for backward compatibility, but you should update to `--command-list-height`.

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

The `filter` prop also accepts a custom filter function (not just a boolean):

```tsx
<Command filter={(value, search, keywords) => {
  // Return a score between 0 and 1
  return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
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
+ "radix-ui": "1.4.4-rc"
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

function CommandPalette({ ref }: { ref?: React.Ref<HTMLDivElement> }) {
  const [open, setOpen] = useState(false);

  return (
    <Command.Dialog
      ref={ref}
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
| `[cmdk-root]` | `[data-command-root]` | Aliased for compat |
| `[cmdk-input]` | `[data-command-input]` | Aliased for compat |
| `[cmdk-item]` | `[data-command-item]` | Aliased for compat |
| `[cmdk-group]` | `[data-command-group]` | Aliased for compat |
| `[cmdk-group-heading]` | `[data-command-group-heading]` | Aliased for compat |
| `[cmdk-list]` | `[data-command-list]` | Aliased for compat |
| `[cmdk-separator]` | `[data-command-separator]` | Aliased for compat |
| `[cmdk-empty]` | `[data-command-empty]` | Aliased for compat |
| `[cmdk-loading]` | `[data-command-loading]` | Aliased for compat |
| `--cmdk-list-height` | `--command-list-height` | Aliased for compat |
| `shouldFilter={false}` | `filter={false}` | Also accepts filter function |
| `React.forwardRef` | `ref` as regular prop | React 19 native |
| No `"use client"` | `"use client"` on every component | RSC boundary |
| No virtualization | Automatic at 100+ items | Opt-out with `virtualize={false}` |
| `@radix-ui/react-dialog` | `radix-ui@1.4.4-rc` | Unified package |
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
- **[Multi-page navigation](/api/command-react#commandpage)** -- `<Command.Page />` with View Transitions
- **[Activity preservation](/api/command-react#commandactivity)** -- `<Command.Activity />` for state preservation
- **[Full ARIA support](/guide/accessibility)** -- Live regions, `forced-colors`, `prefers-contrast`
