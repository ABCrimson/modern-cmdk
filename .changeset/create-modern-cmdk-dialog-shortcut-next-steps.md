---
"create-modern-cmdk": patch
---

The `react-dialog` template now does what its text says, the scaffolder prints the next commands for the package manager that ran it, and the README and the package page describe what the scaffolder writes.

**Fixed**

- The `react-dialog` template opens and closes on `Mod+K`, which is <kbd>Cmd+K</kbd> on Apple platforms and <kbd>Ctrl+K</kbd> elsewhere. Before, either <kbd>Cmd+K</kbd> or <kbd>Ctrl+K</kbd> worked on every platform, while the README and the CLI's text named one key per platform. It is built on `parseShortcut` and `matchesShortcut` from `modern-cmdk`, with an `AbortController` listener, and the hint under the heading is a `Command.Shortcut` that shows the key of the platform.

**Changed**

- The next steps print `npm install` and `npm run dev`, `pnpm install` and `pnpm dev`, `yarn` and `yarn dev`, or `bun install` and `bun run dev`, from the package manager named in `npm_config_user_agent`. Before, they always printed the pnpm commands. Any other agent, or none, gets npm.
- `--help` describes the `react-dialog` shortcut as `Mod+K (Cmd+K on Apple platforms, Ctrl+K elsewhere)`.
- The README, `description`, `keywords` and `homepage` are rewritten to match what the scaffolder writes and prints.
