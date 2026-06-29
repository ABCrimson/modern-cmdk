# Installation

## Requirements

- **React** >= 19.0.0
- **Node.js** >= 26.4.0 (for development)
- **TypeScript** >= 7.0.1-rc (recommended)

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

For datasets over 5K items, an optional Rust/WASM-accelerated search engine is available.

::: warning Experimental -- not yet published
`modern-cmdk-search-wasm` is not on npm yet. Until it ships, build it from source with `wasm-pack` from the [package directory](https://github.com/ABCrimson/modern-cmdk/tree/main/packages/command-search-wasm). The built-in TypeScript scorer in `modern-cmdk` is the default and needs no extra install. The command below will work once the package is published:
:::

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
