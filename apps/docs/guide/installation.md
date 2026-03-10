# Installation

## Requirements

- **React** >= 19.3.0
- **Node.js** >= 25.8.0 (for development)
- **TypeScript** >= 6.0.1-rc (recommended)

## Install

::: code-group
```bash [pnpm]
pnpm add modern-cmdk
```

```bash [npm]
npm install modern-cmdk
```

```bash [yarn]
yarn add modern-cmdk
```
:::

## Optional: WASM Search

For datasets over 5K items, install the optional WASM-accelerated search:

```bash
pnpm add modern-cmdk-search-wasm
```

## Optional: Frecency Persistence

`idb-keyval` is included as a direct dependency of `modern-cmdk`, so no separate install is needed. Frecency persistence via `IdbFrecencyStorage` works out of the box.

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
