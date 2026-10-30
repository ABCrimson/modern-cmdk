---
'modern-cmdk': patch
---

Republish built with the current toolchain (TypeScript 7.1, tsdown 0.23.4 with oxc declaration emit). The `core` and `react` entry points are runtime- and type-identical to the previous build apart from comments; the bundled codemod CLI (`dist/codemod/cli.mjs`) picks up newer versions of its bundled dependencies (glob matching and file-walking helpers).
