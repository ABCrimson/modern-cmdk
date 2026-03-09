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
npm create modern-cmdk my-command-palette
```

Or with pnpm / npx:

```bash
pnpm create modern-cmdk my-command-palette
npx create-modern-cmdk my-command-palette
```

## Templates

| Template | Description |
|----------|-------------|
| `react-basic` | Inline command palette with search, items, and groups |
| `react-dialog` | Dialog-based palette with Ctrl+K trigger and overlay |
| `react-full` | Full-featured: dialog, async items, frecency, shortcuts, pages |

Specify a template:

```bash
npm create modern-cmdk my-app -- --template react-dialog
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

- [`modern-cmdk`](https://www.npmjs.com/package/modern-cmdk) -- core engine + React 19 adapter
- React 19, TypeScript 6, Vite 8
- Ready to `npm install && npm run dev`

## Requirements

- Node.js >= 25.8.0
- npm, pnpm, or yarn

## Links

- [Documentation](https://command.crimson.dev)
- [modern-cmdk on npm](https://www.npmjs.com/package/modern-cmdk)
- [GitHub](https://github.com/ABCrimson/modern-cmdk)

## License

[MIT](https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE) -- Copyright (c) 2026 Crimson Dev
