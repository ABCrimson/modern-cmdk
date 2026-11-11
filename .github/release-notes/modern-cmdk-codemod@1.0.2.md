**Run:** `npx modern-cmdk-codemod@1.0.2 --dry-run should-filter ./src` · **Breaking:** none · **Deprecated:** none new

modern-cmdk-codemod 1.0.2 tells you in `--help` and in the README the order to run the four transforms. Nothing in how a transform rewrites code changes.

### Before you upgrade

- Nothing to do.

### Highlights

- `--help` numbers the transforms in the order to run them, with `import-rewrite` last. [Migration from cmdk](https://abcrimson.github.io/modern-cmdk/guide/migration-from-cmdk.html)
- The `--help` text for the git check says that a strict run (the default; `--lenient` turns it off) without `--dry-run` or `--force` refuses to write when a matched file has uncommitted changes or lies outside the git work tree it runs in, or when git is missing. [npm](https://www.npmjs.com/package/modern-cmdk-codemod)
- The README shows one before-and-after diff per transform and tables of the options and exit codes. [npm](https://www.npmjs.com/package/modern-cmdk-codemod)
- The package homepage now points to the migration guide. [Migration from cmdk](https://abcrimson.github.io/modern-cmdk/guide/migration-from-cmdk.html)
