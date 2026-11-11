---
"modern-cmdk": patch
---

Hovering over the exports in your editor now shows an accurate description, and the warnings and errors that name a problem read the same way. Nothing changes in how the palette behaves.

### Changed

- Hovering `ItemId` or `GroupId` shows its description; it used to show nothing.
- Hovering `Command` shows what it is and lists its parts (`Command.Input`, `Command.List`, `Command.Item` and the rest) in place of a note about bundlers.
- `value`, `keywords`, `disabled` and `shortcut` on `Command.Item` have a description, and so do the props of `Command.Dialog`, `Command.List`, `Command.Input` and the other parts, `useCommand`, `useVirtualizer`, the telemetry hooks and the machine's `getState`, `send`, `getRegistry` and `getKeyboardRegistry`.
- The error for a part used outside the palette now names both `<Command>` and `<Command.Dialog>`.
- The frecency save warning reads `[modern-cmdk] frecency save failed:`, like the load warning.
- The `modern-cmdk` bin's deprecation warning says that the bin is deprecated and points to `npx modern-cmdk-codemod`, without naming a version.
