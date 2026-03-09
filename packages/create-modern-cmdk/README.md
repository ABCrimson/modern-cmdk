<h1 align="center">create-command</h1>

<p align="center">
  <strong>Scaffold a new <code>@crimson_dev/command</code> project in seconds</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@crimson_dev/create-command"><img src="https://img.shields.io/npm/v/@crimson_dev/create-command?style=flat-square&color=crimson" alt="npm" /></a>
  <a href="https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@crimson_dev/create-command?style=flat-square" alt="license" /></a>
</p>

---

## Usage

```bash
pnpm create @crimson_dev/command my-command-palette
```

Or with npx:

```bash
npx @crimson_dev/create-command my-command-palette
```

## Templates

| Template | Description |
|----------|-------------|
| `react-basic` | Inline command palette with search, items, and groups |
| `react-dialog` | Dialog-based palette with Ctrl+K trigger and overlay |
| `react-full` | Full-featured: dialog, async items, frecency, shortcuts, pages |

Specify a template:

```bash
pnpm create @crimson_dev/command my-app --template react-dialog
```

## What you get

```
my-command-palette/
  src/
    App.tsx          # Command palette component
    main.tsx         # Entry point
  index.html
  package.json       # Dependencies pre-configured
  tsconfig.json      # TypeScript 6 strict mode
  vite.config.ts     # Vite + React plugin
```

All dependencies are pinned to compatible versions:

- `@crimson_dev/command` + `@crimson_dev/command-react`
- React 19, TypeScript 6, Vite 8
- Ready to `pnpm install && pnpm dev`

## Requirements

- Node.js >= 25.8.0
- pnpm, npm, or yarn

## Links

- [Documentation](https://github.com/ABCrimson/modern-cmdk)
- [React Adapter](https://www.npmjs.com/package/@crimson_dev/command-react)

## License

MIT
