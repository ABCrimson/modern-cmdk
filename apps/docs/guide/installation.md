# Installation

## Requirements

| | Version | Notes |
|---|---|---|
| **Runtime** | no version check | `modern-cmdk` declares no `engines` (from 1.4.0). The published code uses ES2025 iterator helpers (`.values().map()`, `.toArray()`), `Symbol.dispose` and `Symbol.asyncDispose`, and `Array.prototype.toSorted` and `toSpliced`; run it on an engine that has them. |
| **Node.js (tools)** | >= 26.4.0 | The codemod bin and `create-modern-cmdk` are supported on Node >=26.4.0 (`create-modern-cmdk` declares it in `engines`; the codemod no longer does, from 1.4.0, D14). |
| **TypeScript** | >= 5.6 | Measured consumer floor, with `"lib": ["ESNext", "DOM"]` (the `.d.mts` files use `IteratorObject`, `Disposable` and `AsyncDisposable`). 5.5.4 fails with `Cannot find name 'IteratorObject'`. The package is *built* with TypeScript 7.1.0-dev.20261104.1, which is a separate fact from the floor. Method below. |

### How the TypeScript floor was measured

Pack the tarball (`node scripts/check-package.ts --package modern-cmdk --pack-dir <dir>`), install it with `react`, `react-dom`, `radix-ui`, `@types/react` and `@types/react-dom` at the repository pins into a scratch project, and compile a fixture that imports every runtime export of `modern-cmdk`, `modern-cmdk/react` and `modern-cmdk/react/dialog` with `skipLibCheck: false`, `lib: ["ESNext", "DOM"]`, `moduleResolution: "bundler"` and `jsx: "react-jsx"`. Each compiler ran as `pnpm dlx --package typescript@<version> tsc -p .` on 2026-11-04, against the 1.2.3 tarball packed from this branch:

| TypeScript | Result |
|---|---|
| 5.5.4 | fails: `dist/core/index.d.mts(15,57): error TS2304: Cannot find name 'IteratorObject'` |
| 5.6.2 | passes |
| 5.6.3 | passes |
| 5.7.3 | passes |
| 5.8.3 | passes |
| 5.9.3 | passes |
| 6.0.3 | passes |

With `lib: ["ES2023", "DOM"]` the same fixture fails on 5.9.3 (`Cannot find name 'Disposable'`; `Property 'dispose' does not exist on type 'SymbolConstructor'`), so the `ESNext` lib is part of the floor. Older compilers were a probe, not a pin, and versions between those listed were not run.

## Peer dependencies

The core entry imports no peer -- `import { createCommandMachine } from 'modern-cmdk'` works on its own -- but the package declares `radix-ui` as a required peer in 1.x, so `npm install modern-cmdk` also installs `radix-ui` and its own required peers `react` and `react-dom`, even when you use only the core. In 1.x `radix-ui` is a **required** peer, and `react` and `react-dom` are the optional peers (`peerDependenciesMeta` marks only those two optional), so npm 7+ and pnpm install `radix-ui` together with `modern-cmdk`, or warn when they cannot. Which entry needs which peer:

| Entry | `react` (`>=19.0.0 <21.0.0`) | `react-dom` (`>=19.0.0 <21.0.0`) | `radix-ui` (`>=1.4.0 <2.0.0`) |
|---|---|---|---|
| `modern-cmdk` | not needed | not needed | not needed |
| `modern-cmdk/react` | imported | imported | imported (statically) |
| `modern-cmdk/react/dialog` | imported | needed: this entry does not import it, but the `radix-ui` dialog portal does (`react-dom` is a required peer of `radix-ui`) | imported (statically) |
| `modern-cmdk/styles.css` | not needed | not needed | not needed |

> [!IMPORTANT]
> `dist/react` imports `radix-ui` statically, so **every** import of `modern-cmdk/react`, and of `modern-cmdk/react/dialog`, needs `radix-ui` installed in 1.x, not only rendering `<Command.Dialog>`. React users install all three:
>
> ```bash
> pnpm add modern-cmdk react react-dom radix-ui
> ```
>
> The dialog is also exported from the `modern-cmdk/react/dialog` subpath (`import { CommandDialog } from 'modern-cmdk/react/dialog'`). The `modern-cmdk/react` barrel keeps `Command.Dialog` until 2.0; when the barrel drops it, `radix-ui` becomes an optional peer again.

`modern-cmdk` itself ships exactly one runtime dependency, `idb-keyval`, and it is lazy-loaded — see [Frecency Persistence](#optional-frecency-persistence) below.

## Install

The commands install the React setup. For the framework-agnostic core, install `modern-cmdk` alone; in 1.x npm 7+ and pnpm still add the required peer `radix-ui` and, through it, `react` and `react-dom`.

::: code-group
```bash [pnpm]
pnpm add modern-cmdk react react-dom radix-ui
```

```bash [npm]
npm install modern-cmdk react react-dom radix-ui
```

```bash [yarn]
yarn add modern-cmdk react react-dom radix-ui
```
:::

## Optional: WASM Search

An optional Rust/WASM search engine, designed for datasets over about 5K items, is in development; it does not work yet (see [WASM Search](/guide/wasm-search)).

::: warning Experimental -- not yet published
`modern-cmdk-search-wasm` is not on npm yet. Until it ships, build it from source with `wasm-pack` from the [package directory](https://github.com/ABCrimson/modern-cmdk/tree/main/packages/command-search-wasm). The built-in TypeScript scorer in `modern-cmdk` is the default and needs no extra install. The command below will work once the package is published:
:::

```bash
pnpm add modern-cmdk-search-wasm
```

## Optional: Frecency Persistence

`idb-keyval` is included as a direct dependency of `modern-cmdk`, so no separate install is needed. Frecency persistence via `IdbFrecencyStorage` works out of the box.

## TypeScript Configuration

The package's `Symbol.dispose` and iterator types need the ESNext lib (measured TypeScript floor 5.6, see [Requirements](#requirements)):

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext", "DOM"],
    "moduleResolution": "bundler"
  }
}
```
