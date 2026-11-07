# create-modern-cmdk

## 1.3.1

### Patch Changes

- [#60](https://github.com/ABCrimson/modern-cmdk/pull/60) [`a5f1e71`](https://github.com/ABCrimson/modern-cmdk/commit/a5f1e71dec4aee21fdd5b70797a0bb59adc48e7a) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Package integrity, consumer integration, public record: one copy of the core, a `modern-cmdk/react/dialog` entry, honest package metadata, and corrections for CHANGELOG entries that credited code the packages never had.
  
  **modern-cmdk**
  
  - `modern-cmdk/react` no longer bundles its own copy of the core: it imports `modern-cmdk`, so apps using both entries ship the core once, and core types such as `ItemId` are assignable across entries.
  - Sizes, gzip, measured by size-limit 14.3.0 and recorded in `benchmarks/size-history/1.4.0.json` (committed in `5f1e01e`, measured at `07bfe79`): core 6355 B, `modern-cmdk/react` adapter only 5403 B, core + React 9830 B (1.3.0 measured 16199 B, the sum of 6355 B and a 9844 B React entry that inlined the core), `modern-cmdk/react/dialog` 1425 B, `styles.css` 3959 B. The `modern-cmdk` 1.2.0 entry's "the adapter's own gzipped size (~10.2 KB)" measured a file that inlined the core, so it was not the adapter's own size.
  - New `modern-cmdk/react/dialog` entry exporting `CommandDialog`. `modern-cmdk/react` still imports `radix-ui` in 1.x, so install `radix-ui` whenever you use the React entry. It is a required peer (`>=1.4.0 <2.0.0`); `react` and `react-dom` stay optional peers. This applies to core-only installs too: `npm install modern-cmdk` (npm 7+) and pnpm now also install `radix-ui` and, through its required peers, `react` and `react-dom`, even if you never import `modern-cmdk/react`; package managers with strict peers warn instead. `radix-ui` becomes optional again when the barrel drops `Command.Dialog` in 2.0.
  - `exports` gains `./package.json` and drops the duplicate `import` conditions; no import resolves differently.
  - `sideEffects` lists only `styles.css`.
  - `modern-cmdk` declares no `engines` field. The codemod bin and `create-modern-cmdk` are supported on Node >=26.4.0 (`create-modern-cmdk` declares it in `engines`; the codemod no longer does, from 1.4.0, D14). `npx modern-cmdk --help` states the same floor.
  - The codemod ships no unreachable `.d.mts` declarations.
  
  **create-modern-cmdk**
  
  - The tarball holds only the bin: no `index.d.mts` (with its dangling `sourceMappingURL`) and no source map. The manifest gains `homepage`, `bugs` and `keywords`.
  
  **Licence**
  
  - The `LICENSE` file of every package names Albert Badalov as the holder.
  
  **Documentation**
  
  - The installation page has the peer table and the `radix-ui` requirement, and the measured TypeScript floor: 5.6 with `"lib": ["ESNext", "DOM"]`. 5.5.4 fails with `Cannot find name 'IteratorObject'`; 5.6.2, 5.7.3, 5.8.3, 5.9.3 and 6.0.3 pass, with the method written out.
  - The npm README is the canonical README; the repository README points to it. Sizes in the docs cite the record above.
  - Every fenced `ts` and `tsx` sample in the docs site and in the root, `modern-cmdk` and `create-modern-cmdk` READMEs is type-checked against the built package in CI, apart from five deliberate fragments.
  
  **Errata**
  
  History stays as written; these entries claim code the packages do not have, or mislabel what they have.
  
  - `modern-cmdk` 1.1.3: "`Promise.withResolvers` ... remain" is wrong: the `modern-cmdk` source does not use `Promise.withResolvers` (ES2024). The pre-rename 0.9.0 section's "ES2026 Features (native)" list credits it to the scheduler, which never used it (only the unpublished `command-search-wasm` worker engine does), and lists Iterator Helpers there, which are ES2025.
  - `modern-cmdk` 0.9.0 (carried into the pre-rename history of the package changelog): `TypedEmitter` holds its listeners by strong reference, not through `WeakRef`; item registration does not use `useInsertionEffect`; and there is no `<Offscreen>`. The React adapter uses React's stable `<Activity>`.
  - `modern-cmdk` 1.0.0: "ES2026: Iterator Helpers" is wrong; iterator helpers are ES2025.
  - `modern-cmdk` 1.2.0: see the sizes bullet above for the "~10.2 KB" figure.
  
  The 1.3.0 entry already corrected `RegExp.escape` and `NoInfer<T>`.
  
  `vscode-modern-cmdk` is private; the `vscode-modern-cmdk@1.0.0` on npm was published by accident and is not the VS Code extension. The Dependabot and bug-report labels (`dependencies`, `ci`, `triage`) now exist in the repository. CI gained a package-integrity job (publint, are-the-types-wrong, the tarball file list, the licence audit and an SPDX SBOM), consumer apps built from the packed tarball and a Node 24 install check; none of it changes what the packages do.

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

Backfilled from the git history of `packages/create-modern-cmdk` between the tags `create-modern-cmdk@1.1.4` and `create-modern-cmdk@1.1.5` (published 2026-03-13). The GitHub release body of this version was a copy of the library's 1.0.0 notes until 2026-11-07, when it was replaced by this section.

### Patch Changes

- [`42b9df4`](https://github.com/ABCrimson/modern-cmdk/commit/42b9df4) **chore: bump version to 1.1.5** — Version-only change (`package.json`), aligning the release with the library's 1.1.5; no scaffolder source changed.

## 1.1.4

Backfilled from the git history of `packages/create-modern-cmdk` between the tags `create-modern-cmdk@1.0.0` and `create-modern-cmdk@1.1.4` (published 2026-03-13). The GitHub release body of this version was a copy of the library's 1.0.0 notes until 2026-11-07, when it was replaced by this section.

### Patch Changes

- [`c2cca4e`](https://github.com/ABCrimson/modern-cmdk/commit/c2cca4e) **fix: typecheck** — Added `@types/node` (`^22.15.0`) as a dev dependency, set `"types": ["node"]` in the package `tsconfig.json`, and added a `return` after `process.exit(0)` in `src/index.ts` so TypeScript narrows the parsed arguments.

- [`dbd6e7b`](https://github.com/ABCrimson/modern-cmdk/commit/dbd6e7b) **docs: npm README** — Rewrote the package README for the npm page.

- [`8ead89f`](https://github.com/ABCrimson/modern-cmdk/commit/8ead89f) **chore: tsdown target** — The tsdown build target changed from `es2026` to `esnext`.

- [`394652f`](https://github.com/ABCrimson/modern-cmdk/commit/394652f) **chore: version sync** — `package.json` version moved from 1.0.0 to 1.1.4 to match the library.

## 1.0.0

Initial release: `npm create modern-cmdk` scaffolds a Vite + React project wired to modern-cmdk (templates selectable via --template=<name>). The templates at this tag are `react-basic`, `react-dialog` and `react-full` (`src/index.ts` at `create-modern-cmdk@1.0.0`).

Changeset commit: [`f00ac85`](https://github.com/ABCrimson/modern-cmdk/commit/f00ac85f23a9823234f507015c423d0aa066a12c); release commit: [`d95b6b9`](https://github.com/ABCrimson/modern-cmdk/commit/d95b6b9).
