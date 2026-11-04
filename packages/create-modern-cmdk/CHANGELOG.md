# create-modern-cmdk

## 1.3.0

### Minor Changes

- [#57](https://github.com/ABCrimson/modern-cmdk/pull/57) [`840d18f`](https://github.com/ABCrimson/modern-cmdk/commit/840d18fdf92540ac20c312d1cd3d3f7fa4cc2136) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Only green, honest gates: the CLIs print again, the docs stop claiming what the code does not do, and the default stylesheet's muted text meets WCAG 1.4.3.
  
  **CLIs**
  
  - The codemod bin (`npx modern-cmdk`) and `npm create modern-cmdk` print usage, per-file results, dry-run lists and errors again. This restores the documented output.
  - New `--strict` flag on both CLIs: usage errors exit 2 and file errors exit 1. Without `--strict` the 1.x default exit codes are unchanged for well-formed commands; the exceptions are the malformed options and the `--template <name>` form below.
  - Unknown options are warned about and ignored when the required arguments are present; without them they are a usage error (exit 0). With `--strict` an unknown option always exits 2.
  - A malformed known option (codemod `--concurrency` with no value, `--dry-run=yes`, create `--template` with no value) is now a usage error that writes nothing and exits 0 (2 with `--strict`). 1.2.x ignored the option and ran, so `--dry-run=yes` performed a real write. Because the usage error comes before the run, a codemod call that 1.2.x ran to exit 1 (no matching files, or an unknown transform) exits 0 when it also carries one of these options. Both CLIs print the exact `parseArgs` wording for these errors.
  - `create-modern-cmdk` honours the space form `--template <name>`. An unknown template given that way now exits 1; 1.2.2 silently scaffolded `react-basic`. This is the one case where a default exit code rises (0 to 1).
  - The `react-dialog` template now opens with Mod+K (Cmd+K on macOS, Ctrl+K elsewhere).
  
  **React**
  
  - `Command.Input` no longer drops keystrokes under rapid typing, and `Command.Loading` no longer flashes or announces (`role="status"`, `aria-live`) on every keystroke: search updates no longer run in a transition.
  
  **Styles**
  
  - The default stylesheet's muted text (group headings, shortcuts, the empty state, the placeholder) uses the new `--command-muted-color` token instead of opacity, so it meets WCAG 1.4.3. Override the token to restyle it.
  - The token defaults to `light-dark()`. On a dark theme, set `color-scheme` (for example `color-scheme: dark` on `:root`) or override `--command-muted-color`; otherwise muted text takes the light value and is hard to read on a dark surface.
  
  **Documentation**
  
  - Docs live at https://abcrimson.github.io/modern-cmdk/; the old domain is gone, and the wiki is retired: every page points at the docs site.
  - The README, package READMEs and docs no longer claim `RegExp.escape`, `WeakRef` listeners, exponential decay, sub-millisecond WASM search or other features the code does not have. The repository description no longer claims WASM, GPU, ES2026, TypeScript 6 or benchmark wins. Earlier CHANGELOG entries that list `RegExp.escape` (keyboard parser) and `NoInfer<T>` (callback typing) as shipped features describe code the packages do not have; they stay as release history and this entry corrects them.
  - The README and the docs benchmarks page take their figures from a committed, CPU-stamped results file (`benchmarks/history/2026-11-04-45a9134.json`).
  
  The Playwright e2e default is now Chromium only; Firefox and WebKit run with `E2E_ENGINES=all` until 1.8.0. CI and test tooling changed beyond that; none of it affects the packages.

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
