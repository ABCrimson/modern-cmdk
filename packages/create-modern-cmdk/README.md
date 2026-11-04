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
| `react-full` | Same output as react-basic; frecency and WASM search are not scaffolded yet (React) |

`react-basic` is the default.

Specify a template:

```bash
npm create modern-cmdk@latest my-app -- --template=react-dialog
```

`--template=<name>` is the documented form; `--template <name>` (with a space) is honoured too since 1.3.0. An unknown template, given either way, exits 1.

## Options and exit codes

```text
Usage: create-modern-cmdk <project-name> [options]

Options:
  --template=<name>  Template to scaffold (default react-basic)
  --strict           Exit 2 on usage errors (incl. unknown options)
  -h, --help         Show this help
```

Default exit codes in 1.x: `0` for `--help` and a missing project name; `1` for an unknown template and write failures. An unknown option is warned about on stderr and ignored when a project name is given. A malformed known option (`--template` with no value, `--strict=yes`) is a usage error that writes nothing and exits `0`. With `--strict`, every usage error (including an unknown option, a missing project name and an unknown template) exits `2`.

## What you get

```
my-command-palette/
  src/
    App.tsx          # Command palette component
    main.tsx         # Entry point
  index.html
  package.json       # Dependencies pre-configured
  tsconfig.json      # TypeScript strict mode
  vite.config.ts     # Vite + React plugin
```

Dependencies are declared as caret ranges (`^`) of known-good versions:

- [`modern-cmdk`](https://www.npmjs.com/package/modern-cmdk) -- core engine + React 19 adapter
- React 19, TypeScript 7, Vite 8
- Ready to `npm install && npm run dev`

## Requirements

- Node.js >= 26.4.0
- npm, pnpm, or yarn

## Links

- [Documentation](https://abcrimson.github.io/modern-cmdk/)
- [modern-cmdk on npm](https://www.npmjs.com/package/modern-cmdk)
- [GitHub](https://github.com/ABCrimson/modern-cmdk)

## License

[MIT](https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE) -- Copyright (c) 2026 Crimson Dev
