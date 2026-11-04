---
"modern-cmdk": minor
"create-modern-cmdk": minor
---

Only green, honest gates: the CLIs print again, the docs stop claiming what the code does not do, and the default stylesheet's muted text meets WCAG 1.4.3.

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

- Docs live at https://abcrimson.github.io/modern-cmdk/; the old domain is gone, and the wiki is being retired in favour of the docs site.
- The README, package READMEs and docs no longer claim `RegExp.escape`, `WeakRef` listeners, exponential decay, sub-millisecond WASM search or other features the code does not have. The repository description no longer claims WASM, GPU, ES2026, TypeScript 6 or benchmark wins. Earlier CHANGELOG entries that list `RegExp.escape` (keyboard parser) and `NoInfer<T>` (callback typing) as shipped features describe code the packages do not have; they stay as release history and this entry corrects them.
- The README and the docs benchmarks page take their figures from a committed, CPU-stamped results file (`benchmarks/history/2026-11-04-45a9134.json`).

The Playwright e2e default is now Chromium only; Firefox and WebKit run with `E2E_ENGINES=all` until 1.8.0. CI and test tooling changed beyond that; none of it affects the packages.
