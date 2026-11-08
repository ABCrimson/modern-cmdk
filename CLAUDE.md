# modern-cmdk

pnpm monorepo (workspaces: `packages/*`, `apps/*`). Node 28 nightly 28.0.0-nightly20261107a43bfb5bb2 (see `.nvmrc`; the root `engines` floor is >= 26.4.0; the published `modern-cmdk` declares none, `create-modern-cmdk` and `modern-cmdk-codemod` keep >= 26.4.0), pnpm >= 12.0.0.

## Commands

```bash
pnpm install --frozen-lockfile   # install (CI adds --ignore-scripts)
pnpm build                       # build all workspaces (pnpm -r --workspace-concurrency=4 run build)
pnpm test                        # vitest run (unit)
pnpm test:e2e                    # playwright test
pnpm test:docs                   # playwright render tests for the built docs site (pnpm docs:build first)
pnpm bench                       # vitest bench
pnpm bench:compare               # standalone harness vs this CPU's record in benchmarks/baseline.json (exit 0 pass or no record / 1 warning / 2 failure)
pnpm lint                        # biome check . --error-on-warnings
pnpm typecheck                   # tsc --noEmit: modern-cmdk, modern-cmdk-codemod, create-modern-cmdk, tests/, tests/e2e, tests/docs; vue-tsc --noEmit: the docs app (no pkg/ needed)
pnpm size                        # build + size-limit
pnpm check:package               # on all three packed tarballs: publint (strict), no catalog:/workspace: in a packed manifest, bin shebang and execute bits; the bare-import allow-list on modern-cmdk-codemod's dist and modern-cmdk's dist/codemod; attw on modern-cmdk; the file lists of modern-cmdk and modern-cmdk-codemod (run pnpm build first)
pnpm check:doc-samples            # type-checks every fenced ts/tsx sample of the docs and READMEs against the built dist (run pnpm build first; a checkout without the wasm build passes --skip-wasm)
pnpm check:snippets              # type-checks every VS Code snippet of packages/vscode-modern-cmdk, expanded with its defaults, against the built dist (run pnpm build first)
pnpm check:repo-links           # the repository's own github.com blob/, tree/ and raw/ links in the shipped Markdown, changesets and changelogs resolve in the checkout (main/HEAD in the working tree, other refs through git; #readme, #L<n> and heading-anchor fragments too); routes such as /issues are counted, not checked; needs no build
pnpm check:notices               # packages/modern-cmdk/THIRD-PARTY-NOTICES.md matches what the built dist/codemod generates (run pnpm build first)
pnpm test:templates              # scaffolds react-basic, react-dialog and react-full from the packed tarballs, installs, type-checks and builds each (run pnpm check:package --pack-dir <dir> first; pass --pack-dir <dir> --template all)
pnpm test:codemod-tarball        # npm-installs the packed tarballs with their dependencies and runs the codemod (needs the npm registry; run pnpm check:package --pack-dir <dir> first; pass --pack-dir <dir>)
pnpm check:licenses              # lockfile licence audit against tests/package/license-policy.json (needs an install, not a build)
pnpm test:consumers              # Next (Turbopack, webpack) and Vite apps built from the packed tarball (run pnpm build first)
```

WASM crate (`packages/command-search-wasm`): the JS build skips itself unless `pkg/` exists. Build the crate first (the playground and the wasm package are type-checked only in CI, after their build inputs exist):

```bash
cd packages/command-search-wasm
pnpm build:wasm   # wasm-pack build crate --target web --out-dir ../pkg
```

The Rust/WASM gate (fmt, clippy, tests, wasm build) is the `rust-wasm` job in `.github/workflows/ci.yml`.

## Gotchas / couplings

- **Docs deploy path coupling**: `.github/workflows/docs.yml` deploys GitHub Pages on pushes to `main` that touch `apps/docs/**` **or** `packages/*/src/**`. Edits to any package's `src/` trigger a docs deploy — that is intentional (API docs derive from source); don't "fix" the trigger paths.
- **size-limit hardcoded dist paths**: the size-limit config is the root `.size-limit.mjs` (not `package.json`: it holds a `modifyRolldownConfig` function that defines `process.env.NODE_ENV` as `"production"` for every entry rolldown bundles, so the budgets measure the bundle a consumer bundler produces) and points at `packages/modern-cmdk/dist/core/index.mjs` (core), `packages/modern-cmdk/dist/react/index.mjs` (react, three entries), `packages/modern-cmdk/dist/react/dialog.mjs` (react/dialog), `packages/modern-cmdk/dist/react/styles.css` (styles.css) and `packages/modern-cmdk/dist/codemod/*.mjs` (bin shim, cli, worker, shared chunks) plus `packages/modern-cmdk/dist/codemod/transforms/*.mjs` (codemod, the whole bin), `packages/modern-cmdk/dist/codemod/bin.mjs` alone (the shim) and `packages/modern-cmdk-codemod/dist/*.mjs` plus `dist/transforms/*.mjs` (the new package's own files, jscodeshift excluded). Renaming/moving dist output or entry points breaks `pnpm size` and the CI size check — update those paths in the same change.
- **Codemod source lives in `packages/modern-cmdk-codemod/src`**: `modern-cmdk` builds its bundled `dist/codemod/cli.mjs` from that source (`packages/modern-cmdk/tsdown.config.ts` names `../modern-cmdk-codemod/src/...` entries; never a copy of the sibling's dist) behind the deprecated `dist/codemod/bin.mjs` shim (`packages/modern-cmdk/src/codemod/bin.ts`), until 2.0. The bundled set is an explicit `deps.onlyBundle` list: a new codemod dependency fails the `modern-cmdk` build until it is listed there and its licence is checked in `tests/package/license-policy.json`.
- **Do not rename `packages/command-search-wasm`**: the release workflow is coupled to that path/name.
- Never push git tags manually — tag pushes can trigger npm publishing.

## Conventions

- **Plans** live in `docs/plans/` as dated files: `YYYY-MM-DD-slug.md` (e.g. `2026-03-12-comprehensive-modernization.md`). New plan documents go there, not the repo root.
- **Specs** live in `docs/specs/` (e.g. `cmdk-complete-rewrite-specification-v2.md`).
