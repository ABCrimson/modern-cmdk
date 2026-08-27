# Installation

## Requirements

| | Version | Notes |
|---|---|---|
| **Node.js** | >= 26.4.0 | Only for building/developing. The published package runs anywhere ES2026 does. |
| **TypeScript** | >= 7.0.2 | Recommended. Types are emitted with `isolatedDeclarations`. |

## Peer dependencies

The core engine has **no** peer dependencies -- `import { createCommandMachine } from 'modern-cmdk'` works on its own. Everything React-related is an *optional* peer, declared so that non-React consumers are never forced to install it:

| Peer | Range | Needed for |
|---|---|---|
| `react` | `>=19.0.0 <21.0.0` | Anything from `modern-cmdk/react` |
| `react-dom` | `>=19.0.0 <21.0.0` | Anything from `modern-cmdk/react` |
| `radix-ui` | `>=1.4.0 <2.0.0` | `<Command.Dialog>` only |

> [!IMPORTANT]
> Because these peers are optional, your package manager will **not** install them
> automatically and will **not** warn when they are missing. If you render
> `<Command.Dialog>` without `radix-ui` installed, the import fails at runtime. Install the
> ones you use:
>
> ```bash
> pnpm add react react-dom radix-ui
> ```

`modern-cmdk` itself ships exactly one runtime dependency, `idb-keyval`, and it is lazy-loaded — see [Frecency Persistence](#optional-frecency-persistence) below.

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
