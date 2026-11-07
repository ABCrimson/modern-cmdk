# modern-cmdk-codemod

Codemods that migrate code written for [cmdk](https://github.com/dip/cmdk) to [modern-cmdk](https://www.npmjs.com/package/modern-cmdk). Four transforms, one per run, each reporting every site it cannot migrate instead of guessing.

Nothing to install: run it with `npx` (or `pnpm dlx`) from the root of a git work tree.

```bash
npx modern-cmdk-codemod <transform> <dir|glob>
```

Requires Node >= 26.4.0 (`engines.node` of this package).

## Safe first run: a dry run

`--dry-run` needs no git tree, writes nothing and prints a unified diff of every file that would change:

```bash
npx modern-cmdk-codemod --dry-run should-filter ./src
```

## Real runs need a clean git tree

A run that writes needs a git work tree in which every matched file is committed. If a matched file is modified, staged, deleted or untracked, lies outside the work tree, or git cannot be found, nothing is written and the exit code is `2`:

```text
error: refusing to write: 1 matched file has uncommitted changes:
  src/Palette.tsx
Commit or stash them, or pass --force to write anyway (--dry-run previews without writing).
```

Outside a git tree: `error: refusing to write outside a git work tree: nothing could undo it. Pass --force to write anyway.`

So every real run below starts from a committed tree, and you commit after each transform so the next run starts clean and each step is a reviewable diff. To write into a tree that is not clean, or outside git, pass `--force`; a bad run then cannot be undone with git.

```bash
git status --short                          # empty: everything is committed
npx modern-cmdk-codemod should-filter ./src
git commit -am "codemod: should-filter"
npx modern-cmdk-codemod forward-ref ./src
git commit -am "codemod: forward-ref"
npx modern-cmdk-codemod data-attrs ./src
git commit -am "codemod: data-attrs"
npx modern-cmdk-codemod import-rewrite ./src
git commit -am "codemod: import-rewrite"
```

```bash
# a tree that is not clean, or not in git: you accept that nothing can undo the run
npx modern-cmdk-codemod --force should-filter ./src
```

Run the transforms in this order. `import-rewrite` goes last: `should-filter` adapts a cmdk `filter` function only on elements bound to a `'cmdk'` import, and once the import reads `'modern-cmdk/react'` a cmdk filter can no longer be told from a migrated one.

## Which files are read

A directory argument covers every `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.css` and `.scss` file below it. Files and directories whose names start with a dot (`.storybook/`, `src/.palette.tsx`) are not matched by a directory argument or by a wildcard (`*` or `**`). Name them with a pattern whose segment starts with the dot, such as `"./.storybook/*.tsx"` or `"./src/.*.tsx"`, or give the dot directory itself as the directory argument (`./.storybook`). A glob works too; quote it so your shell passes it to the CLI:

```bash
npx modern-cmdk-codemod --dry-run data-attrs "./src/**/*.{tsx,css}"
```

The codemod skips `node_modules`, `dist`, `build`, `.next`, `.git`, `coverage`, `.turbo`, `out`, `storybook-static` and `.vercel`, every path your `.gitignore` covers (asked of `git check-ignore`) and every file reached through a symlinked directory, and every file or directory whose name starts with a dot (unless a pattern segment starts with that dot or a directory argument names that directory, such as `./.storybook`).

## The four transforms

| Transform | Scope and limits |
|---|---|
| `should-filter` | On `Command`, `Command.Dialog`, `CommandRoot` and `CommandDialog` imported from `'cmdk'` or `'modern-cmdk/react'`: `shouldFilter={false}` becomes `filter={false}`, `shouldFilter` and `shouldFilter={true}` are removed, `shouldFilter={expr}` becomes `filter={expr ? undefined : false}`. On an element bound to `'cmdk'` only, a cmdk `filter` function (`(value, search, keywords) => number`) is wrapped in an adapter to `(item, query) => number \| false`. A `filter` on an element bound to `'modern-cmdk/react'` is left alone without a report. Other components named `Command`, and any other element, are not touched. |
| `forward-ref` | Unwraps `forwardRef(...)` from `react` into a function component that takes `ref` as a prop (React 19), keeping the props and ref types. |
| `data-attrs` | Renames cmdk's `cmdk-*` attributes and `--cmdk-list-height` in JSX attributes, in selectors inside JS/TS string and template literals, and in `.css` and `.scss` files. Next to a cmdk attribute it rewrites the state attributes (`[data-selected="true"]` becomes `[data-active]`, `[data-selected="false"]` becomes `:not([data-active])`, and the same for `data-disabled`), and the Tailwind value variants on cmdk elements (`data-[selected=true]:` becomes `data-active:`, `data-[disabled=true]:` becomes `data-disabled:`). |
| `import-rewrite` | Rewrites imports, re-exports, `import()`, `require()` and `vi.mock` or `jest.mock` of `'cmdk'` to `'modern-cmdk/react'`. `CommandRoot` and a default import become `Command`. |

### What each transform reports

A report is printed as `<path>: <message>` on stderr, counted in the summary, and never changes the exit code; the site is left as it was for you to migrate by hand. These are the messages as the code writes them (`<...>` is filled in per site):

- `should-filter`: `<Command> at line N has both shouldFilter and filter; left unchanged for manual migration (...)`; `... has a filter value the transform cannot adapt; left unchanged for manual migration`; `... has a filter expression that may not be a function; left unchanged for manual migration`; `... has a filter expression that is computed where it stands (a call or other computed value), ...; left unchanged for manual migration: hoist it to a const and pass the name`; `<Command> at line N has a non-expression shouldFilter value; left unchanged for manual migration`; `... has an empty shouldFilter value; left unchanged for manual migration`.
- `forward-ref`: `forwardRef() without a render function: unwrap by hand`; `forwardRef(<name>): unwrap by hand` and `forwardRef(<expression>): unwrap by hand`; `forwardRef render function with more than two parameters: unwrap by hand`; `forwardRef props parameter is not an identifier or object pattern: unwrap by hand`; `forwardRef props pattern already has a 'ref' key: unwrap by hand`; `forwardRef ref parameter is not a plain identifier: unwrap by hand`; `forwardRef<T>() render function without parameters: unwrap by hand`; `forwardRef props pattern has a computed key that may be 'ref': unwrap by hand`; `forwardRef render function has a JSX spread and no ref type argument: unwrap by hand`; `forwardRef ref is annotated but the props type is unknown: unwrap by hand`.
- `data-attrs`: `<attr> has no modern-cmdk equivalent: <reason>; left unchanged` (`cmdk-label`, which cmdk renders as a visually hidden `<label>` while modern-cmdk puts the label on the root as `aria-label`, and `cmdk-item-select`, a DOM event that has no counterpart: use the item `onSelect` prop); `<selector> beside a cmdk attribute cannot be migrated automatically: ...; left unchanged` for a state attribute with a value other than `"true"` or `"false"`; `<selector> under a rule whose selectors only partly hold a cmdk attribute cannot be migrated automatically; left unchanged` (SCSS); `<variant>: on a cmdk element cannot be migrated automatically: ...; left unchanged` (Tailwind `data-[selected]:` and `data-[disabled]:` presence forms); `<attr> is a cmdk attribute name outside a selector; modern-cmdk renders <data-command-attr>; left unchanged` (a bare attribute name in a string); `<variant>: has no modern-cmdk equivalent, <presence> is a presence attribute with no false value (use not-<presence>:); left unchanged` (Tailwind `data-[selected=false]:` and `data-[disabled=false]:`).
- `import-rewrite`: `<name> has no modern-cmdk/react export; left on the cmdk import` (`defaultFilter`, `CommandProps`); `useCommandState was rewritten, but its state is modern-cmdk's CommandState, not cmdk's; review the selector`; `'cmdk/<subpath>' is a cmdk subpath with no modern-cmdk/react counterpart; left unchanged`; `declare module 'cmdk' was left unchanged; move the declaration to 'modern-cmdk/react' by hand`; `the mock factory for 'cmdk' names ..., which modern-cmdk/react does not export under that name; the factory body is not rewritten, check it by hand`; `<name> has no modern-cmdk/react export; left on the cmdk export`; `<name> has no modern-cmdk/react export; used through <namespace or binding>`; `<name> has no modern-cmdk/react export; used through import('cmdk')`; `<name> has no modern-cmdk/react export under that name; destructured from the cmdk module`; `export * from 'cmdk' re-exported names that modern-cmdk/react lacks (CommandRoot, defaultFilter); re-export the modern-cmdk/react names by hand` (and the same for `export * as K from 'cmdk'`).

A real run from a committed tree whose `./src` holds only `src/palette.css`, with `[cmdk-root]`, `[cmdk-item][data-selected="true"]` and `[cmdk-label]` rules, printed:

```text
$ npx modern-cmdk-codemod data-attrs ./src
src/palette.css: line 3: cmdk-label has no modern-cmdk equivalent: cmdk renders a visually hidden <label>; modern-cmdk puts the label on the root as aria-label and renders no label element; left unchanged
changed src/palette.css
1 changed, 0 unchanged, 0 errors, 1 reported
```

which left `[data-command-root] { ... }`, `[data-command-item][data-active] { ... }` and the untouched `[cmdk-label] { display: none; }`.

## Options and exit codes

Pasted from `node dist/cli.mjs --help` of this package's build:

```text
Usage: modern-cmdk-codemod <transform> <glob|dir> [options]

modern-cmdk-codemod runs with --strict unless --lenient is given. A strict run without --dry-run
refuses to write into a git tree with uncommitted changes (or outside a git tree) unless --force is given.

Transforms:
  import-rewrite   Rewrites cmdk imports to modern-cmdk/react
  data-attrs       Converts [cmdk-*] selectors to [data-command-*]
  forward-ref      Removes React.forwardRef wrappers (React 19)
  should-filter    Converts shouldFilter prop to filter

Options:
  --dry-run        List the files that would change; write nothing
  --strict         Exit 2 on usage errors (incl. unknown options), 1 on file errors
  --concurrency=N  Files processed at once (default: min(8, available cores))
  -h, --help       Show this help
  --lenient        Keep the lenient exit codes below (cannot be combined with --strict) and skip the clean-git-tree check (modern-cmdk-codemod only)
  --force          Skip the clean-git-tree check (modern-cmdk-codemod only; modern-cmdk ignores it)
  -v, --version    Print the package name and version

Exit codes:
  strict   0 success (reports included); 1 a file errored, no file matched or the run failed;
           2 usage error (unknown or malformed option, unknown transform, missing argument,
           --strict with --lenient) or a refused dirty tree (modern-cmdk-codemod only)
  lenient  0 for --help, missing arguments, usage errors and per-file errors; 1 for an unknown
           transform, no matching files and an uncaught error

Files run on worker threads when --concurrency is above 1; --concurrency=1 runs them on the main thread.
A directory argument covers its .ts .tsx .mts .cts .js .jsx .mjs .cjs .css .scss files (dot paths excluded).
--dry-run also prints a unified diff of every file that would change.

Node >= 26.4.0 (the engines.node of modern-cmdk-codemod)
```

`modern-cmdk-codemod` is a new CLI with no earlier contract, so it is strict by default. `--lenient` (which also skips the git check) restores the exit codes of the deprecated `modern-cmdk` bin.

## Relation to the deprecated `modern-cmdk` bin

`modern-cmdk` still ships a `modern-cmdk` bin that runs the same four transforms, bundled. It is deprecated and leaves in modern-cmdk 2.0: it writes one deprecation warning to stderr per run, keeps the 1.x exit codes (lenient unless argv carries `--strict`) and 1.4's excludes (of the ten directories `modern-cmdk-codemod` skips, it skips only `node_modules`, `dist`, `build` and `.next`, and applies no `.gitignore`; like `modern-cmdk-codemod`, it reads only the ten script and stylesheet extensions from a directory, leaves out files and directories whose names start with a dot unless a pattern segment starts with that dot or a directory argument names that directory, descends no symlinked directory under `**` or a directory argument, reads no symlinked file and on Windows matches names case-insensitively; unlike it, it follows a symlinked directory that a pattern names or that a directory argument names, such as `"./src/link/*.tsx"` or `./src/link`), and makes no git check. Use `modern-cmdk-codemod` instead. The bundled codemod dependencies and their licences are listed in the `THIRD-PARTY-NOTICES.md` that `modern-cmdk` ships.

## More

The [migration guide](https://abcrimson.github.io/modern-cmdk/guide/migration-from-cmdk.html) has the attribute table, the CSS, SCSS and Tailwind rules and every breaking change.

## License

[MIT](https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE)
