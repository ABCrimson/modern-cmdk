---
"modern-cmdk": patch
---

Hovering over `Command`, its parts and their props in your editor now shows a description in more places, and three messages are reworded: the error for a part used outside the palette, the frecency save warning and the deprecated bin's warning. The npm page, the package description, the homepage and the keywords are rewritten, and the deprecated `modern-cmdk` bin's `--help` lists the transforms in the order to run them. Nothing changes in how the palette behaves.

**Changed**

- Hovering `ItemId` or `GroupId` shows its description; it used to show nothing.
- Hovering `Command` shows what it is and lists its parts (`Command.Input`, `Command.List`, `Command.Item` and the rest) in place of a note about bundlers.
- `value`, `keywords`, `disabled` and `shortcut` on `Command.Item` have a description, and so do the props of `Command.Dialog`, `Command.List`, `Command.Input` and most of the other parts; what `useCommand` returns; the options and rows of `useVirtualizer`; `TelemetryMiddleware`; and the machine's `getState`, `send`, `getRegistry` and `getKeyboardRegistry`.
- The error for a part used outside the palette now names both `<Command>` and `<Command.Dialog>`.
- The frecency save warning reads `[modern-cmdk] frecency save failed:`, like the load warning.
- The `modern-cmdk` bin's deprecation warning says that the bin is deprecated and points to `npx modern-cmdk-codemod`, without naming a version.
- The `modern-cmdk` bin is built from the source of `modern-cmdk-codemod`, so its `--help` numbers the four transforms in run order (`should-filter`, `forward-ref`, `data-attrs`, `import-rewrite`), lists the options in the order of the `modern-cmdk-codemod` README table, and says once that `--dry-run` prints a unified diff of every file that would change. Its unknown-transform error lists the transforms in the same order.
- The `description` field is the same one-sentence summary the README opens with, instead of a slogan that claimed more than anyone can measure.
- The `homepage` field points to the documentation site instead of the repository's README.
- The `keywords` list grows from 7 to 18 terms (`combobox`, `wai-aria`, `fuzzy-search`, `frecency`, `keyboard-shortcuts` and others), so the package turns up for what it does.
- The README opens with the project image and a one-line install, then a Quick start, a short feature list with a docs link for each, a dialog sample, a core sample that needs no React, the entry points and their options, the migration path from cmdk, the sizes with the record they come from, and the requirements (now including the TypeScript floor).

**Fixed**

- The Quick start binds its shortcut: the key goes on the `Command.Item` through `shortcut`, and `Command.Shortcut` only displays it. The old sample put `Command.Shortcut` inside items that had no `shortcut`, so Mod+C and Mod+V never fired.
- The dialog sample matches the key with `matchesShortcut(event, parseShortcut('Mod+K'))`, so it works with Caps Lock on, and removes its listener through an `AbortController`. The old sample compared `event.key` to a lowercase `k`.
- The codemod example runs `should-filter` first, matching the order the text gives.
- The size table keeps the 1.7.0 record's gzip figures, says what was measured, and drops the release candidate's tarball totals and the commit hashes from the prose.
- The README no longer carries a repository-internal ledger id or a promise about a future version, and it links cmdk to its repository.

A test of yours that matches the old error or warning text needs the new text.
