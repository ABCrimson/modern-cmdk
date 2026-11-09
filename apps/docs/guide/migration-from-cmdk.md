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
| `[cmdk-list-sizer]` | `[data-command-list-inner]` | `data-attrs` | The element the list measures into `--command-list-height`; the same element carries `[data-command-list-virtual]` instead while the list is virtualized |
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

cmdk renders `data-selected` and `data-disabled` on every item with the value `"true"` or `"false"`. `modern-cmdk/react` renders `data-active` and `data-disabled` only while the state holds, with no value (`item.tsx:114-115`). Next to a cmdk attribute, the codemod rewrites:

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

cmdk infers a missing `value` from the item's text. `Command.Item` requires `value: string` (`packages/modern-cmdk/src/react/item.tsx:18`); the TypeScript compiler flags every item without one.

### 2. `Command.Input` Takes `value` and `onValueChange`, and the Root Does Not Hear a Controlled Query

`Command.Input` takes `value` and `onValueChange` under cmdk's names (`input.tsx:24`, `input.tsx:29`). With `value` defined the input shows it, a typed change only calls `onValueChange`, and a parent that does not apply the change keeps the input at its `value`; the prop is the search query. Without `value` the input keeps its own text and sends each change itself. The root's `onSearchChange` is not called for a query that comes from the `value` prop (`input.tsx:18-23`), so read the query from your own state in that case. The delta row `input-controlled-value` records the same observations in both libraries (ARCH-29).

### 3. The Root Controls the Active Item by `activeId`, Not by `value`

cmdk's root takes a controlled `value` and `onValueChange` for the active item, which cmdk keys by item value. `Command` takes the options of `CommandMachineOptions` (`packages/modern-cmdk/src/core/types.ts:181-275`) and keys the active item by item id: `activeId` controls it and `onActiveChange` receives the item id or `null` (`core/types.ts:219`, `core/types.ts:230`). With `activeId` defined, `state.activeId` mirrors it while that id is listed and enabled and is `null` otherwise, and `activeId={null}` means no active item. The machine never picks the active item then: every candidate it would choose is reported through `onActiveChange`, and the parent decides by passing the next `activeId` (ARCH-29, D106). An arrow key in a controlled root whose parent keeps `activeId` unchanged leaves the item where it was, where cmdk shows the new item (the delta row `root-controlled-active-value`). Leave `activeId` `undefined` and `onActiveChange` only observes the highlight.

After a search change the active item stays the same while it is still listed and enabled under the new query, and otherwise the first enabled item of the ranked list becomes active (`core/machine.ts:274-277`, RA-84). cmdk makes the top match active on every changed query and returns to the first item when the query is cleared; whether modern-cmdk follows cmdk is ARCH-65 (2.0).

### 4. `vimBindings` and `disablePointerSelection` Are Gone

Neither prop exists on `CommandMachineOptions` (`core/types.ts:181-275`). Remove them. Ctrl+N, Ctrl+J, Ctrl+P and Ctrl+K do not move the active item, and a pointer move over an item always makes it active; bind the keys yourself with a key handler on the root if you rely on them (the delta rows `vim-bindings` and `disable-pointer-selection`).

### 5. `filter` Replaces `shouldFilter`, and Its Signature Differs

`shouldFilter={false}` becomes `filter={false}`; `should-filter` does this. `filter` also takes a function, and its signature is not cmdk's `(value, search, keywords) => number`. It is `(item, query) => number | false` (`core/types.ts:192`): it receives the whole `CommandItem`, returns a score (higher is better), and `false`, `0` or a negative score excludes the item (`core/machine.ts:102-109`). `should-filter` wraps a cmdk filter function in an adapter on cmdk-bound elements; rewrite it by hand if you want it to use the item directly.

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

cmdk 1.1.1 accepts props that modern-cmdk 1.x does not take (declarations in `cmdk/dist/index.d.ts`). tsc rejects each named prop below with TS2322 (a `ReactNode` `heading` gives TS2412 under `exactOptionalPropertyTypes`), but JSX type-checking never rejects a hyphenated attribute: a `data-*` or `aria-*` attribute on `CommandDialog` compiles and is dropped, never rendered. The codemod does not touch any of them; remove or replace them by hand:

- `defaultValue` on the root (d.ts:42): no equivalent. `CommandMachineOptions` has no initial-selection prop; to start on another item, control the active item with `activeId` and `onActiveChange` (the delta row `default-value`).
- `forceMount` on `Command.Item` and `Command.Group` (d.ts:86, :106): no equivalent. `CommandItemProps` and `CommandGroupProps` have no such prop.
- `progress` on `Command.Loading` (d.ts:223-224): no equivalent. `CommandLoadingProps` adds only `loading`, an override of the loading state, to the `div` props.
- `label` on `Command.Loading` (d.ts:228) and on `Command.List` (d.ts:150): not accepted. `CommandLoadingProps` and `CommandListProps` have no `label`; the root and the dialog keep theirs.
- `value` on `Command.Group` (d.ts:104): not accepted. `CommandGroupProps` has no `value`.
- A `ReactNode` `heading` on `Command.Group` (d.ts:102): `CommandGroupProps.heading` is a `string` (`packages/modern-cmdk/src/react/group.tsx:14`).
- `asChild` on every part: not accepted. None of the prop types has it.
- `role` on `Command.Input` (d.ts:124-128 omits only `onChange`, `value` and `type`): not accepted. `CommandInputProps` omits `role` (`packages/modern-cmdk/src/react/input.tsx:16`); the input always renders `role="combobox"`, as cmdk did over any role you passed.
- `defaultValue` on `CommandDialog` (d.ts:178): not accepted. `CommandDialogProps` has no such prop.
- `defaultOpen` and `modal` on `CommandDialog` (Radix `DialogProps`, which cmdk's `Dialog` takes at d.ts:155): not accepted. `CommandDialogProps` takes `open` and `onOpenChange` but neither of these.
- `div` props on `CommandDialog` (`id`, `style`, `onKeyDown`, `data-*` and the rest; d.ts:155-159): not forwarded. tsc rejects `id`, `style`, `onKeyDown` and every other unhyphenated one; a `data-*` or `aria-*` attribute compiles and is dropped. `CommandDialogProps` takes `CommandMachineOptions` plus `children`, `className`, `overlayClassName`, `contentClassName`, `label`, `open`, `onOpenChange`, `description` and `container`.

Two props that cmdk takes are not in this list because modern-cmdk takes them too. The root forwards every `div` attribute and its `ref` to the root element (`id`, `style`, `onKeyDown`, `data-*` and the rest); its own `data-command-root`, `data-command-state`, `role` and `aria-label` come after yours and win (`packages/modern-cmdk/src/react/command.tsx:27-36`, `command.tsx:118-123`). `Command.Separator` takes `alwaysRender`, with the opposite default: cmdk hides a separator while a search is active, modern-cmdk 1.x keeps it because `alwaysRender` defaults to `true`; pass `alwaysRender={false}` for cmdk's behaviour. The default becomes `false` in 2.0 (`packages/modern-cmdk/src/react/separator.tsx:11-25`, RA-45, D101).

### 10. `onSelect` Receives No Argument in 1.x

cmdk calls `onSelect(value)`. In modern-cmdk 1.x `Command.Item`'s `onSelect` is `() => void` (`packages/modern-cmdk/src/react/item.tsx:21`), so a handler that declares a required parameter fails tsc (TS2322, "Target signature provides too few arguments"), and one whose parameter is optional compiles but receives `undefined` at run time. Read the value from the closure of the item you render, as the After sample does. The root's `onSelect` and `onActiveChange` options receive the item id (the item's `id` prop, else its deprecated `forceId`, else a `useId()` id; `react/hooks/use-register.ts:22-33`), not its value, and `onActiveChange` fires when the highlight moves, not on selection. The value arrives as the first argument in 2.0 (D66, ARCH-62).

::: code-group
```tsx fragment [Before (cmdk)]
<Command.Item onSelect={(value) => run(value)}>Open</Command.Item>
```

```tsx [After (modern-cmdk/react)]
import { Command } from 'modern-cmdk/react';

function run(value: string): void {
  console.log(value);
}

export function OpenItem() {
  return (
    <Command.Item value="open" onSelect={() => run('open')}>
      Open
    </Command.Item>
  );
}
```
:::

## Measured Differences from cmdk 1.1.1

The suite `tests/unit/cmdk-comparison.test.tsx` renders cmdk 1.1.1 and modern-cmdk from one fixture per case, observes the same facts in both and compares them with the row of the case. `same` means the two observations are equal; `differs` means they are not, and the Behaviour column says how.

| Case | Status | Behaviour | Reference |
| --- | --- | --- | --- |
| `component-names` | same | Both Command namespaces expose Input, List, Item, Group, Separator, Empty, Loading and Dialog, and a palette built from them renders every part. |  |
| `basic-tree-structure` | same | Both render the canonical tree alike: items in source order, the input placeholder, the separator, and no Empty text while items match. |  |
| `parts-present` | same | Both render the root, input, list, item, group, group heading, group items, separator and loading parts on first render, each under its own attribute (`cmdk-*` in cmdk, `data-command-*` in modern-cmdk), and neither shows Empty while items exist. |  |
| `state-attributes` | differs | cmdk marks the active item with data-selected="true" and writes data-selected and data-disabled as "true" or "false" on every item. modern-cmdk marks the active item with a bare data-active and a disabled item with a bare data-disabled. Rewrite CSS that targets [data-selected="true"] to [data-active], and [data-disabled="true"] to [data-disabled]. |  |
| `large-list-rendered-count` | differs | cmdk renders all 150 items. modern-cmdk virtualizes a list of more than 100 matches and renders only a window of them (12 here), so a test or script that counts rendered items sees fewer; pass virtualize={false} to Command.List to render every item. |  |
| `large-list-height-property` | same | Both lists hold the measured height (137.5px) on their custom property for a 150-item list. modern-cmdk keeps its last non-virtual measurement while the list is virtual, so the property does not follow the virtual content height. | CE-123 |
| `list-height-property` | same | Both lists write their measured height rounded to one decimal and suffixed with px to a custom property: `--cmdk-list-height` in cmdk and `--command-list-height` in modern-cmdk. Rename the property in CSS that reads it. |  |
| `input-aria` | same | Both inputs are comboboxes with aria-expanded="true", aria-autocomplete="list" and aria-controls pointing at the list. |  |
| `activedescendant-timing` | differs | cmdk sets aria-activedescendant on the input only after the first arrow-key move. modern-cmdk sets it from the first render, to the item that is active then. |  |
| `root-label` | differs | cmdk renders the root label as a visually hidden \<label cmdk-label> that the input names itself with through aria-labelledby. modern-cmdk renders no label element: the root is role="search" with aria-label, and the input carries the same aria-label. |  |
| `list-role` | same | Both lists are role="listbox" and both items are role="option". |  |
| `list-default-label` | differs | Without a label, cmdk names the list "Suggestions" and modern-cmdk names it after the root label, which defaults to "Command palette". Pass a list label to name it explicitly. |  |
| `list-label-prop` | same | A list label sets the list aria-label in both. cmdk takes it as the label prop of Command.List; modern-cmdk takes the aria-label prop of Command.List. |  |
| `aria-selected-follows-active` | same | Both set aria-selected="true" on the active item and "false" on the others, and the value follows the arrow keys. |  |
| `empty-visibility` | same | Both show Empty only while no item matches the search and hide it again when a match returns. |  |
| `empty-aria` | differs | cmdk renders Empty with role="presentation". modern-cmdk renders it with role="status" and aria-live="polite", so a screen reader announces it. |  |
| `loading-aria` | differs | cmdk renders Loading as role="progressbar" with aria-valuemin, aria-valuemax and aria-label="Loading...". modern-cmdk renders it as role="status" with aria-busy="true" and aria-live="assertive", and shows it only while its loading prop or the palette is loading. |  |
| `group-aria` | differs | cmdk marks the group element role="presentation" and puts role="group" and aria-labelledby on the group-items element. modern-cmdk puts role="group" and aria-labelledby on the group element and gives the group-items element no role. Both hide the heading with aria-hidden. |  |
| `group-hidden-no-match` | differs | A group with no matching item hides itself with the hidden attribute in cmdk and with an inline display: none in modern-cmdk. In both, the unmatched items leave the DOM. CSS that targets [hidden] on a group does not apply to modern-cmdk. |  |
| `separator-aria` | differs | cmdk renders a separator with role="separator". modern-cmdk renders it with role="none", because it is only presentational inside a listbox. |  |
| `separator-default-search` | differs | By default cmdk hides a separator while a search is active, and modern-cmdk 1.x keeps it because alwaysRender defaults to true there. Pass alwaysRender={false} for cmdk's behaviour; the default becomes false in 2.0. | RA-45 |
| `separator-always-render-true` | same | With alwaysRender set to true both libraries keep the separator while a search is active. | RA-45 |
| `separator-always-render-false` | same | With alwaysRender set to false both libraries hide the separator while a search is active. | RA-45 |
| `filter-by-query` | same | Both keep only the items that match the typed query and make the only match active. |  |
| `filter-cleared` | differs | After the search is cleared both show every item in source order. cmdk makes the first item active again; modern-cmdk keeps the item that was active for the search (banana here). | RA-84 |
| `filter-ranking-order` | differs | Both rank apple first for "apple" and put the DOM in rank order. cmdk makes the top match active. modern-cmdk keeps the item that was active before the search while it still matches, so here applesauce stays active and Enter selects it. | RA-84 |
| `first-match-active` | same | Both make the first match active when the item that was active before the search no longer matches. | RA-84 |
| `keywords` | same | Both match an item by its keywords as well as by its value. |  |
| `custom-filter-ranking` | same | Both keep the items a custom filter scores above 0, put the DOM in score order and make the best-scored item active first, then step by score with the arrow keys. cmdk's filter prop is (value, search, keywords) and modern-cmdk's is (item, query). |  |
| `custom-filter-exclusion` | same | In both, a custom filter that returns 0 excludes the item. modern-cmdk also excludes an item for false or a negative score. |  |
| `custom-filter-arguments` | same | A custom filter sees the item value, the search and the item keywords in both. cmdk passes them as three arguments; modern-cmdk passes the item and the query, and the item holds the value and keywords. |  |
| `filtering-off` | same | With filtering off both keep every item shown whatever is typed and never show Empty. cmdk takes shouldFilter={false}; modern-cmdk takes filter={false}. |  |
| `force-mount` | differs | cmdk's forceMount keeps an item shown through any search. modern-cmdk has no forceMount, so the item is filtered out like any other; give it a keyword or a filter that always matches. |  |
| `arrow-navigation` | same | Both move the active item down and up with ArrowDown and ArrowUp. |  |
| `home-end` | same | Both jump to the first item with Home and to the last with End. |  |
| `loop-default` | differs | Without a loop prop cmdk stops at the first and last item, and modern-cmdk wraps around, because loop defaults to true there. Pass loop={false} for cmdk's behaviour. |  |
| `loop-true` | same | With loop set to true both wrap from the last item to the first and from the first to the last. |  |
| `loop-false` | same | With loop set to false both stop at the first and last item. |  |
| `vim-bindings` | differs | cmdk moves the active item with Ctrl+N and Ctrl+J (down) and Ctrl+P and Ctrl+K (up) by default, and vimBindings={false} turns that off; modern-cmdk has no vim bindings and no vimBindings prop, so those keys do nothing. Bind them yourself with a key handler on the root if you rely on them. |  |
| `vim-bindings-off` | same | With vimBindings={false} cmdk stops Ctrl+N, J, P and K moving the active item. modern-cmdk has no vim bindings and no vimBindings prop, so those keys never move it; drop the prop. |  |
| `modifier-arrows` | differs | In cmdk Alt+ArrowDown and Alt+ArrowUp jump to the first item of the next or previous group, and Meta+ArrowDown and Meta+ArrowUp jump to the last and first item. modern-cmdk ignores those modifiers and moves one item like a plain arrow key. |  |
| `selection-targets` | differs | cmdk makes the clicked item active. modern-cmdk makes an item active on pointer move or the keyboard, not on click, so a tap or a programmatic click leaves the active item where it was (with a mouse, the pointer move before the click makes it active in both). |  |
| `select-callback-arguments` | differs | cmdk passes the item's value to onSelect, on a click and on Enter. modern-cmdk 1.x calls onSelect with no argument, and the value argument arrives in 2.0: until then read the value from your own item data. | D66, ARCH-62 |
| `disabled-items` | same | In both, a disabled item does not select on a click or Enter and the arrow keys step over it. |  |
| `pointer-move-activates` | same | Both make an item active when the pointer moves over it. |  |
| `default-value` | differs | cmdk's defaultValue on the root sets the item that is active at mount. modern-cmdk has no defaultValue, so the first item is active at mount. To start on another item, control the active item with activeId and onActiveChange. |  |
| `disable-pointer-selection` | differs | cmdk's disablePointerSelection stops a pointer move from making an item active. modern-cmdk has no such prop: a pointer move over an item always makes it active. |  |
| `item-id-prop` | differs | cmdk spreads your props and then writes its own generated id, so an id on Command.Item does not reach the DOM. modern-cmdk uses the id prop as the item's DOM id and its registration id. | D29 |
| `group-id-prop` | same | In both, the id prop on Command.Group is the group element's DOM id. | D29 |
| `input-change-callback` | same | Typing calls the input's onValueChange with the new text in both, and the input shows it. |  |
| `input-controlled-value` | same | In both, a controlled input value drives the search and holds when the parent does not apply a typed change, and the callback still hears the typing. The prop names match: value and onValueChange. | ARCH-29 |
| `root-controlled-active-value` | differs | Both report the next active item to the root callback after an arrow key: cmdk by value through value and onValueChange, modern-cmdk by item id through activeId and onActiveChange (modern-cmdk keys the active item by id, cmdk by value). cmdk then shows the new item active even though the parent kept value unchanged; modern-cmdk holds the controlled item. | ARCH-29, D106 |
| `dialog-open-structure` | same | Both render an open Dialog's overlay and content with the palette root, input, list and items inside the content. |  |
| `dialog-aria` | differs | Both dialogs are role="dialog" with the aria-label. modern-cmdk also marks the dialog aria-modal="true", which tells assistive technology that the page outside the dialog is inert (Radix hides it with aria-hidden but sets no aria-modal), labels it with a visually hidden title, describes it with a visually hidden description, and gives the palette root role="search" with the label; cmdk's root inside the dialog has no role or label. |  |
| `dialog-closed` | same | A Dialog with open false renders nothing in both. |  |
| `dialog-overlay-dismiss` | same | A click on the overlay calls onOpenChange(false) once in both. |  |
| `dialog-escape-reports` | same | One Escape calls onOpenChange(false) once in both. | RA-34 |
| `server-items` | same | The server-rendered HTML lists every item in both. | RP-31 |
| `server-empty-text` | differs | cmdk's server HTML includes the Empty element and its text, so a server-rendered palette shows "no results" until it hydrates. modern-cmdk renders no Empty text on the server. | RP-31 |

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
| Controlled `Command.Input` `value` | `value` and `onValueChange`, the same names; the root's `onSearchChange` does not hear a controlled query | Breaking change 2 |
| Root `value` and `onValueChange` (the active item by value) | `activeId` and `onActiveChange` (the active item by id) | Breaking change 3 |
| `vimBindings`, `disablePointerSelection` | Removed | Breaking change 4; Ctrl+N, J, P and K do nothing, a pointer move always activates |
| `React.forwardRef` | `ref` as regular prop | React 19 native |
| No virtualization | Automatic above 100 matching items (off again at 50 or fewer) | Opt-out with `virtualize={false}` |
| `@radix-ui/react-dialog` | `radix-ui` (peer `>=1.4.0 <2.0.0`) | Unified package |
| `use-sync-external-store` shim | Native `useSyncExternalStore` | React 19 built-in |
| `defaultValue` on the root | Removed | Breaking change 9; no equivalent |
| `forceMount` on `Item` and `Group` | Removed | Breaking change 9; no equivalent |
| `progress` on `Command.Loading` | Removed | Breaking change 9; no equivalent |
| Root `div` props | Forwarded | The root forwards every `div` attribute and its `ref`; its `data-command-root`, `data-command-state`, `role` and `aria-label` win |
| `alwaysRender` on `Command.Separator` | Accepted; the 1.x default is `true` | Pass `alwaysRender={false}` for cmdk's behaviour; the default becomes `false` in 2.0 |
| `label` on `Command.Loading` and `Command.List` | Not accepted | Breaking change 9; no equivalent |
| `value` on `Command.Group` | Not accepted | Breaking change 9; no equivalent |
| `ReactNode` `heading` on `Command.Group` | `heading` is a `string` | Breaking change 9 |
| `asChild` on every part | Not accepted | Breaking change 9; no equivalent |
| `role` on `Command.Input` | Not accepted | Breaking change 9; the input is always `combobox` |
| `defaultValue` on `CommandDialog` | Not accepted | Breaking change 9; no equivalent |
| `defaultOpen` and `modal` on `CommandDialog` | Not accepted | Breaking change 9; no equivalent |
| `CommandDialog` `div` props | Not forwarded | Breaking change 9; tsc rejects the unhyphenated ones, a `data-*` or `aria-*` attribute compiles and is dropped |
| Item `onSelect(value)` | `onSelect()` (no argument; the value arrives in 2.0) | Breaking change 10 (D66, ARCH-62) |
| `id` on `Command.Item` is overwritten by cmdk's generated id | `id` is the item's DOM id and registration id; `forceId` is deprecated, removed in 2.0 | Delta row `item-id-prop` (D29) |

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
