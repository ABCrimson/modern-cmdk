<h1 align="center">@crimson_dev/command-codemod</h1>

<p align="center">
  <strong>Automated migration from <code>cmdk</code> to <code>@crimson_dev/command-react</code></strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@crimson_dev/command-codemod"><img src="https://img.shields.io/npm/v/@crimson_dev/command-codemod?style=flat-square&color=crimson" alt="npm" /></a>
  <a href="https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@crimson_dev/command-codemod?style=flat-square" alt="license" /></a>
</p>

---

## What is this?

A set of jscodeshift transforms that automatically migrate your codebase from `cmdk` (pacocoursey/cmdk) to `@crimson_dev/command-react`. Handles import rewrites, API changes, and data attribute renames.

## Usage

Run all transforms at once:

```bash
npx @crimson_dev/command-codemod ./src
```

Or run individual transforms:

```bash
npx @crimson_dev/command-codemod --transform import-rewrite ./src
npx @crimson_dev/command-codemod --transform forward-ref ./src
npx @crimson_dev/command-codemod --transform data-attrs ./src
npx @crimson_dev/command-codemod --transform should-filter ./src
```

### Options

| Flag | Description |
|------|-------------|
| `--transform <name>` | Run a specific transform (default: all) |
| `--dry-run` | Preview changes without writing files |
| `--concurrency <n>` | Number of files to process in parallel (default: CPU count) |

## Transforms

### `import-rewrite`

Rewrites `cmdk` imports to `@crimson_dev/command-react`:

```diff
- import { Command } from 'cmdk';
+ import { Command } from '@crimson_dev/command-react';
```

### `forward-ref`

Removes `forwardRef` wrappers — React 19 passes `ref` as a regular prop:

```diff
- const MyCommand = forwardRef<HTMLDivElement, Props>((props, ref) => (
-   <Command ref={ref} {...props} />
- ));
+ function MyCommand({ ref, ...props }: Props & { ref?: Ref<HTMLDivElement> }) {
+   return <Command ref={ref} {...props} />;
+ }
```

### `data-attrs`

Updates data attribute selectors to the new naming convention:

```diff
- [cmdk-root] { ... }
+ [data-command-root] { ... }

- [cmdk-item][aria-selected="true"] { ... }
+ [data-command-item][data-active] { ... }
```

### `should-filter`

Migrates the `shouldFilter` prop to the new `filter` prop:

```diff
- <Command shouldFilter={false}>
+ <Command filter={false}>
```

## Dry Run

Always preview first:

```bash
npx @crimson_dev/command-codemod --dry-run ./src
```

Output shows each file with planned changes, without modifying anything.

## Requirements

- Node.js >= 25.8.0
- Files must be valid TypeScript/JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`)

## Links

- [Migration Guide](https://github.com/ABCrimson/modern-cmdk)
- [React Adapter](https://www.npmjs.com/package/@crimson_dev/command-react)

## License

MIT
