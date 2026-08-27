# modern-cmdk

pnpm monorepo (workspaces: `packages/*`, `apps/*`). Node 26.8.1 (see `.nvmrc`), pnpm >= 12.0.0.

## Commands

```bash
pnpm install --frozen-lockfile   # install (CI adds --ignore-scripts)
pnpm build                       # build all workspaces (pnpm -r run build)
pnpm test                        # vitest run (unit)
pnpm test:e2e                    # playwright test
pnpm bench                       # vitest bench
pnpm bench:ci                    # standalone CI benchmark (benchmarks/standalone/ci-bench.ts)
pnpm lint / pnpm typecheck       # biome check . / tsc --noEmit per package
pnpm size                        # build + size-limit
```

WASM crate (`packages/command-search-wasm`): the JS build skips itself unless `pkg/` exists. Build the crate first:

```bash
cd packages/command-search-wasm
pnpm build:wasm   # wasm-pack build crate --target web --out-dir ../pkg
```

## Gotchas / couplings

- **Docs deploy path coupling**: `.github/workflows/docs.yml` deploys GitHub Pages on pushes to `main` that touch `apps/docs/**` **or** `packages/*/src/**`. Edits to any package's `src/` trigger a docs deploy — that is intentional (API docs derive from source); don't "fix" the trigger paths.
- **size-limit hardcoded dist paths**: the `size-limit` config in root `package.json` points at `packages/modern-cmdk/dist/core/index.mjs` and `packages/modern-cmdk/dist/react/index.mjs`. Renaming/moving dist output or entry points breaks `pnpm size` and the CI size check — update those paths in the same change.
- **Do not rename `packages/command-search-wasm`**: the release workflow is coupled to that path/name.
- Never push git tags manually — tag pushes can trigger npm publishing.

## Conventions

- **Plans** live in `docs/plans/` as dated files: `YYYY-MM-DD-slug.md` (e.g. `2026-03-12-comprehensive-modernization.md`). New plan documents go there, not the repo root.
- **Specs** live in `docs/specs/` (e.g. `cmdk-complete-rewrite-specification-v2.md`).
