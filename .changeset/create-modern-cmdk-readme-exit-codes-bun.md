---
"create-modern-cmdk": patch
---

The README on the npm page fits a phone and names all four package managers. Nothing changes in what the scaffolder writes or prints.

**Changed**

- The Exit codes table fits a 360 px screen without scrolling sideways. Its last header reads "Strict" in place of "With `--strict`", and a sentence under the table says that the Default column is a run without `--strict` and the Strict column a run with it.
- In the exit `1` row, the Default cell reads "a collision, a file-system error" in place of "a `--no-overwrite` collision, a failed write", and the Strict cell reads "Only the collision and a file-system error". The sentence under the table says that a collision is a run with `--no-overwrite` that finds a file it would write. The scaffolder exits `1` for a failed directory, a failed check of the target and a failed write alike, and all three are file-system errors.
- Requirements read "Node 26.4.0 or later; npm, pnpm, yarn or bun", because the next steps the scaffolder prints already cover bun.
