# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.9.x (RC) | Yes |
| < 0.9.0 | No |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email **security@crimson.dev** with details
3. Include steps to reproduce if possible
4. Include the package name and version affected
5. You will receive a response within 48 hours

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). We will credit reporters in the advisory unless they prefer to remain anonymous.

## Scope

This policy covers:

- `@crimson_dev/command` (core engine)
- `@crimson_dev/command-react` (React adapter)
- `@crimson_dev/command-search-wasm` (WASM search)
- `@crimson_dev/command-codemod` (migration codemods)
- Documentation site (command.crimson.dev)
- Interactive playground

## Known Security Considerations

- The WASM search engine requires `SharedArrayBuffer` for zero-copy mode, which needs [cross-origin isolation headers](https://web.dev/cross-origin-isolation-guide/). The engine falls back gracefully to structured clone when headers are absent.
- The codemod CLI executes AST transforms on source files. Only run it on trusted codebases.
- The command palette renders user-provided content (item labels, group headings). Ensure proper sanitization when rendering untrusted content.

## Dependencies

- The core package (`@crimson_dev/command`) has **zero runtime dependencies**.
- The React adapter depends on `react`, `react-dom`, and `radix-ui` as peer dependencies.
- We use Dependabot for automated dependency updates and monitor advisories via GitHub's security alerts.

## Security Updates

Security patches are released as `patch` versions and published to npm within 24 hours of a confirmed vulnerability.
