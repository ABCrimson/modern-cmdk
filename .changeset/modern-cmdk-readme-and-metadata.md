---
"modern-cmdk": patch
---

The npm page of `modern-cmdk` is rewritten, and its package description, homepage and keywords now say what the package is. No code changes: the library behaves exactly as in 1.7.0.

**Changed**

- The `description` field is the same one-sentence summary the README opens with, instead of a slogan that claimed more than anyone can measure.
- The `homepage` field points to the documentation site instead of the repository's README.
- The `keywords` list grows from 7 to 18 terms (`combobox`, `wai-aria`, `fuzzy-search`, `frecency`, `keyboard-shortcuts` and others), so the package turns up for what it does.
- The README opens with the project image and a one-line install, then a Quick start, a short feature list with a docs link for each, a dialog sample, a core sample that needs no React, the entry points and their options, the migration path from cmdk, the sizes with the record they come from, and the requirements (now including the TypeScript floor).

**Fixed**

- The Quick start binds its shortcut: the key goes on the `Command.Item` through `shortcut`, and `Command.Shortcut` only displays it. The old sample put `Command.Shortcut` inside items that had no `shortcut`, so Mod+C and Mod+V never fired.
- The dialog sample opens with `matchesShortcut(event, parseShortcut('Mod+K'))` and an `AbortController` listener, so it works with Caps Lock on. The old sample compared `event.key` to a lowercase `k`.
- The codemod example runs `should-filter` first, matching the order the text gives.
- The size table keeps the 1.7.0 record's gzip figures, says what was measured, and drops the release candidate's tarball totals and the commit hashes from the prose.
- The README no longer carries a repository-internal ledger id or a promise about a future version, and it links cmdk to its repository.
