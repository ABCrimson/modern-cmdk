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
4. You will receive a response within 48 hours

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure). We will credit reporters in the advisory unless they prefer to remain anonymous.

## Scope

This policy covers:

- `@crimson_dev/command` (core engine)
- `@crimson_dev/command-react` (React adapter)
- `@crimson_dev/command-search-wasm` (WASM search)
- `@crimson_dev/command-codemod` (migration codemods)

## Known Security Considerations

- The WASM search engine requires `SharedArrayBuffer` for zero-copy mode, which needs [cross-origin isolation headers](https://web.dev/cross-origin-isolation-guide/). The engine falls back gracefully to structured clone when headers are absent.
- The codemod CLI executes AST transforms on source files. Only run it on trusted codebases.
