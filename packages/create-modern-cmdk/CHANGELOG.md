# create-modern-cmdk

## 1.4.2

### Patch Changes

- [#78](https://github.com/ABCrimson/modern-cmdk/pull/78) [`b822bfe`](https://github.com/ABCrimson/modern-cmdk/commit/b822bfe70a442f302b1418aa2e2019b56893dde7) Thanks [@ABCrimson](https://github.com/ABCrimson)! - The README on the npm page fits a phone and names all four package managers. Nothing changes in what the scaffolder writes or prints.
  
  **Changed**
  
  - The Exit codes table fits a 360 px screen without scrolling sideways. Its last header reads "Strict" in place of "With `--strict`", and a sentence under the table says that the Default column is a run without `--strict` and the Strict column a run with it.
  - In the exit `1` row, the Default cell reads "a collision, a file-system error" in place of "a `--no-overwrite` collision, a failed write", and the Strict cell reads "Only the collision and a file-system error". The sentence under the table says that a collision is a run with `--no-overwrite` that finds a file it would write. The scaffolder exits `1` for a failed directory, a failed check of the target and a failed write alike, and all three are file-system errors.
  - Requirements read "Node 26.4.0 or later; npm, pnpm, yarn or bun", because the next steps the scaffolder prints already cover bun.

## 1.4.1

### Patch Changes

- [#74](https://github.com/ABCrimson/modern-cmdk/pull/74) [`3727958`](https://github.com/ABCrimson/modern-cmdk/commit/37279581994493325edd14c61c86f34edd900666) Thanks [@ABCrimson](https://github.com/ABCrimson)! - The `react-dialog` template now does what its text says, the scaffolder prints the next commands for the package manager that ran it, and the README and the package page describe what the scaffolder writes.
  
  **Fixed**
  
  - The `react-dialog` template opens and closes on `Mod+K`, which is <kbd>Cmd+K</kbd> on Apple platforms and <kbd>Ctrl+K</kbd> elsewhere. Before, either <kbd>Cmd+K</kbd> or <kbd>Ctrl+K</kbd> worked on every platform, while the README and the CLI's text named one key per platform. It is built on `parseShortcut` and `matchesShortcut` from `modern-cmdk`, with an `AbortController` listener, and the hint under the heading is a `Command.Shortcut` that shows the key of the platform.
  
  **Changed**
  
  - The next steps print `npm install` and `npm run dev`, `pnpm install` and `pnpm dev`, `yarn` and `yarn dev`, or `bun install` and `bun run dev`, from the package manager named in `npm_config_user_agent`. Before, they always printed the pnpm commands. Any other agent, or none, gets npm.
  - `--help` describes the `react-dialog` shortcut as `Mod+K (Cmd+K on Apple platforms, Ctrl+K elsewhere)`.
  - The README, `description`, `keywords` and `homepage` are rewritten to match what the scaffolder writes and prints.

## 1.4.0

### Minor Changes

- [#63](https://github.com/ABCrimson/modern-cmdk/pull/63) [`d3fc521`](https://github.com/ABCrimson/modern-cmdk/commit/d3fc5215db095ca0b24575465a089d3326f7295a) Thanks [@ABCrimson](https://github.com/ABCrimson)! - `create-modern-cmdk` scaffolds projects that build: the templates are files, every dependency is an exact pin, the dialog template's Mod+K works with Caps Lock on, and a run that cannot finish leaves no half-written project.
  
  **Templates**
  
  - The templates are files embedded at build time, no longer strings in code. Every generated dependency is an exact version (no caret or tilde), and `modern-cmdk` is pinned to the version of the release that ships the scaffolder, read when create-modern-cmdk is built.
  - The scaffold imports `modern-cmdk/styles.css` and has a `typecheck` script. Bug fix: scaffolds rendered Dialog.Title visibly without styles.css, against the README's styled palette (CV-73). The `typecheck` script is additive: `tsconfig.json` is a solution file over `tsconfig.app.json` (src) and `tsconfig.node.json` (`vite.config.ts`), `typecheck` is `tsc -b` and `build` is `tsc -b && vite build`; `@types/node` joins the devDependencies.
  - The `react-dialog` template's Mod+K shortcut works with Caps Lock on.
  - `react-full` is a deprecated alias of `react-basic`: the same output, and the CLI warns on stderr. It never scaffolded frecency or WASM search; it is removed in create-modern-cmdk 2.0.
  
  **CLI**
  
  - When the target already holds files this run writes, they are listed on stderr before anything is written (`warning: <dir> is not empty; this run will overwrite N files:`, then one path per line) and the run carries on, as in 1.x. With `--no-overwrite` the list is an error (`error: <dir> already holds N files this run would overwrite:`), nothing is written and the exit code is 1. Other files in the target are left alone and not listed. Refusing a non-empty target by default is the 2.0.0 behaviour; nothing in 1.x refuses without `--no-overwrite`.
  - The package name in the generated `package.json` is derived from the directory name and sanitized (lower-cased, runs of characters npm does not allow become `-`, leading `.`, `_` and `-` dropped; a valid scoped name is kept); a note is printed when the name changed. A name that derives to nothing, or one over 214 characters, is refused.
  - On Windows, a directory name with a character Windows cannot use or a reserved device name is refused before any write.
  - A failed write removes what this run created: no half-written project, and the error is printed.
  
  **Bug fixes (from the findings ledger, each label as recorded)**
  
  - `CV-05`: The react-full template is advertised but not implemented; it emits the react-basic App.
  - `CV-21`: Scaffolding into an existing directory silently overwrites package.json, tsconfig.json and the other files.
  - `CV-22`: The raw CLI argument is used as the npm package name; paths, spaces or capitals yield an invalid package.json.
  - `CV-23`: A failed write leaves a half-written project with a silent exit 1.
  - `CV-70`: --template=react-full is accepted silently (exit 0, empty stderr) although the roadmap's 1.x fallback requires a deprecation warning on stderr when it scaffolds react-basic, and usageText lists it beside the real templates with no 'deprecated' marker. Filed from the 1.5.0 re-verification (ledger-reverify-1.5.0, wf_732c83a6-15e) at b77f133.
  - `CV-72`: The react-dialog template's hotkey compares event.key === 'k', so Mod+K does nothing with Caps Lock on (event.key is 'K'). Filed from the 1.5.0 re-verification (ledger-reverify-1.5.0, wf_732c83a6-15e) at b77f133.
  - `CV-73`: Without the styles.css import, the react-dialog template's Dialog.Title and Dialog.Description render visibly, because .sr-only is defined only in styles.css:120, and the overlay is unstyled. Filed from the 1.5.0 re-verification (ledger-reverify-1.5.0, wf_732c83a6-15e) at b77f133.
  - `CV-74`: mkdir runs before any validation or collision check, so a name with characters illegal on Windows fails mid-way with a half-written tree, and 'Next steps: cd `<projectName>`' is printed unquoted for names with spaces. Filed from the 1.5.0 re-verification (ledger-reverify-1.5.0, wf_732c83a6-15e) at b77f133.
  - `DT-06`: The scaffolder is broken against its README. react-dialog prints 'Press Ctrl+K to open' over a dialog with no key handler. react-full produces the same JSX as react-basic. No template imports styles.css.
  - `RP-12`: The react-full template ('dialog + frecency + WASM search'; README: async items, frecency, shortcuts, pages) produces the same App.tsx as react-basic.
  - `RP-22`: No guard against overwriting an existing directory, and no project-name validation.
  - `SEC-11`: Scaffolding into an existing directory silently overwrites package.json, tsconfig, vite config, index.html, main.tsx and App.tsx (CWE-73, data loss).
  
  Already fixed in the create-modern-cmdk 1.3.0 CLI (4d82ee3) and re-verified for this release:
  
  - `CV-02`: The CLI prints nothing ever: no usage text, unknown templates and errors exit 1 silently, success prints no next steps.
  - `CV-06`: The react-dialog template says 'Press Ctrl+K to open', but the dialog can never open.
  - `CV-20`: Hand-rolled argv parsing: -h creates a directory '-h', the --help check is dead, the --template space form is ignored, and split('=')[1] truncates values.
  - `F5`: The react-full template is advertised as dialog, async, frecency, shortcuts, pages (README L37) and dialog + frecency + WASM (TEMPLATES), but it generates the react-basic App.
  - `RP-11`: The react-dialog template says 'Press Ctrl+K to open', but nothing binds Ctrl+K and Command.Dialog starts closed, so the palette can never open.
  - `SEC-12`: Template react-full (L12: dialog + frecency + WASM; package README L37; root README L134) generates the react-basic App. This is a false public claim.

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
