---
"modern-cmdk-codemod": patch
---

`modern-cmdk-codemod --help` now lists the transforms in the order to run them, numbered, with `import-rewrite` last, and the package README, description and keywords match what the tool does. Nothing in how a transform rewrites code changes.

**Changed**

- `--help` numbers the four transforms in run order (`should-filter`, `forward-ref`, `data-attrs`, `import-rewrite`) under the heading "Transforms, in the order to run them (one per run):". The unknown-transform error lists them in the same order.
- `--help` lists the options in the order of the README table, says once that `--dry-run` prints a unified diff of every file that would change (the separate line that repeated it is gone), and states `--lenient` in one shorter line.
- The README is rewritten: the order to run the transforms, one before-and-after diff per transform taken from the test fixtures, the options and exit codes as tables, and the summary line (`, N skipped`, `, N reported` and ` (dry run, nothing written)`) explained.
- The `description` and `keywords` fields are updated, and the `homepage` field points to the migration guide on the documentation site instead of the repository's README.

**Fixed**

- The `--help` text for the git check says what the check does: a strict run (the default; `--lenient` turns it off) without `--dry-run` or `--force` refuses to write when a matched file has uncommitted changes or lies outside the git work tree it runs in, or when git is missing.
