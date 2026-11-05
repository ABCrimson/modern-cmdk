# Migration from cmdk

This guide covers migrating from `cmdk` (pacocoursey/cmdk) to `modern-cmdk/react`. For simple cases, it is a package swap. For advanced usage, there are breaking changes to address.

## Quick Start: Drop-in Compatibility

For the simplest migration, swap the import:

```diff
- import { Command } from 'cmdk';
+ import { Command } from 'modern-cmdk/react';
```

The compound component API works identically for basic usage. Data attributes and CSS custom properties are renamed (`[cmdk-*]` to `[data-command-*]`, `--cmdk-*` to `--command-*`) -- the `data-attrs` codemod below rewrites most of them in JSX and in JS/TS strings (it skips `cmdk-group-heading`, `cmdk-group-items`, `cmdk-dialog`, `cmdk-overlay` and `cmdk-list-sizer`, and mis-renames `cmdk-root`; see [Complete API Differences](#complete-api-differences)); rename them in `.css` files by hand.

## Automated Migration with Codemod

`modern-cmdk` ships a codemod CLI. It runs **one transform per invocation** against a file glob -- `modern-cmdk <transform> <glob>` -- so apply the transforms you need in sequence:

::: code-group
```bash [npx]
npx modern-cmdk import-rewrite "./src/**/*.{ts,tsx,js,jsx}"
npx modern-cmdk data-attrs "./src/**/*.{ts,tsx,js,jsx}"
npx modern-cmdk forward-ref "./src/**/*.{ts,tsx,js,jsx}"
npx modern-cmdk should-filter "./src/**/*.{ts,tsx,js,jsx}"
```

```bash [pnpm]
pnpm dlx modern-cmdk import-rewrite "./src/**/*.{ts,tsx,js,jsx}"
pnpm dlx modern-cmdk data-attrs "./src/**/*.{ts,tsx,js,jsx}"
pnpm dlx modern-cmdk forward-ref "./src/**/*.{ts,tsx,js,jsx}"
pnpm dlx modern-cmdk should-filter "./src/**/*.{ts,tsx,js,jsx}"
```
:::

Quote the glob so your shell passes it to the CLI. A bare directory such as `./src` expands to every file in it, and every file is parsed as TypeScript: `import-rewrite` reports each stylesheet, JSON and Markdown file as an error, and the other transforms report such a file as an error only when it contains the text they look for (`cmdk`, `forwardRef` or `shouldFilter`).

### Available Transforms

| Transform | What it does |
|---|---|
| `import-rewrite` | Rewrites `'cmdk'` imports to `'modern-cmdk/react'` |
| `data-attrs` | Renames `cmdk-input`, `cmdk-list`, `cmdk-item`, `cmdk-group`, `cmdk-separator`, `cmdk-empty`, `cmdk-loading` and `cmdk-root` as JSX attributes and as `[cmdk-*]` selectors inside JS/TS string and template literals (e.g. `querySelector('[cmdk-item]')`), and `--cmdk-list-height` inside those literals. It writes `cmdk-root` as `data-command`, not `data-command-root`, and leaves `cmdk-group-heading` and other attributes unchanged. It does not read `.css` files; rename selectors there by hand. |
| `forward-ref` | Removes `React.forwardRef` wrappers, using `ref` as a prop |
| `should-filter` | Converts `shouldFilter={false}` to `filter={false}` |

### Codemod Options

```bash
modern-cmdk <transform> <glob> [--dry-run] [--strict] [--concurrency=N]
modern-cmdk --help
```

| Option | Effect |
|---|---|
| `--dry-run` | Lists the files that would change (`would change <path>`) and writes nothing |
| `--strict` | Exit `2` on usage errors (including unknown options) and `1` when any file errored |
| `--concurrency=N` | Files processed at once (default: min(8, available cores)) |
| `-h`, `--help` | Prints the usage |

`node_modules`, `dist`, `build`, and `.next` are skipped automatically.

The CLI prints one line per changed file (`changed <path>`, or `would change <path>` with `--dry-run`); unchanged files print nothing, and a summary such as `2 changed, 5 unchanged, 0 errors`. Per-file errors go to stderr as `<path>: <message>`. `--dry-run` prints no diff; review the result in version control after a real run.

Without `--strict`, exit codes stay as in 1.2: `0` for `--help`, missing arguments and per-file errors; `1` for an unknown transform, no matching files and an uncaught error. With `--strict`, any usage error (including an unknown transform) exits `2`, any file error exits `1`, and no matching files still exits `1`.

With both `<transform>` and `<glob>` given, an unknown option is ignored with a warning on stderr and the run goes on; without them it prints an error and the usage and exits `0`. With `--strict`, an unknown option is a usage error (exit `2`). A malformed known option -- `--concurrency` with no value, `--dry-run=yes` -- is a usage error that writes nothing (exit `0`; `2` with `--strict`).

::: tip
Run with `--dry-run` first to see which files would change, then run without it and review the diff in version control.
:::

## Breaking Changes

### 1. Data Attributes Renamed

All `[cmdk-*]` data attributes are renamed to `[data-command-*]`. There are **no runtime aliases** -- the old selectors simply stop matching, so update your CSS and tests (the `data-attrs` codemod rewrites most of them in JSX and JS/TS strings, not in `.css` files; it skips `[cmdk-group-heading]`, `[cmdk-group-items]`, `[cmdk-dialog]`, `[cmdk-overlay]` and `[cmdk-list-sizer]`, and writes `[data-command]` for `[cmdk-root]`).

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

There is no `--cmdk-list-height` alias at runtime -- update to `--command-list-height`. Rename it by hand in `.css` files; the `data-attrs` codemod rewrites it only inside JS/TS string and template literals.

### 3. `shouldFilter` Renamed to `filter`

::: code-group
```tsx fragment [Before (cmdk)]
<Command shouldFilter={false}>
  {/* External filtering */}
</Command>
```

```tsx [After (modern-cmdk/react)]
import { Command } from 'modern-cmdk/react';

export function ExternalFilterPalette() {
  return (
    <Command filter={false}>
      {/* External filtering */}
    </Command>
  );
}
```
:::

The `filter` prop also accepts a custom filter function (not just `false`). Note the signature differs from cmdk -- it receives the whole `CommandItem`, not separate `value`/`keywords` arguments:

```tsx
import { Command } from 'modern-cmdk/react';

export const Palette = () => (
  <Command
    filter={(item, query) => {
      // Return a score (higher = better match), or false to exclude the item
      return item.value.toLowerCase().includes(query.toLowerCase()) ? 1 : false;
    }}
  >
    {/* Input, List and Items */}
  </Command>
);
```

### 4. `forwardRef` Removed (React 19)

React 19 passes `ref` as a regular prop. All `forwardRef` wrappers are removed.

::: code-group
```tsx fragment [Before (cmdk + React 18)]
import { forwardRef } from 'react';

const CustomInput = forwardRef<HTMLInputElement, Props>((props, ref) => (
  <Command.Input ref={ref} {...props} />
));
```

```tsx [After (modern-cmdk/react + React 19)]
import { Command } from 'modern-cmdk/react';
import type { CommandInputProps } from 'modern-cmdk/react';

function CustomInput({ ref, ...props }: CommandInputProps) {
  return <Command.Input ref={ref} {...props} />;
}
```
:::

### 5. `"use client"` Directive Required

Every component in `modern-cmdk/react` has `"use client"` at the top. If you are importing from a server component, you must use the component from a client component boundary:

```tsx fragment
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
+ "radix-ui": "1.8.2-rc.1791984254107"
```

Install `radix-ui` (`>=1.4.0 <2.0.0`) alongside `modern-cmdk`: `modern-cmdk/react` imports it, and it is a required peer in 1.x (see [Installation](/guide/installation#peer-dependencies)).

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
| `[cmdk-root]` | `[data-command-root]` | Manual: the `data-attrs` codemod currently writes `[data-command]` for the root, which matches nothing modern-cmdk emits (planned fix in 1.5.0) -- correct it by hand |
| `[cmdk-input]` | `[data-command-input]` | Codemod: `data-attrs` |
| `[cmdk-item]` | `[data-command-item]` | Codemod: `data-attrs` |
| `[cmdk-group]` | `[data-command-group]` | Codemod: `data-attrs` |
| `[cmdk-group-heading]` | `[data-command-group-heading]` | Manual: not covered by the codemod |
| `[cmdk-group-items]` | `[data-command-group-items]` | Manual: not covered by the codemod |
| `[cmdk-dialog]` | `[data-command-dialog]` | Manual: not covered by the codemod; set on the Radix `Dialog.Content` element, which wraps the inner `[data-command-dialog-content]` |
| `[cmdk-overlay]` | `[data-command-overlay]` | Manual: not covered by the codemod |
| `[cmdk-list-sizer]` | no equivalent | modern-cmdk does not render this element; the list renders its own inner wrapper, `[data-command-list-inner]`, which is not a rename of it |
| `[cmdk-list]` | `[data-command-list]` | Codemod: `data-attrs` |
| `[cmdk-separator]` | `[data-command-separator]` | Codemod: `data-attrs` |
| `[cmdk-empty]` | `[data-command-empty]` | Codemod: `data-attrs` |
| `[cmdk-loading]` | `[data-command-loading]` | Codemod: `data-attrs` |
| `--cmdk-list-height` | `--command-list-height` | Codemod: `data-attrs` inside JS/TS strings only; rename by hand in `.css` |
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
- **[Match highlighting](/api/command-react#command-highlight)** -- `<Command.Highlight />` component
- **[Async items](/guide/async-items)** -- `<Command.AsyncItems />` with Suspense
- **[Multi-page navigation](/api/command-react#command-page)** -- `<Command.Page />` with a page stack (Backspace pops)
- **[Activity preservation](/api/command-react#command-activity)** -- `<Command.Activity />` for state preservation
- **[Full ARIA support](/guide/accessibility)** -- Live regions, `forced-colors`, `prefers-contrast`
