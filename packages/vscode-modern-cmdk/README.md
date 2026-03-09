<h1 align="center">Modern CMDK</h1>

<p align="center">
  <strong>VS Code snippets for <code>modern-cmdk/react</code></strong>
</p>

<p align="center">
  <a href="https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/modern-cmdk?style=flat-square&color=dc2626&labelColor=0a0e27" alt="license" /></a>
</p>

---

## What is this?

A VS Code extension that provides snippets for building command palettes with `modern-cmdk/react`. Works in `.tsx` and `.jsx` files.

## Snippets

| Prefix | Description |
|--------|-------------|
| `cmd-basic` | Basic inline command palette |
| `cmd-dialog` | Command palette in a dialog overlay |
| `cmd-item` | Single command item |
| `cmd-group` | Item group with heading |
| `cmd-shortcut` | Item with keyboard shortcut |
| `cmd-frecency` | Palette with frecency ranking |
| `cmd-async` | Async items with Suspense |
| `cmd-page` | Multi-page navigation |
| `cmd-machine` | Core state machine (framework-agnostic) |
| `cmd-hook` | `useCommand` hook |
| `cmd-wasm` | WASM-powered fuzzy search |
| `cmd-component-ref` | Wrapper component with ref (React 19) |
| `cmd-use` | `use()` for async data (React 19) |
| `cmd-optimistic` | `useOptimistic` pattern (React 19) |
| `cmd-action` | `useActionState` pattern (React 19) |

## Install

### From VS Code Marketplace

Search for **Modern CMDK** in the Extensions panel, or:

```
ext install crimson-dev.vscode-modern-cmdk
```

### From source

```bash
cd packages/vscode-modern-cmdk
npx vsce package
code --install-extension vscode-modern-cmdk-1.0.0.vsix
```

## Usage

Type any prefix (e.g., `cmd-dialog`) in a `.tsx` or `.jsx` file and press Tab to expand.

### Example: `cmd-dialog`

```tsx
import { Command } from 'modern-cmdk/react';

function CommandDialog() {
  return (
    <Command.Dialog>
      <Command.Input placeholder="Search commands..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>
        {/* cursor here */}
      </Command.List>
    </Command.Dialog>
  );
}
```

## Links

- [modern-cmdk on npm](https://www.npmjs.com/package/modern-cmdk)
- [Documentation](https://command.crimson.dev)
- [GitHub](https://github.com/ABCrimson/modern-cmdk)

## License

[MIT](https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE)
