# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 1.x | Yes |
| < 1.0.0 | No |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Report it privately through [GitHub private vulnerability reporting](https://github.com/ABCrimson/modern-cmdk/security/advisories/new), the only reporting channel
3. Include steps to reproduce if possible
4. Include the package name and version affected
5. This is a one-maintainer project: reports are handled on a best-effort basis, with no guaranteed response time

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). We will credit reporters in the advisory unless they prefer to remain anonymous.

## Scope

This policy covers:

- `modern-cmdk` (core engine)
- `modern-cmdk/react` (React adapter)
- `modern-cmdk-search-wasm` (WASM search; private and unreleased, not published to npm)
- `modern-cmdk` codemod CLI (migration codemods)
- Documentation site (https://abcrimson.github.io/modern-cmdk/)
- Interactive playground

## Known Security Considerations

- The WASM search engine requires `SharedArrayBuffer` for zero-copy mode, which needs [cross-origin isolation headers](https://web.dev/cross-origin-isolation-guide/). `createWorkerSearchEngine` runs search in a Web Worker and passes scores in a `SharedArrayBuffer` only when the page is cross-origin isolated, structured-cloning them otherwise; if the Worker cannot be constructed or fails before it signals ready, it falls back to the main-thread engine. `createWasmSearchEngine` runs on the main thread and falls back to the TypeScript scorer from `modern-cmdk` when the WASM module fails to load.
- The codemod CLI executes AST transforms on source files. Only run it on trusted codebases.
- The command palette renders user-provided content (item labels, group headings). Ensure proper sanitization when rendering untrusted content.

## Dependencies

- The core package (`modern-cmdk`) has a **single runtime dependency**: `idb-keyval`, lazy-loaded and used only by the optional IndexedDB frecency storage adapter.
- The React adapter depends on `react`, `react-dom`, and `radix-ui` as optional peer dependencies.
- We use Dependabot for automated dependency updates and monitor advisories via GitHub's security alerts.

## Security Updates

Security patches are released as `patch` versions as soon as the maintainer can prepare and verify them; there is no guaranteed turnaround.

Releases are published by the `Release` GitHub Actions workflow, which first waits for CI to succeed on the release commit. It publishes from the `npm` GitHub environment (deployable from `main` only) through npm OIDC Trusted Publishing, so no long-lived npm token exists.
