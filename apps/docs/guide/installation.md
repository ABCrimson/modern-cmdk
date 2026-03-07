# Installation

## Requirements

- **React** >= 19.3.0
- **Node.js** >= 25.8.0 (for development)
- **TypeScript** >= 6.0.1-rc (recommended)

## Install

::: code-group
```bash [pnpm]
pnpm add @crimson_dev/command @crimson_dev/command-react
```

```bash [npm]
npm install @crimson_dev/command @crimson_dev/command-react
```

```bash [yarn]
yarn add @crimson_dev/command @crimson_dev/command-react
```
:::

## Optional: WASM Search

For datasets over 5K items, install the optional WASM-accelerated search:

```bash
pnpm add @crimson_dev/command-search-wasm
```

## Optional: Frecency Persistence

For frecency data that persists across sessions:

```bash
pnpm add idb-keyval@6.2.2
```

## TypeScript Configuration

Ensure your `tsconfig.json` targets ES2026:

```json
{
  "compilerOptions": {
    "target": "ES2026",
    "lib": ["ES2026", "DOM"],
    "moduleResolution": "bundler"
  }
}
```
