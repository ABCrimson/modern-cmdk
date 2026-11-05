<p align="center">
  <img src="apps/docs/public/og-image.svg" alt="modern-cmdk" width="640" />
</p>

<p align="center">
  <strong>modern-cmdk</strong><br/>
  The definitive command palette engine for the modern web.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/modern-cmdk"><img alt="npm version" src="https://img.shields.io/npm/v/modern-cmdk?style=flat-square&color=dc2626&labelColor=0a0e27"/></a>
  <a href="https://github.com/ABCrimson/modern-cmdk/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/ABCrimson/modern-cmdk/ci.yml?style=flat-square&color=dc2626&labelColor=0a0e27&label=CI"/></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7.1.0--dev.20261104.1-dc2626?style=flat-square&labelColor=0a0e27"/></a>
  <a href="https://react.dev/"><img alt="React" src="https://img.shields.io/badge/React-experimental--e84e1492-dc2626?style=flat-square&labelColor=0a0e27"/></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/npm/l/modern-cmdk?style=flat-square&color=dc2626&labelColor=0a0e27"/></a>
</p>

<p align="center">
  <a href="https://abcrimson.github.io/modern-cmdk/">Documentation</a> &middot;
  <a href="https://abcrimson.github.io/modern-cmdk/guide/getting-started.html">Getting Started</a> &middot;
  <a href="https://abcrimson.github.io/modern-cmdk/api/command.html">API Reference</a> &middot;
  <a href="https://abcrimson.github.io/modern-cmdk/examples/basic.html">Examples</a>
</p>

---

## What this is

A ground-up rewrite of `cmdk` for **React 19**, written in modern ECMAScript: a framework-agnostic command-palette state machine (search, frecency ranking, keyboard shortcuts) with a thin React adapter on top. This repository is a pnpm monorepo holding the library, its docs site and its tooling.

Usage, install, peers, sizes and the codemods are documented once, in the [`modern-cmdk` package README](./packages/modern-cmdk/README.md), which is also the npm page.

## Packages

| Package | What it is | npm status |
|---|---|---|
| [`modern-cmdk`](./packages/modern-cmdk) | Core engine, React adapter (`modern-cmdk/react`, `modern-cmdk/react/dialog`), default styles and the cmdk migration codemods | Published |
| [`create-modern-cmdk`](./packages/create-modern-cmdk) | Project scaffolding with three templates (react-basic, react-dialog, react-full) | Published |
| [`modern-cmdk-search-wasm`](./packages/command-search-wasm) | Rust/WASM fuzzy search (trigram index) | Experimental, private (0.9.0), unpublished |
| [`vscode-modern-cmdk`](./packages/vscode-modern-cmdk) | VS Code snippets extension | Private; not on the VS Code Marketplace (the npm 1.0.0 was an accidental publish) |

## Documentation

**[abcrimson.github.io/modern-cmdk](https://abcrimson.github.io/modern-cmdk/)** -- [Getting Started](https://abcrimson.github.io/modern-cmdk/guide/getting-started.html) | [Installation](https://abcrimson.github.io/modern-cmdk/guide/installation.html) | [Core API](https://abcrimson.github.io/modern-cmdk/api/command.html) | [React API](https://abcrimson.github.io/modern-cmdk/api/command-react.html) | [Theming](https://abcrimson.github.io/modern-cmdk/guide/theming.html) | [Accessibility](https://abcrimson.github.io/modern-cmdk/guide/accessibility.html) | [Benchmarks](https://abcrimson.github.io/modern-cmdk/benchmarks.html) | [Architecture](https://abcrimson.github.io/modern-cmdk/architecture/overview.html) | [Migration from cmdk](https://abcrimson.github.io/modern-cmdk/guide/migration-from-cmdk.html)

## Development

```bash
git clone https://github.com/ABCrimson/modern-cmdk.git && cd modern-cmdk
pnpm install --frozen-lockfile && pnpm build && pnpm test
```

Development uses the Node version in `.nvmrc` (Node 28 nightly 28.0.0-nightly20261104d36e9ba1f8) and the `engines` floor of the root `package.json`, with pnpm 12.

| Command | Description |
|---|---|
| `pnpm build` | Build all packages |
| `pnpm test` | Unit tests (Vitest 5, happy-dom) |
| `pnpm test:e2e` | E2E tests (Playwright; Chromium, with Firefox and WebKit opt-in via `E2E_ENGINES=all`) |
| `pnpm bench` | Benchmarks (Vitest bench mode) |
| `pnpm lint` | Lint (Biome) |
| `pnpm typecheck` | Type-check (TypeScript 7.1.0-dev.20261105.1) |
| `pnpm size` | Build, then the size-limit budgets |
| `pnpm docs:dev` | Docs dev server (VitePress) |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide and [ARCHITECTURE.md](./ARCHITECTURE.md) for the technical design.

## Security

Report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md); do not open a public issue.

## License

[MIT](./LICENSE) -- Copyright (c) 2026 Albert Badalov
