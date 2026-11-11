---
'modern-cmdk-codemod': patch
'modern-cmdk': patch
---

`modern-cmdk-codemod --help` now lists the transforms in the order to run them, numbered, with `import-rewrite` last, and the package README, description and keywords match what the tool does. Nothing in how a transform rewrites code changes. The deprecated `modern-cmdk` bin is built from the same source and prints the same help.

**Changed**

- `--help` numbers the four transforms in run order (`should-filter`, `forward-ref`, `data-attrs`, `import-rewrite`) under the heading "Transforms, in the order to run them (one per run):". The unknown-transform error lists them in the same order.
- `--help` lists the options in the order of the README table, says once that `--dry-run` prints a unified diff of every file that would change (the separate line that repeated it is gone), and states `--lenient` in one shorter line.
- The README of `modern-cmdk-codemod` is rewritten: the order to run the transforms, one before-and-after diff per transform taken from the test fixtures, the options and exit codes as tables, and the summary line (`, N skipped`, `, N reported` and ` (dry run, nothing written)`) explained. The description, homepage and keywords of the package are updated.
