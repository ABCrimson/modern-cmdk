# modern-cmdk

pnpm monorepo (workspaces: `packages/*`, `apps/*`). Node 28 nightly 28.0.0-nightly20261104d36e9ba1f8 (see `.nvmrc`; the root `engines` floor is >= 26.4.0; the published `modern-cmdk` declares none, `create-modern-cmdk` keeps >= 26.4.0), pnpm >= 12.0.0.

## Commands

```bash
pnpm install --frozen-lockfile   # install (CI adds --ignore-scripts)
pnpm build                       # build all workspaces (pnpm -r --workspace-concurrency=4 run build)
pnpm test                        # vitest run (unit)
pnpm test:e2e                    # playwright test
pnpm test:docs                   # playwright render tests for the built docs site (pnpm docs:build first)
pnpm bench                       # vitest bench
pnpm bench:compare               # standalone harness vs benchmarks/baseline.json (exit 0 pass / 1 warning / 2 failure)
pnpm lint                        # biome check . --error-on-warnings
pnpm typecheck                   # tsc --noEmit: modern-cmdk, create-modern-cmdk, tests/, tests/e2e, tests/docs; vue-tsc --noEmit: the docs app (no pkg/ needed)
pnpm size                        # build + size-limit
pnpm check:package               # publint (strict) on both packed tarballs; attw and the tarball file list on modern-cmdk's (run pnpm build first)
pnpm check:doc-samples            # type-checks every fenced ts/tsx sample of the docs and READMEs against the built dist (run pnpm build first; a checkout without the wasm build passes --skip-wasm)
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
- **size-limit hardcoded dist paths**: the `size-limit` config in root `package.json` points at `packages/modern-cmdk/dist/core/index.mjs` (core), `packages/modern-cmdk/dist/react/index.mjs` (react, three entries), `packages/modern-cmdk/dist/react/dialog.mjs` (react/dialog), `packages/modern-cmdk/dist/react/styles.css` (styles.css) and `packages/modern-cmdk/dist/codemod/cli.mjs` plus `packages/modern-cmdk/dist/codemod/transforms/*.mjs` (codemod, the whole bin). Renaming/moving dist output or entry points breaks `pnpm size` and the CI size check — update those paths in the same change.
- **Do not rename `packages/command-search-wasm`**: the release workflow is coupled to that path/name.
- Never push git tags manually — tag pushes can trigger npm publishing.

## Conventions

- **Plans** live in `docs/plans/` as dated files: `YYYY-MM-DD-slug.md` (e.g. `2026-03-12-comprehensive-modernization.md`). New plan documents go there, not the repo root.
- **Specs** live in `docs/specs/` (e.g. `cmdk-complete-rewrite-specification-v2.md`).
