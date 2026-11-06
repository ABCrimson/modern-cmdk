---
"create-modern-cmdk": minor
---

`create-modern-cmdk` scaffolds projects that build: the templates are files, every dependency is an exact pin, the dialog template's Mod+K works with Caps Lock on, and a run that cannot finish leaves no half-written project.

**Templates**

- The templates are files embedded at build time, no longer strings in code. Every generated dependency is an exact version (no caret or tilde), and `modern-cmdk` is pinned to the version of the release that ships the scaffolder, read when create-modern-cmdk is built.
- The scaffold imports `modern-cmdk/styles.css` and has a `typecheck` script. Bug fix: scaffolds rendered Dialog.Title visibly without styles.css, against the README's styled palette (CV-73). The `typecheck` script is additive: `tsconfig.json` is a solution file over `tsconfig.app.json` (src) and `tsconfig.node.json` (`vite.config.ts`), `typecheck` is `tsc -b` and `build` is `tsc -b && vite build`; `@types/node` joins the devDependencies.
- The `react-dialog` template's Mod+K shortcut works with Caps Lock on.
- `react-full` is a deprecated alias of `react-basic`: the same output, and the CLI warns on stderr. It never scaffolded frecency or WASM search; it is removed in create-modern-cmdk 2.0.

**CLI**

- When the target already holds files this run writes, they are listed on stderr before anything is written (`warning: <dir> is not empty; this run will overwrite N files:`, then one path per line) and the run carries on, as in 1.x. With `--no-overwrite` the list is an error (`error: <dir> already holds N files this run would overwrite:`), nothing is written and the exit code is 1. Other files in the target are left alone and not listed. Refusing a non-empty target by default is the 2.0.0 behaviour; nothing in 1.x refuses without `--no-overwrite`.
- The package name in the generated `package.json` is derived from the directory name and sanitized (lower-cased, runs of characters npm does not allow become `-`, leading `.`, `_` and `-` dropped; a valid scoped name is kept); a note is printed when the name changed. A name that derives to nothing, or one over 214 characters, is refused.
- On Windows, a directory name with a character Windows cannot use or a reserved device name is refused before any write.
- A failed write removes what this run created: no half-written project, and the error is printed.

**Bug fixes (from the findings ledger, each label as recorded)**

- `CV-05`: The react-full template is advertised but not implemented; it emits the react-basic App.
- `CV-21`: Scaffolding into an existing directory silently overwrites package.json, tsconfig.json and the other files.
- `CV-22`: The raw CLI argument is used as the npm package name; paths, spaces or capitals yield an invalid package.json.
- `CV-23`: A failed write leaves a half-written project with a silent exit 1.
- `CV-70`: --template=react-full is accepted silently (exit 0, empty stderr) although the roadmap's 1.x fallback requires a deprecation warning on stderr when it scaffolds react-basic, and usageText lists it beside the real templates with no 'deprecated' marker. Filed from the 1.5.0 re-verification (ledger-reverify-1.5.0, wf_732c83a6-15e) at b77f133.
- `CV-72`: The react-dialog template's hotkey compares event.key === 'k', so Mod+K does nothing with Caps Lock on (event.key is 'K'). Filed from the 1.5.0 re-verification (ledger-reverify-1.5.0, wf_732c83a6-15e) at b77f133.
- `CV-73`: Without the styles.css import, the react-dialog template's Dialog.Title and Dialog.Description render visibly, because .sr-only is defined only in styles.css:120, and the overlay is unstyled. Filed from the 1.5.0 re-verification (ledger-reverify-1.5.0, wf_732c83a6-15e) at b77f133.
- `CV-74`: mkdir runs before any validation or collision check, so a name with characters illegal on Windows fails mid-way with a half-written tree, and 'Next steps: cd `<projectName>`' is printed unquoted for names with spaces. Filed from the 1.5.0 re-verification (ledger-reverify-1.5.0, wf_732c83a6-15e) at b77f133.
- `DT-06`: The scaffolder is broken against its README. react-dialog prints 'Press Ctrl+K to open' over a dialog with no key handler. react-full produces the same JSX as react-basic. No template imports styles.css.
- `RP-12`: The react-full template ('dialog + frecency + WASM search'; README: async items, frecency, shortcuts, pages) produces the same App.tsx as react-basic.
- `RP-22`: No guard against overwriting an existing directory, and no project-name validation.
- `SEC-11`: Scaffolding into an existing directory silently overwrites package.json, tsconfig, vite config, index.html, main.tsx and App.tsx (CWE-73, data loss).

Already fixed in the create-modern-cmdk 1.3.0 CLI (4d82ee3) and re-verified for this release:

- `CV-02`: The CLI prints nothing ever: no usage text, unknown templates and errors exit 1 silently, success prints no next steps.
- `CV-06`: The react-dialog template says 'Press Ctrl+K to open', but the dialog can never open.
- `CV-20`: Hand-rolled argv parsing: -h creates a directory '-h', the --help check is dead, the --template space form is ignored, and split('=')[1] truncates values.
- `F5`: The react-full template is advertised as dialog, async, frecency, shortcuts, pages (README L37) and dialog + frecency + WASM (TEMPLATES), but it generates the react-basic App.
- `RP-11`: The react-dialog template says 'Press Ctrl+K to open', but nothing binds Ctrl+K and Command.Dialog starts closed, so the palette can never open.
- `SEC-12`: Template react-full (L12: dialog + frecency + WASM; package README L37; root README L134) generates the react-basic App. This is a false public claim.
