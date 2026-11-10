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
- `modern-cmdk-codemod` (the migration codemod CLI, bin `modern-cmdk-codemod`)
- the deprecated `modern-cmdk` codemod bin (`dist/codemod/bin.mjs`, until 2.0)
- Documentation site (https://abcrimson.github.io/modern-cmdk/)
- Interactive playground

## Known Security Considerations

- The WASM search engine requires `SharedArrayBuffer` for zero-copy mode, which needs [cross-origin isolation headers](https://web.dev/cross-origin-isolation-guide/). `createWorkerSearchEngine` runs search in a Web Worker and passes scores in a `SharedArrayBuffer` only when the page is cross-origin isolated, structured-cloning them otherwise; if the Worker cannot be constructed or fails before it signals ready, it falls back to the main-thread engine. `createWasmSearchEngine` runs on the main thread and falls back to the TypeScript scorer from `modern-cmdk` when the WASM module fails to load.
- The codemod CLIs (`modern-cmdk-codemod` and the deprecated `modern-cmdk` bin) execute AST transforms on source files. Only run them on trusted codebases.
- The command palette renders user-provided content (item labels, group headings). Ensure proper sanitization when rendering untrusted content.

## Dependencies

- The core package (`modern-cmdk`) has a **single runtime dependency**: `idb-keyval`, lazy-loaded and used only by the optional IndexedDB frecency storage adapter.
- The React adapter depends on `react` and `react-dom` as optional peer dependencies and on `radix-ui` as a required peer dependency (range `>=1.4.0 <2.0.0`) through 1.x.
- We use Dependabot for automated dependency updates and monitor advisories via GitHub's security alerts.

## Security Updates

Security patches are released as `patch` versions as soon as the maintainer can prepare and verify them; there is no guaranteed turnaround.

Releases are published by the `Release` GitHub Actions workflow, which first waits for CI to succeed on the release commit. It publishes from the `npm` GitHub environment (deployable from `main` only) through npm OIDC Trusted Publishing, so no long-lived npm token exists.

## Verifying a release

The `Release` workflow makes an SPDX SBOM and a build-provenance attestation for each packed tarball (`modern-cmdk`, `create-modern-cmdk` and `modern-cmdk-codemod`) before anything is published. To check that a tarball was built by this repository's workflow, download it and run:

```bash
gh attestation verify <tgz> -R ABCrimson/modern-cmdk
```

The command exits non-zero when no attestation of this repository matches the file's digest.

One version was not published by the workflow: `modern-cmdk-codemod` 1.0.0, the package's first version, was published by the owner by hand on 2026-11-10 (npm trusted publishing can be configured only for a package that exists) from a tarball the `Release` workflow built and attested. It carries no npm provenance, but its tarball has GitHub artifact attestations (build provenance and SBOM) and verifies with the command above; `modern-cmdk-codemod` 1.0.1 onward are published by the workflow with npm provenance. The first version of any new package is published by the owner by hand, and the workflow refuses to publish a package npm has never seen.
