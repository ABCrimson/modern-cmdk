**Upgrade:** `npm install modern-cmdk@1.7.1` · **Breaking:** none · **Deprecated:** none new

modern-cmdk 1.7.1 improves what you read about the package: editor hover text, the npm page and three messages. Nothing changes in how the palette behaves.

### Before you upgrade

- Three messages are reworded. The error for a part used outside the palette reads `must be used within <Command> or <Command.Dialog>`, the frecency save warning reads `[modern-cmdk] frecency save failed:`, and the deprecation warning of the `modern-cmdk` bin no longer names a version. A test that matches the old text needs the new text.

### Highlights

- Hovering `Command`, its parts and their props in your editor shows a description in more places. [React API](https://abcrimson.github.io/modern-cmdk/api/command-react.html)
- The README Quick start now binds its shortcut on the item, and the dialog sample opens with `Mod+K` even when Caps Lock is on. [Shortcuts](https://abcrimson.github.io/modern-cmdk/guide/shortcuts.html)
- The npm page is rewritten, and the package description, homepage and keywords say what the package is. [npm](https://www.npmjs.com/package/modern-cmdk)
- The deprecated `modern-cmdk` bin lists the migration transforms in the order to run them. [Migration from cmdk](https://abcrimson.github.io/modern-cmdk/guide/migration-from-cmdk.html)
