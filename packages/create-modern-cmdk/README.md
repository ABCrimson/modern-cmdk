<p align="center">
  <img src="https://raw.githubusercontent.com/ABCrimson/modern-cmdk/main/apps/docs/public/og-image.svg" alt="modern-cmdk" width="480" />
</p>

<h1 align="center">create-modern-cmdk</h1>

<p align="center">
  <strong>Scaffold a new <a href="https://www.npmjs.com/package/modern-cmdk">modern-cmdk</a> project in seconds.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-modern-cmdk"><img src="https://img.shields.io/npm/v/create-modern-cmdk?style=flat-square&color=dc2626&labelColor=0a0e27" alt="npm" /></a>
  <a href="https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/create-modern-cmdk?style=flat-square&color=dc2626&labelColor=0a0e27" alt="license" /></a>
</p>

---

## Usage

```bash
npm create modern-cmdk@latest my-command-palette
```

Or with pnpm / npx:

```bash
pnpm create modern-cmdk@latest my-command-palette
npx create-modern-cmdk my-command-palette
```

## Templates

| Template | Description |
|----------|-------------|
| `react-basic` | Basic inline command palette (React) |
| `react-dialog` | Command palette in a dialog, opened with Mod+K (Ctrl+K, Cmd+K on macOS) (React) |
| `react-full` | Deprecated alias of `react-basic`: the same output, and the CLI warns on stderr. Removed in create-modern-cmdk 2.0 |

There are two templates, `react-basic` (the default) and `react-dialog`. `react-full` never scaffolded frecency or WASM search; use `react-basic`.

Specify a template:

```bash
npm create modern-cmdk@latest my-app -- --template=react-dialog
```

`--template=<name>` is the documented form; `--template <name>` (with a space) is honoured too since 1.3.0. An unknown template, given either way, exits 1.

## Options and exit codes

```text
Usage: create-modern-cmdk <project-name> [options]

Templates:
  react-basic        Basic inline command palette (React)
  react-dialog       Command palette in a dialog, opened with Mod+K (Ctrl+K, Cmd+K on macOS) (React)
  react-full         Deprecated alias of react-basic (removed in create-modern-cmdk 2.0)

Options:
  --template=<name>  Template to scaffold (default react-basic)
  --no-overwrite     Refuse a target directory that already holds any file this run would write
                     (1.x lists the files it overwrites and carries on; create-modern-cmdk 2.0 refuses
                     a non-empty target unless --force is given)
  --strict           Exit 2 on usage errors (incl. unknown options)
  -h, --help         Show this help
```

### A target that already holds files

Before it writes anything, the scaffolder checks the files it would write. In 1.x a target that already holds any of them is listed on stderr (`warning: <dir> is not empty; this run will overwrite N files:`, then one path per line) and the run carries on and overwrites them. With `--no-overwrite` the same list is printed as an error, nothing is written and the exit code is `1`. In create-modern-cmdk 2.0 refusing a non-empty target becomes the default, and `--force` will be the way to write into one.

### Names

The directory you name is the project directory. The package name in the generated `package.json` is derived from it and sanitized: lower-cased, every run of characters npm does not allow becomes `-`, and leading `.`, `_` and `-` are dropped (a valid scoped name such as `@scope/app` is kept as given). The scaffolder prints `note: package name "<name>" (from "<directory>")` when it changed the name. Only a name that derives to nothing, or one over 214 characters, is refused. On Windows a directory name with a character Windows cannot use (`<`, `>`, `:`, `"`, `|`, `?`, `*` or a control character) or a reserved device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`) is refused before anything is written.

### Exit codes

Default exit codes in 1.x: `0` for `--help` and a missing project name; `1` for an unknown template, an unusable name, a `--no-overwrite` collision and write failures. An unknown option is warned about on stderr and ignored when a project name is given. A malformed known option (`--template` with no value, `--strict=yes`) is a usage error that writes nothing and exits `0`. With `--strict`, every usage error (including an unknown option, a missing project name and an unknown template) and an unusable name exit `2`.

## What you get

```
my-command-palette/
  src/
    App.tsx          # Command palette component
    main.tsx         # Entry point
  index.html
  package.json       # Dependencies pre-configured
  tsconfig.json      # Solution file: references the two projects below, checked with `tsc -b`
  tsconfig.app.json  # TypeScript strict mode for src/
  tsconfig.node.json # TypeScript strict mode for vite.config.ts
  vite.config.ts     # Vite + React plugin
```

The generated `package.json` pins every dependency to an exact version, with no caret or tilde range (pinned by the test titled `SEC-13, DT-07, RP-23, F31: every generated dependency is an exact version`). The pins of the other packages are in [`src/versions.ts`](https://github.com/ABCrimson/modern-cmdk/blob/main/packages/create-modern-cmdk/src/versions.ts), each the npm `latest` dist-tag on 2026-11-10: `react` and `react-dom` 19.3.1, `radix-ui` 1.8.1, `typescript` 7.0.2, `vite` 8.3.7, `@vitejs/plugin-react` 6.3.0, `@types/node` 26.6.6, `@types/react` and `@types/react-dom` 19.3.0. `modern-cmdk` itself is pinned to the version of the `modern-cmdk` package in the release that ships the scaffolder, read when create-modern-cmdk is built.

- [`modern-cmdk`](https://www.npmjs.com/package/modern-cmdk) -- core engine + React 19 adapter
- [`radix-ui`](https://www.npmjs.com/package/radix-ui) -- the dialog primitive, a required peer of `modern-cmdk` in 1.x
- `src/main.tsx` imports `modern-cmdk/styles.css`
- TypeScript is strict (`strict: true` in `tsconfig.app.json` and `tsconfig.node.json`), and `npm run typecheck` runs `tsc -b`; `npm run build` runs `tsc -b && vite build`
- Ready to `npm install && npm run dev`

## Requirements

- Node.js >= 26.4.0
- npm, pnpm, or yarn

## Links

- [Documentation](https://abcrimson.github.io/modern-cmdk/)
- [modern-cmdk on npm](https://www.npmjs.com/package/modern-cmdk)
- [GitHub](https://github.com/ABCrimson/modern-cmdk)

## License

[MIT](https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE) -- Copyright (c) 2026 Albert Badalov
