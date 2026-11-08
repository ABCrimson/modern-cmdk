# modern-cmdk-codemod

## 1.0.0

### Major Changes

- [#63](https://github.com/ABCrimson/modern-cmdk/pull/63) [`d3fc521`](https://github.com/ABCrimson/modern-cmdk/commit/d3fc5215db095ca0b24575465a089d3326f7295a) Thanks [@ABCrimson](https://github.com/ABCrimson)! - First release of `modern-cmdk-codemod` (1.0.0): the cmdk to modern-cmdk codemod as its own package, strict by default, with the transform and CLI fixes of 1.5.0. Run it with `npx modern-cmdk-codemod <transform> <dir|glob>`. Requires Node >= 26.4.0 (`engines.node` of this package).
  
  **CLI contract (new, so strict by default)**
  
  - Exit codes: 0 success (reports included); 1 a file errored, no file matched or the run failed; 2 a usage error (unknown or malformed option, unknown transform, missing argument, `--strict` with `--lenient`) or a refused dirty tree. `--help` says so.
  - `--lenient` restores the exit codes of the deprecated `modern-cmdk` bin (0 for `--help`, missing arguments, usage errors and per-file errors; 1 for an unknown transform, no matching files and an uncaught error) and skips the git check. It cannot be combined with `--strict`.
  - The git rule: a run that writes needs a git work tree in which every matched file is committed. A matched file that is modified, staged, deleted or untracked, that lies outside the work tree, or a git that cannot be found, writes nothing and exits 2; `--force` skips the check, and then nothing can undo the run. `--dry-run` needs no git tree. Additive: a strict run refuses with exit 2 when a matched file lies outside the git work tree of the working directory, unless `--force`. Bug fix: restores the 1.4 contract that no matched file is overwritten without notice (uncommitted work in a nested git repository now refuses under `modern-cmdk-codemod`; files.ts findDirtyFiles dirtyDirs).
  - A third positional argument exits 2 with "unexpected argument ..." unless `--lenient` is given, which ignores it (additive).
  - `-v` and `--version` print the package name and version; `--concurrency=N` must be an integer of at least 1 (`0` no longer hangs, a non-number no longer processes zero files); files run on worker threads above 1 and on the main thread at 1.
  - `--dry-run` lists the files that would change and prints a unified diff of each; it writes nothing.
  - Every site a transform cannot migrate is reported as `<path>: <message>` on stderr and counted in the summary (`N changed, N unchanged, N errors` plus `, N skipped` and `, N reported` when they are not zero); a failed file names its path. Reports never change the exit code.
  - A file an explicit pattern matches whose extension is neither a script nor a stylesheet (or a stylesheet under a transform without a stylesheet pass) is skipped and counted as skipped, never parsed.
  
  **File discovery**
  
  - A directory argument covers `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.css` and `.scss` files, not every file type. Bug fix: restores 1.4 matching of a directory argument such as app/[slug] (globby 16 expandDirectories; files.ts discoverFiles, dirs split).
  - Skipped: `node_modules`, `dist`, `build`, `.next`, `.git`, `coverage`, `.turbo`, `out`, `storybook-static` and `.vercel`; files and directories whose names start with a dot (as in 1.4; name them with an explicit pattern); every path your `.gitignore` covers (asked of `git check-ignore`); and every file reached through a symlinked directory below the working directory (SEC-29: modern-cmdk-codemod drops every file reached through a symlinked directory below cwd). The deprecated bin keeps 1.4's four ignores and no `.gitignore`.
  - A Windows path with backslashes matches its files. Files keep their line endings and quote style (the transforms no longer turn LF into CRLF or single quotes into double quotes).
  - Files are parsed by extension: `ts` for `.ts`, `.mts` and `.cts`, `tsx` for `.tsx`, and a JSX-capable parser for `.js`, `.jsx`, `.mjs` and `.cjs`.
  
  **Transforms** (run them in this order: `should-filter`, `forward-ref`, `data-attrs`, `import-rewrite`)
  
  - `should-filter`: only on `Command`, `Command.Dialog`, `CommandRoot` and `CommandDialog` bound to `'cmdk'` or `'modern-cmdk/react'`. `shouldFilter={false}` becomes `filter={false}`; `shouldFilter` and `shouldFilter={true}` are removed; `shouldFilter={expr}` becomes `filter={expr ? undefined : false}`; a cmdk `filter(value, search, keywords)` function is wrapped in an adapter to `(item, query) => number | false`.
  - `forward-ref`: unwraps every `forwardRef` form (renamed or aliased imports, namespace calls, single-parameter render functions, `forwardRef(Component)`, a defaulted props parameter), keeping names, types and comments; what it cannot unwrap is reported.
  - `data-attrs`: maps every `cmdk-*` attribute that has a `data-command-*` equivalent (`cmdk-root` is `data-command-root`; `cmdk-dialog`, `cmdk-overlay`, `cmdk-group-heading`, `cmdk-group-items` and `cmdk-list-sizer` are added), and `--cmdk-list-height` becomes `--command-list-height`, in JSX attributes, in selectors inside JS/TS string and template literals, and in `.css` and `.scss` files. The `[cmdk-item=""]` forms are matched, the state attributes become `data-active` and `data-disabled` (`[data-selected="true"]` becomes `[data-active]`, `data-[selected=true]:` becomes `data-active:`), and `cmdk-label` and `cmdk-item-select`, which have no equivalent, are reported.
  - `import-rewrite`: rewrites imports, re-exports, `import()`, `require()` and `vi.mock` or `jest.mock` of `'cmdk'` to `'modern-cmdk/react'`; `CommandRoot` and a default import become `Command`; names modern-cmdk/react lacks (`defaultFilter`, `CommandProps`), cmdk subpaths and `declare module 'cmdk'` are reported and left alone.
  
  Run on a committed tree, commit after each transform, and read the reports: the [migration guide](https://abcrimson.github.io/modern-cmdk/guide/migration-from-cmdk.html) has the attribute table and every breaking change.
  
  **Bug fixes (from the findings ledger, each label as recorded)**
  
  - `CLI-3`: .js/.mjs/.cjs files are parsed with the 'ts' parser, which rejects JSX. A .js file containing JSX throws, is counted as an error and is skipped silently.
  - `CLI-4`: The documented directory form './src' relies on globby's expandDirectories default (true), which globs every file type (CSS, JSON, MD, images). Each one is parsed as JS, throws, and is silently counted as an error.
  - `RP-16`: .js files are parsed with the 'ts' parser, so JSX in .js fails; the error is swallowed and recorded as '(unknown)'.
  - `RP-17`: The documented `./src` input globs every file type, parses each as TS, and never migrates [cmdk-*] selectors in .css files.
  - `RP-20`: A Windows backslash path matches no files and the CLI exits 1 with no message.
  - `SEC-07`: Unknown flags are silently ignored, so a typo of the safety flag rewrites files. There is also no git-clean check or backup before in-place overwrite (CWE-20).
  - `RP-19`: Unknown flags are silently ignored, so a typo like --dry performs a real write.
  - `SEC-30`: .js files with JSX are parsed with the ts parser and fail. Directory arguments expand to every file type. CSS files are never transformed, although the migration guide (L41) promises --cmdk-* CSS variable renames.
  - `DA-1`: cmdk-root is mapped to 'data-command', but modern-cmdk emits data-command-root and its CSS and README target [data-command-root]. Migrated selectors and JSX therefore point at an attribute nothing renders.
  - `DA-2`: The attribute map omits cmdk-dialog, cmdk-overlay, cmdk-group-heading, cmdk-group-items and cmdk-list-sizer, all of which have data-command-* equivalents. [cmdk-group-heading] (ubiquitous in shadcn/ui) survives migration untouched.
  - `DA-3`: cmdk's state attributes data-selected="true" and data-disabled="true" are not migrated to modern-cmdk's data-active="" and data-disabled="", so the common [cmdk-item][data-selected="true"] and Tailwind data-[selected=true]: styling silently stops matching.
  - `DA-4`: Only JS/TS ASTs are processed, so stylesheets (.css/.scss), the main home of [cmdk-*] selectors, are never migrated. The CLI feeds them to a JS parser, which throws, and the error is hidden.
  - `DA-5`: Only the exact '[attr]' form is matched; [cmdk-item=""] and [cmdk-item='x'] are not rewritten.
  - `DA-7`: Every literal data-attrs rewrites is reprinted double-quoted, because recast's StringLiteral printer ignores extra.raw and defaults to double quotes. Single-quote codebases get churned lines and escaped inner quotes.
  - `DA-10`: cmdk-label and cmdk-item-select (cmdk 1.1.1 dist/index.mjs) have no modern-cmdk equivalent, and the transform passes them through silently instead of reporting them; DA-2 mentions this but no row tracks the silent pass-through alone. Filed from the 1.5.0 re-verification (ledger-reverify-1.5.0, wf_732c83a6-15e) at b77f133.
  - `DG-05`: The data-attrs codemod rewrites [cmdk-root] to [data-command], not [data-command-root], so migrated root selectors and JSX attributes match nothing.
  - `ARCH-10`: cmdk-root maps to data-command, but the adapter renders data-command-root. data-selected->data-active, cmdk-group-heading, cmdk-group-items, cmdk-dialog and cmdk-overlay are missing, so migrated CSS silently stops matching. The comment 'Set.union' is false.
  - `RC-1`: The plan's A2 mapping cmdk-root -> data-command (rc-gaps L150-155) shipped. The library renders data-command-root, so migrated [cmdk-root] selectors match nothing. The plan's test only checks the 'data-command' prefix.
  - `RP-07`: The data-attrs codemod maps cmdk-root to data-command, but the library emits data-command-root, so migrated root selectors match nothing.
  - `TUB-01`: Test locks in cmdk-root -> data-command, but modern-cmdk renders data-command-root; migrated CSS [data-command] matches nothing.
  - `FR-1`: A ref parameter not named 'ref' becomes a shorthand destructure of a nonexistent prop ({ forwardedRef, ...props }), so the ref is always undefined in React 19.
  - `FR-2`: `forwardRef<T, Props>` type arguments and the ref annotation are dropped, so untyped params become implicit any. The header's promised output '`Props & { ref?: React.Ref<HTMLDivElement> }`' is never produced.
  - `FR-3`: Aliased forwardRef imports (forwardRef as fr) and namespace aliases (import * as R; R.forwardRef) are not detected.
  - `FR-4`: Single-parameter render functions and forwardRef(Component) are left wrapped, and the file is reported as unchanged.
  - `FR-5`: Callee detection checks only the name 'forwardRef'. Cleanup counts usages of 'forwardRef' but removes a specifier matched by imported.name, so an aliased import whose local is still called is deleted, and fr() calls are never unwrapped.
  - `FR-7`: When the props parameter is an AssignmentPattern, `forwardRef((props = {}, ref) => <div ref={ref} />)` becomes '`(props = {}) => <div ref={ref} />`': neither branch merges ref, :101 still deletes the ref parameter, so ref is unbound (ReferenceError at render) and the file is reported as changed (reproduced on a scratch fixture through jscodeshift 17.4.0). Filed from the 1.5.0 re-verification (ledger-reverify-1.5.0, wf_732c83a6-15e) at b77f133.
  - `FR-8`: When a react import has two specifiers whose imported name is forwardRef (import { forwardRef as fr, forwardRef } from 'react'), the import cleanup removes the first, sees one specifier left and removes the whole ImportDeclaration, dropping the other specifier even when it is still used (reproduced on a scratch fixture). Filed from the 1.5.0 re-verification (ledger-reverify-1.5.0, wf_732c83a6-15e) at b77f133.
  - `RP-08`: The forward-ref codemod breaks refs when the ref param is renamed, and drops the forwardRef generics so props become untyped.
  - `SEC-09`: A renamed ref param becomes a shorthand destructure of a prop React 19 never passes, so the ref is silently undefined. The generic type args are dropped too, which contradicts the header example at L10-12.
  - `IR-1`: Specifiers are rewritten blindly. cmdk's CommandRoot and defaultFilter do not exist in modern-cmdk/react, so rewritten imports break, and useCommandState's state shape differs.
  - `IR-2`: 'import Command from "cmdk"' is rewritten even though modern-cmdk/react has no default export, so the result does not compile.
  - `IR-3`: vi.mock/jest.mock('cmdk'), TS import-equals, typeof import('cmdk'), declare module 'cmdk' and cmdk/* subpaths are not handled.
  - `IR-4`: Rewritten import, export, dynamic-import and require specifiers are reprinted with double quotes, whatever the file's quote style.
  - `IR-6`: export * as C from 'cmdk' is rewritten to modern-cmdk/react with no report, so the re-exported namespace silently loses CommandRoot and defaultFilter and a consumer's C.CommandRoot breaks, while bare export * from 'cmdk' is reported for the same loss (W2-03b). Filed by the wave-2 ledger judge at ffe6bb1.
  - `SF-1`: shouldFilter={expr} becomes filter={expr}, but modern-cmdk's filter accepts only a function, false or undefined, so a boolean that can be true fails type-checking.
  - `SF-2`: cmdk's filter prop signature (value, search, keywords) => number differs from modern-cmdk's (item, query) => number|false. An element carrying both shouldFilter={false} and filter={fn} ends up with duplicate filter attributes, and custom filters are not adapted.
  - `SEC-31`: Renames shouldFilter on every JSX element, not only on Command components as the header says.
  - `ARCH-11`: The migration keeps cmdk's filter(value, search, keywords) signature, but modern-cmdk calls filter(item, query), so a migrated filter throws. cmdk's onSelect(value) argument is also not provided. (the filter half, fixed by the should-filter adapter above; under LD-05 `Command.Item`'s `onSelect` still receives no argument in 1.x, and the value arrives in 2.0)
  - `RP-18`: All transforms call root.toSource() with recast defaults: on Windows every touched file is converted LF to CRLF (whole-file diff) and quotes flip to double.
  
  Already fixed in the `modern-cmdk` 1.3.0 bin (4d82ee3, ad79e71) and part of this package from its first release:
  
  - `CLI-2`: --concurrency=0 hangs forever: chunked() never advances i. --concurrency=abc (NaN) processes zero files silently.
  - `CLI-5`: Transform failures lose their file path ('(unknown)') and are never reported. The codemod exits 0 silently even when every file fails to parse.
  - `RP-15`: --concurrency=0 hangs forever; --concurrency=abc processes zero files and exits 0.
  - `SEC-10`: --concurrency is not validated. 0 or a negative value loops forever on empty batches; a non-numeric value gives NaN, processes no files and exits 0 (CWE-835/CWE-1284).
  - `SEC-48`: cli.ts drops the path of failed files, has a dead promise, a strip that never matches on Windows, and gutted reporting. printUsage and the report loops are empty, so failures print nothing and the CLI exits 0.
  - `SEC-49`: Only the comment is wrong: L27 says Set.union, which the code does not use. Setting cooked = raw is harmless because recast prints raw.
  
  Notes on the labels of the files-discovery rows: modern-cmdk keeps globby 16's behaviour for an explicit pattern through a symlink (the test labelled 'roadmap call :236'); on win32 the deprecated bin matches file names case-insensitively where globby 16 matched case-sensitively (changed, pinned difference: test CLI-10, SEC-29 roadmap call :236 win32 case); under the deprecated bin, `--force` and `--lenient` are known options and no longer warn as unknown (changed), and `-v` or `--version` beside both positionals prints the version and runs nothing where 1.4 warned "unknown option -v ignored" and ran (changed: CLI-ARGS contract). The help text now states 'A strict run without --dry-run refuses to write ...' so `--lenient` no longer contradicts it.
