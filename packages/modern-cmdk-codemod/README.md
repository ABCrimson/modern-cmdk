# modern-cmdk-codemod

Codemods that migrate code written for [cmdk](https://github.com/dip/cmdk) to [modern-cmdk](https://www.npmjs.com/package/modern-cmdk).

```bash
npx modern-cmdk-codemod <transform> <glob|dir> [--dry-run]
```

Transforms: `import-rewrite`, `data-attrs`, `forward-ref`, `should-filter`.

`modern-cmdk-codemod` is strict by default: a usage error (an unknown or malformed option, an unknown transform) exits `2`, a file that fails or a run that matches no file exits `1`, success exits `0`. A run without `--dry-run` refuses to write into a git tree with uncommitted changes unless `--force` is given. Run `npx modern-cmdk-codemod --help` for every option and exit code.

It replaces the `modern-cmdk` bin, which is deprecated and leaves in modern-cmdk 2.0.

Requires Node >= 26.4.0.
