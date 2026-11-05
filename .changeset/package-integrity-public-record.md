---
"modern-cmdk": minor
"create-modern-cmdk": patch
---

Package integrity, consumer integration, public record: one copy of the core, a `modern-cmdk/react/dialog` entry, honest package metadata, and corrections for CHANGELOG entries that credited code the packages never had.

**modern-cmdk**

- `modern-cmdk/react` no longer bundles its own copy of the core: it imports `modern-cmdk`, so apps using both entries ship the core once, and core types such as `ItemId` are assignable across entries.
- Sizes, gzip, measured by size-limit 14.3.0 and recorded in `benchmarks/size-history/1.4.0.json` (commit `6e7c04d`): core 6355 B, `modern-cmdk/react` adapter only 5403 B, core + React 9830 B (1.3.0 measured 16199 B, the sum of 6355 B and a 9844 B React entry that inlined the core), `modern-cmdk/react/dialog` 1425 B, `styles.css` 3932 B. The `modern-cmdk` 1.2.0 entry's "the adapter's own gzipped size (~10.2 KB)" measured a file that inlined the core, so it was not the adapter's own size.
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
