# Migration from cmdk

This guide covers migrating from `cmdk` ([dip/cmdk](https://github.com/dip/cmdk), formerly pacocoursey/cmdk) to `modern-cmdk/react`. The import swap is one line, but the two libraries differ in their data attributes, their CSS custom property, the `filter` signature and several props, so plan for the [breaking changes](#breaking-changes) below. The `modern-cmdk-codemod` CLI does the mechanical part and reports every site it cannot migrate.

## Swap the Import

```diff
- import { Command } from 'cmdk';
+ import { Command } from 'modern-cmdk/react';
```

The compound components keep cmdk's names (`Command`, `Command.Input`, `Command.List`, `Command.Item`, `Command.Group` and the rest). What changes underneath is listed in [Breaking Changes](#breaking-changes) and [Attributes, CSS and Tailwind](#attributes-css-and-tailwind).

## Automated Migration with the Codemod

`modern-cmdk-codemod` runs **one transform per invocation** against a directory or a glob: `modern-cmdk-codemod <transform> <dir or glob>`. Run the transforms in this order:

1. `should-filter`
2. `forward-ref`
3. `data-attrs`
4. `import-rewrite`, last

`import-rewrite` goes last because `should-filter` adapts a cmdk `filter` function only on elements bound to a `'cmdk'` import. Once the import reads `'modern-cmdk/react'`, a cmdk filter can no longer be told from a migrated one, and the transform leaves it alone.

Start with a dry run. It needs no git tree, writes nothing and prints a unified diff of every file that would change:

```bash
npx modern-cmdk-codemod --dry-run should-filter ./src
```

```text
would change src/palette.tsx
--- a/src/palette.tsx
+++ b/src/palette.tsx
@@ -2,7 +2,7 @@
 import { forwardRef } from 'react';

 export const Palette = forwardRef<HTMLDivElement>((props, ref) => (
-  <Command ref={ref} shouldFilter={false} className="data-[selected=true]:bg-gray-100">
+  <Command ref={ref} filter={false} className="data-[selected=true]:bg-gray-100">
     <Command.Input />
     <Command.List>
       <Command.Item value="copy">Copy</Command.Item>
1 changed, 0 unchanged, 0 errors, 1 skipped (dry run, nothing written)
```

Then run the four transforms from the root of a git work tree whose matched files are committed. The CLI refuses to write anywhere else ([the git rule](#the-git-rule)):

::: code-group
```bash [npx]
npx modern-cmdk-codemod should-filter ./src
npx modern-cmdk-codemod forward-ref ./src
npx modern-cmdk-codemod data-attrs ./src
npx modern-cmdk-codemod import-rewrite ./src
```

```bash [pnpm]
pnpm dlx modern-cmdk-codemod should-filter ./src
pnpm dlx modern-cmdk-codemod forward-ref ./src
pnpm dlx modern-cmdk-codemod data-attrs ./src
pnpm dlx modern-cmdk-codemod import-rewrite ./src
```
:::

Commit after each transform so the next run starts from a clean tree and each step is a reviewable diff. To write into a tree that is not clean, or outside git, pass `--force`:

```bash
npx modern-cmdk-codemod --force should-filter ./src
```

A directory argument covers every `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.css` and `.scss` file below it. Files and directories whose names start with a dot (`.storybook/`, `src/.palette.tsx`) are not matched by a directory argument or by a wildcard (`*` or `**`). Name them with a pattern whose segment starts with the dot, such as `"./.storybook/*.tsx"` or `"./src/.*.tsx"`, or give the dot directory itself as the directory argument (`./.storybook`). A glob works too; quote it so your shell passes it to the CLI instead of expanding it:

```bash
npx modern-cmdk-codemod --dry-run data-attrs "./src/**/*.{tsx,css}"
```

A file a transform has nothing to say about is counted as unchanged or skipped and printed as nothing.

### Available Transforms

| Transform | What it does |
|---|---|
| `should-filter` | On `Command`, `Command.Dialog`, `CommandRoot` and `CommandDialog` imported from `'cmdk'` or `'modern-cmdk/react'`: `shouldFilter={false}` becomes `filter={false}`, `shouldFilter` and `shouldFilter={true}` are removed, `shouldFilter={expr}` becomes `filter={expr ? undefined : false}`. On an element bound to `'cmdk'` only, a cmdk `filter` function (`(value, search, keywords) => number`) is wrapped in an adapter to `(item, query) => number \| false`; a name or member expression is guarded against `undefined`, which means cmdk's default filter. A `filter` on an element bound to `'modern-cmdk/react'` is left alone without a report: it reads as already migrated. Reported and left unchanged: `shouldFilter` beside `filter`; a `shouldFilter` whose value is not a JSX expression or is an empty expression; a `filter` whose value is not an expression or is an empty expression; a `filter` that may not be a function (`null`, a conditional or a logical expression); and a `filter` computed where it stands, which the adapter would re-evaluate on every item outside render (a call, `new`, a computed key other than a string or number literal (`o[k]`; `o['f']` is adapted like `o.f`), an assertion, a cast, an optional chain, `super.f`, a bare `this` or any other computed value), for which you hoist it to a const and pass the name. Other components named `Command`, or any other element, are not touched. |
| `forward-ref` | Unwraps `React.forwardRef(...)` from `react` into a function component that takes `ref` as a prop, keeping the props and ref types. Reported and left unchanged: `forwardRef()` with no argument; a non-function argument such as `forwardRef(Inner)` or `forwardRef(<expression>)`; a render function with more than two parameters; `forwardRef<T>()` with a ref type argument and a render function without parameters; a props parameter that is not an identifier or object pattern; a props pattern with a computed key that may be `'ref'`; a props pattern that already has a `ref` key; a ref parameter that is not a plain identifier; a render function with a typed single props parameter, a JSX spread and no ref type argument; and a ref annotation whose props type is unknown. |
| `data-attrs` | Renames cmdk's attributes and custom property in JSX attributes, in selectors inside JS/TS string and template literals, and in `.css` and `.scss` files. Rewrites cmdk's state attributes beside them and the Tailwind variants on cmdk elements. Reports every site it cannot migrate. See [Attributes, CSS and Tailwind](#attributes-css-and-tailwind). |
| `import-rewrite` | Rewrites imports, re-exports, `import()`, `require()` and `vi.mock` or `jest.mock` of `'cmdk'` to `'modern-cmdk/react'`. `CommandRoot` and a default import become `Command`. A name `modern-cmdk/react` does not export (`defaultFilter`, `CommandProps`) stays on a `'cmdk'` import with one report per name. `declare module 'cmdk'` and any `'cmdk/<subpath>'` specifier are left unchanged and reported. |

### Codemod Options

```bash
modern-cmdk-codemod <transform> <dir or glob> [--dry-run] [--force] [--lenient | --strict] [--concurrency=N]
modern-cmdk-codemod --help
modern-cmdk-codemod --version
```

| Option | Effect |
|---|---|
| `--dry-run` | Prints `would change <path>` and a unified diff for each file that would change; writes nothing and skips the git check |
| `--force` | Writes even when the matched files have uncommitted changes or lie outside a git work tree |
| `--strict` | The default of `modern-cmdk-codemod`: exit `2` on usage errors, `1` when a file errors |
| `--lenient` | Exit `0` for usage errors and per-file errors, as the deprecated bin does, and skip the git check; cannot be combined with `--strict` |
| `--concurrency=N` | Files processed at once (default: min(8, available cores)) |
| `-h`, `--help` | Prints the usage |
| `-v`, `--version` | Prints the package name and version |

### The Git Rule

A run that writes needs a git work tree in which every matched file is committed. If a matched file is modified, staged, deleted or untracked, or lies outside the work tree, or git cannot be found, the CLI writes nothing and exits `2`:

```text
error: refusing to write: 1 matched file has uncommitted changes:
  src/palette.tsx
Commit or stash them, or pass --force to write anyway (--dry-run previews without writing).
```

Commit or stash, or pass `--force` when you accept that a bad run cannot be undone with git. `--dry-run` never checks.

### Which Files Are Read

The codemod skips `node_modules`, `dist`, `build`, `.next`, `.git`, `coverage`, `.turbo`, `out`, `storybook-static` and `.vercel`, every path your `.gitignore` covers (asked of `git check-ignore`) and every file reached through a symlinked directory, and every file or directory whose name starts with a dot (unless a pattern segment starts with that dot or a directory argument names that directory, such as `./.storybook`).

### Output and Exit Codes

A changed file prints `changed <path>` (`would change <path>` with `--dry-run`); unchanged files print nothing. A summary closes the run, for example `2 changed, 5 unchanged, 0 errors, 1 reported`, with `skipped` and `reported` counts when they are not zero. Reports and per-file errors go to stderr as `<path>: <message>`.

| Exit code | Meaning |
|---|---|
| `0` | Success; reports do not change it |
| `1` | A file errored, no file matched, or the run failed |
| `2` | Usage error (unknown or malformed option, unknown transform, missing argument), `--strict` with `--lenient`, or a refused dirty tree |

`--lenient` restores the exit codes `modern-cmdk` 1.x had: `0` for `--help`, missing arguments, usage errors and per-file errors; `1` for an unknown transform, no matching files and an uncaught error. With `--lenient`, an unknown option beside both arguments is ignored with a warning.

### The Deprecated `npx modern-cmdk`

The `modern-cmdk` package still ships a `modern-cmdk` bin until 2.0. It runs the same four transforms, bundled, with the 1.x exit codes (lenient unless argv carries `--strict`) and 1.4's excludes: of the ten directories `modern-cmdk-codemod` skips, it skips only `node_modules`, `dist`, `build` and `.next`, applies no `.gitignore` and makes no git check. Like `modern-cmdk-codemod`, it reads only the ten script and stylesheet extensions from a directory, leaves out files and directories whose names start with a dot unless a pattern segment starts with that dot or a directory argument names that directory, descends no symlinked directory under `**` or a directory argument, reads no symlinked file and on Windows matches names case-insensitively. Unlike `modern-cmdk-codemod`, it follows a symlinked directory that a pattern names or that a directory argument names: `"./src/link/*.tsx"` and `./src/link` reach the files the link points to. It writes one deprecation warning to stderr per run. Use `modern-cmdk-codemod` instead.

## Attributes, CSS and Tailwind

cmdk marks its elements with `cmdk-*` attributes; `modern-cmdk/react` renders `data-command-*`. There are **no runtime aliases**: the old selectors stop matching. The `data-attrs` transform rewrites the attribute, in JSX, in JS/TS strings and template literals (`querySelector('[cmdk-item]')`) and in `.css` and `.scss` files. CI checks this table against the codemod's own maps:

| cmdk | modern-cmdk/react | Codemod | Notes |
|---|---|---|---|
| `[cmdk-root]` | `[data-command-root]` | `data-attrs` | |
| `[cmdk-input]` | `[data-command-input]` | `data-attrs` | |
| `[cmdk-list]` | `[data-command-list]` | `data-attrs` | |
| `[cmdk-list-sizer]` | `[data-command-list-inner]` | `data-attrs` | The element the list measures into `--command-list-height`; not rendered while the list is virtualized, which renders `[data-command-list-virtual]` instead |
| `[cmdk-item]` | `[data-command-item]` | `data-attrs` | |
| `[cmdk-group]` | `[data-command-group]` | `data-attrs` | |
| `[cmdk-group-heading]` | `[data-command-group-heading]` | `data-attrs` | |
| `[cmdk-group-items]` | `[data-command-group-items]` | `data-attrs` | |
| `[cmdk-separator]` | `[data-command-separator]` | `data-attrs` | |
| `[cmdk-empty]` | `[data-command-empty]` | `data-attrs` | |
| `[cmdk-loading]` | `[data-command-loading]` | `data-attrs` | |
| `[cmdk-dialog]` | `[data-command-dialog]` | `data-attrs` | Set on the Radix `Dialog.Content` element, which wraps the inner `[data-command-dialog-content]` |
| `[cmdk-overlay]` | `[data-command-overlay]` | `data-attrs` | |
| `--cmdk-list-height` | `--command-list-height` | `data-attrs` | Also rewritten in `.css` and `.scss` files |
| `cmdk-label` | none | Manual: cmdk renders a visually hidden `<label>`; modern-cmdk puts the label on the root as `aria-label` and renders no label element | |
| `cmdk-item-select` | none | Manual: a DOM event cmdk dispatches on an item to run its `onSelect`, not an attribute; modern-cmdk has no such event, use the item `onSelect` prop | |

### CSS and SCSS

`data-attrs` reads `.css` and `.scss` files like any other file. It rewrites attribute selectors and `--cmdk-list-height` and leaves comments, strings outside attribute selectors and formatting alone. This stylesheet, run through `modern-cmdk-codemod data-attrs ./src`:

```css
[cmdk-root] { width: 100%; }
[cmdk-item][data-selected="true"] { background: #f0f0f0; }
[cmdk-list] { height: var(--cmdk-list-height); }
[cmdk-group-heading] { font-size: 12px; }
[cmdk-label] { display: none; }
```

becomes this, with the `cmdk-label` rule reported (`src/palette.css: line 5: cmdk-label has no modern-cmdk equivalent: ...; left unchanged`) and kept:

```css
[data-command-root] { width: 100%; }
[data-command-item][data-active] { background: #f0f0f0; }
[data-command-list] { height: var(--command-list-height); }
[data-command-group-heading] { font-size: 12px; }
[cmdk-label] { display: none; }
```

In SCSS, a nested `&[data-selected="true"]` is migrated when every selector of the enclosing rule ends in a compound that holds a cmdk attribute (`.row[cmdk-item] { &[data-selected="true"] { ... } }`), and reported when only some do (`[cmdk-item], .other { ... }`). When no selector ends in one, it is left unchanged and not reported, even if a cmdk attribute appears earlier in the selector (`[cmdk-root] .row { &[data-selected="true"] { ... } }`): rewrite that one by hand.

### State Attributes

cmdk renders `data-selected` and `data-disabled` on every item with the value `"true"` or `"false"`. `modern-cmdk/react` renders `data-active` and `data-disabled` only while the state holds, with no value (`item.tsx:85-86`). Next to a cmdk attribute, the codemod rewrites:

| cmdk | modern-cmdk/react |
|---|---|
| `[data-selected="true"]` | `[data-active]` |
| `[data-selected="false"]` | `:not([data-active])` |
| `[data-disabled="true"]` | `[data-disabled]` |
| `[data-disabled="false"]` | `:not([data-disabled])` |

### Tailwind Variants

On elements bound to a `cmdk` or `modern-cmdk/react` import, the codemod rewrites the variants in `className` and `class`, including arbitrary variants such as `[&[data-selected=true]_svg]:`:

| Before | After |
|---|---|
| `data-[selected=true]:bg-gray-100` | `data-active:bg-gray-100` |
| `data-[disabled=true]:opacity-50` | `data-disabled:opacity-50` |

`data-active:` is Tailwind v4's presence shorthand for `[data-active]`; on Tailwind v3 write `data-[active]:`. The `false` forms (`data-[selected=false]:`) have no equivalent and are reported with the advice to use `not-data-active:`.

### What the Codemod Reports and Leaves for You

Every site below is left unchanged and printed once on stderr with its line, so run the transforms and read the reports before you commit:

- `cmdk-label` and `cmdk-item-select`, in JSX, selectors and stylesheets (see the table above).
- A `[data-selected]` or `[data-disabled]` without a `"true"` or `"false"` value beside a cmdk attribute, and Tailwind's `data-[selected]:` presence form on a cmdk element. A `[data-selected]` in a selector that holds no cmdk attribute is not touched and not reported: the codemod cannot tell it is cmdk's. The same holds for a nested `&[data-selected]` under a rule whose selectors hold a cmdk attribute only before their last compound.
- `defaultFilter`, `CommandProps` and any other `cmdk` export that `modern-cmdk/react` lacks: the name stays on a `'cmdk'` import until you migrate it.
- `declare module 'cmdk'`: move the declaration to `'modern-cmdk/react'` by hand.
- `cmdk/<subpath>` specifiers.
- `useCommandState`: the import is rewritten and reported, because its state is modern-cmdk's `CommandState`, not cmdk's.
- A string that is exactly a cmdk attribute name, such as `el.hasAttribute('cmdk-item')` or `el.getAttribute('cmdk-root')`: it names an attribute, not a selector, so it is reported with the `data-command-*` name to use. A name built at run time is not seen.

## Breaking Changes

`should-filter` migrates change 5 on elements bound to a `'cmdk'` import, and `forward-ref` migrates change 6 for your own components; the rest need hand edits. Changes 1 to 5 name the source line that defines the new behavior.

### 1. Item `value` Is Required

cmdk infers a missing `value` from the item's text. `Command.Item` requires `value: string` (`packages/modern-cmdk/src/react/item.tsx:12`); the TypeScript compiler flags every item without one.

### 2. `Command.Input` Is Uncontrolled

`Command.Input` omits `value` from its props (`input.tsx:14`), so the search text cannot be controlled. `onValueChange` is still there to observe it (`input.tsx:15`).

### 3. The Root Has No `value` or `onValueChange`

cmdk's root takes a controlled `value` and `onValueChange` for the active item. `Command` takes the options of `CommandMachineOptions` (`packages/modern-cmdk/src/core/types.ts:166-193`) and has neither; observe the active item with `onActiveChange`, which receives the item id or `null`.

### 4. `vimBindings` and `disablePointerSelection` Are Gone

Neither prop exists on `CommandMachineOptions` (`core/types.ts:166-193`). Remove them.

### 5. `filter` Replaces `shouldFilter`, and Its Signature Differs

`shouldFilter={false}` becomes `filter={false}`; `should-filter` does this. `filter` also takes a function, and its signature is not cmdk's `(value, search, keywords) => number`. It is `(item, query) => number | false` (`core/types.ts:172`): it receives the whole `CommandItem`, returns a score (higher is better), and `false` excludes the item. `should-filter` wraps a cmdk filter function in an adapter on cmdk-bound elements; rewrite it by hand if you want it to use the item directly.

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

### 6. `forwardRef` Removed (React 19)

React 19 passes `ref` as a regular prop. All `forwardRef` wrappers are removed; `forward-ref` does this for your own components.

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

### 7. Radix UI Package Change

The Dialog component uses the unified `radix-ui` package instead of individual `@radix-ui/*` packages:

```diff
- "@radix-ui/react-dialog": "^1.1.2"
+ "radix-ui": "1.8.2-rc.1791984254107"
```

Install `radix-ui` (`>=1.4.0 <2.0.0`) alongside `modern-cmdk`: `modern-cmdk/react` imports it, and it is a required peer in 1.x (see [Installation](/guide/installation#peer-dependencies)).

### 8. `useSyncExternalStore` Shim Removed

`use-sync-external-store` is no longer a dependency. React 19 provides `useSyncExternalStore` natively. If you were importing the shim directly, remove it:

```diff
- import { useSyncExternalStore } from 'use-sync-external-store/shim';
+ // No longer needed — React 19 native
```

### 9. Props Without an Equivalent

cmdk 1.1.1 accepts four things that modern-cmdk has no counterpart for (`cmdk/dist/index.d.ts`: `defaultValue` on the root, `forceMount` on `Item` and `Group`, `progress` on `Loading`, and every `div` prop on the root). The codemod does not touch them; remove or replace them by hand:

- `defaultValue` on the root: no equivalent. `CommandMachineOptions` has no initial-selection prop.
- `forceMount` on `Command.Item` and `Command.Group`: no equivalent. `CommandItemProps` and `CommandGroupProps` have no such prop.
- `progress` on `Command.Loading`: no equivalent. `CommandLoadingProps` adds only `loading`, an override of the loading state, to the `div` props.
- Root `div` props (`id`, `style`, `onKeyDown`, `data-*` and the rest): the root forwards none. `CommandRootProps` takes `CommandMachineOptions` plus `children`, `className` and `label`.

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
| `import { Command } from 'cmdk'` | `import { Command } from 'modern-cmdk/react'` | Import path; `import-rewrite` |
| `[cmdk-*]`, `--cmdk-list-height` | `[data-command-*]`, `--command-list-height` | See the [attribute table](#attributes-css-and-tailwind) |
| `data-selected="true"` | `data-active` | Presence-based attribute |
| `shouldFilter={false}` | `filter={false}` | `filter` also takes `(item, query) => number \| false` |
| Item `value` inferred from text | Item `value` required | Breaking change 1 |
| Controlled `Command.Input` `value` | Uncontrolled input, `onValueChange` observes | Breaking change 2 |
| Root `value` and `onValueChange` | `onActiveChange` | Breaking change 3 |
| `vimBindings`, `disablePointerSelection` | Removed | Breaking change 4 |
| `React.forwardRef` | `ref` as regular prop | React 19 native |
| No virtualization | Automatic above 100 matching items (off again at 50 or fewer) | Opt-out with `virtualize={false}` |
| `@radix-ui/react-dialog` | `radix-ui` (peer `>=1.4.0 <2.0.0`) | Unified package |
| `use-sync-external-store` shim | Native `useSyncExternalStore` | React 19 built-in |
| `defaultValue` on the root | Removed | Breaking change 9; no equivalent |
| `forceMount` on `Item` and `Group` | Removed | Breaking change 9; no equivalent |
| `progress` on `Command.Loading` | Removed | Breaking change 9; no equivalent |
| Root `div` props | Removed | Breaking change 9; the root forwards no div props, only `className` and `label` |

## New Features Available After Migration

After migrating, you get access to features not available in cmdk:

- **[Frecency ranking](/guide/frecency)** -- Items ranked by frequency + recency via `Date.now()`
- **[Keyboard shortcuts](/guide/shortcuts)** -- Built-in registry with `<Command.Shortcut />`
- **[Fuzzy search](/guide/wasm-search)** -- Optional WASM-accelerated search for large datasets
- **[Virtualization](/guide/virtualization)** -- Automatic above 100 matching items
- **[Match highlighting](/api/command-react#command-highlight)** -- `<Command.Highlight />` component
- **[Async items](/guide/async-items)** -- `<Command.AsyncItems />` with Suspense
- **[Multi-page navigation](/api/command-react#command-page)** -- `<Command.Page />` with a page stack (Backspace pops)
- **[Activity preservation](/api/command-react#command-activity)** -- `<Command.Activity />` for state preservation
- **[Full ARIA support](/guide/accessibility)** -- Live regions, `forced-colors`, `prefers-contrast`
