# create-modern-cmdk

## 1.2.2

### Patch Changes

- [#42](https://github.com/ABCrimson/modern-cmdk/pull/42) [`541a5d7`](https://github.com/ABCrimson/modern-cmdk/commit/541a5d7e961ff36bcc5aa68329f0dd6f5e617368) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Refresh the generated project template to current stable releases: `modern-cmdk` ^1.2.2, `react` and `react-dom` ^19.3.1, `vite` ^8.3.5, `@vitejs/plugin-react` ^6.2.1 and `typescript` ^7.0.2. Add `@types/react` and `@types/react-dom` (React ships no types, so `tsc --noEmit` failed without them) and `radix-ui` (the optional peer that `Command.Dialog` imports). Drop `isolatedDeclarations` from the generated `tsconfig.json`: TypeScript 7 rejects it without `declaration` or `composite` (TS5069), and an app project emits no declarations.

## 1.2.1

### Patch Changes

- docs: correct the `--template` usage on the npm README — the flag must use the `--template=<name>` form; a space-separated `--template <name>` is not parsed and silently falls back to `react-basic`.

## 1.2.0

### Minor Changes

- **chore: bleeding-edge evergreen upgrade** — Updated the scaffold template to the newest installable versions (`modern-cmdk` ^1.1.5, `react`/`react-dom` ^19.2.0, `vite` ^8.0.0, `@vitejs/plugin-react` ^6.0.0) and fixed the generated `tsconfig.json` (ESNext target/module/lib). Raised `engines.node` to `>=26.4.0` and bumped the build toolchain (TypeScript 7.0.1-rc, tsdown 0.22.3).

## 1.1.5

Backfilled from the git history of `packages/create-modern-cmdk` between the tags `create-modern-cmdk@1.1.4` and `create-modern-cmdk@1.1.5` (published 2026-03-13). The GitHub release body of this version is a copy of the library's 1.0.0 notes and describes none of this.

### Patch Changes

- [`42b9df4`](https://github.com/ABCrimson/modern-cmdk/commit/42b9df4) **chore: bump version to 1.1.5** — Version-only change (`package.json`), aligning the release with the library's 1.1.5; no scaffolder source changed.

## 1.1.4

Backfilled from the git history of `packages/create-modern-cmdk` between the tags `create-modern-cmdk@1.0.0` and `create-modern-cmdk@1.1.4` (published 2026-03-13). The GitHub release body of this version is a copy of the library's 1.0.0 notes and describes none of this.

### Patch Changes

- [`c2cca4e`](https://github.com/ABCrimson/modern-cmdk/commit/c2cca4e) **fix: typecheck** — Added `@types/node` (`^22.15.0`) as a dev dependency, set `"types": ["node"]` in the package `tsconfig.json`, and added a `return` after `process.exit(0)` in `src/index.ts` so TypeScript narrows the parsed arguments.

- [`dbd6e7b`](https://github.com/ABCrimson/modern-cmdk/commit/dbd6e7b) **docs: npm README** — Rewrote the package README for the npm page.

- [`8ead89f`](https://github.com/ABCrimson/modern-cmdk/commit/8ead89f) **chore: tsdown target** — The tsdown build target changed from `es2026` to `esnext`.

- [`394652f`](https://github.com/ABCrimson/modern-cmdk/commit/394652f) **chore: version sync** — `package.json` version moved from 1.0.0 to 1.1.4 to match the library.

## 1.0.0

Initial release: `npm create modern-cmdk` scaffolds a Vite + React project wired to modern-cmdk (templates selectable via --template=<name>). The templates at this tag are `react-basic`, `react-dialog` and `react-full` (`src/index.ts` at `create-modern-cmdk@1.0.0`).

Changeset commit: [`f00ac85`](https://github.com/ABCrimson/modern-cmdk/commit/f00ac85f23a9823234f507015c423d0aa066a12c); release commit: [`d95b6b9`](https://github.com/ABCrimson/modern-cmdk/commit/d95b6b9).
