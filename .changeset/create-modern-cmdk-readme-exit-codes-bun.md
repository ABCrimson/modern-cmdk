---
"create-modern-cmdk": patch
---

The README on the npm page fits a phone and names all four package managers. Nothing changes in what the scaffolder writes or prints.

**Changed**

- The Exit codes table fits a 390 px screen without scrolling sideways. Its last header reads `--strict` in place of "With `--strict`", and the exit `1` cell of that column reads "Only the collision and the failed write" in place of repeating `--no-overwrite`. A sentence under the table says which column is a run with `--strict` and which is a run without it.
- Requirements read "Node 26.4.0 or later; npm, pnpm, yarn or bun", because the next steps the scaffolder prints already cover bun.
