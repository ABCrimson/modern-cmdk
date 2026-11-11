<h1 align="center">vscode-modern-cmdk</h1>

<p align="center"><strong>VS Code snippets for modern-cmdk</strong></p>

<p align="center">Private: build and install it from source. It is not on the VS Code Marketplace or Open VSX, and the <code>vscode-modern-cmdk</code> 1.0.0 on npm was published by mistake.</p>

## What is this?

A VS Code extension that provides snippets for building command palettes with `modern-cmdk/react`. Fourteen snippets work in `.tsx` and `.jsx` files; `cmd-machine`, the framework-agnostic core, also works in `.ts` and `.js` files. Snippets that use TypeScript-only syntax ship a plain JavaScript form for `.jsx`.

## Snippets

| Prefix | Description | Languages |
|--------|-------------|-----------|
| `cmd-basic` | Basic inline command palette | `.tsx`, `.jsx` |
| `cmd-dialog` | Command palette in a dialog overlay, toggled with Cmd/Ctrl+K | `.tsx`, `.jsx` |
| `cmd-item` | Command palette item | `.tsx`, `.jsx` |
| `cmd-group` | Command palette group | `.tsx`, `.jsx` |
| `cmd-shortcut` | Command item that binds a shortcut and shows it per platform | `.tsx`, `.jsx` |
| `cmd-frecency` | Command palette with frecency ranking | `.tsx`, `.jsx` |
| `cmd-async` | Async items resolved from a promise, with a loading fallback | `.tsx`, `.jsx` |
| `cmd-page` | Command palette page (nested navigation) | `.tsx`, `.jsx` |
| `cmd-hook` | `useCommand` hook for headless usage | `.tsx`, `.jsx` |
| `cmd-machine` | Core state machine (framework-agnostic) with an explicit teardown | `.ts`, `.js`, `.tsx`, `.jsx` |
| `cmd-component-ref` | Wrapper component with `ref` as a prop (React 19, no `forwardRef`) | `.tsx`, `.jsx` |
| `cmd-use` | React 19 `use()` to read promises | `.tsx`, `.jsx` |
| `cmd-optimistic` | React 19 `useOptimistic`: the selected item shows as pending while it is saved | `.tsx`, `.jsx` |
| `cmd-action` | React 19 `useActionState` | `.tsx`, `.jsx` |

The four React 19 snippets (`cmd-component-ref`, `cmd-use`, `cmd-optimistic`, `cmd-action`) are contributed twice: a TypeScript form for `.tsx` (`src/snippets-tsx.json`) and a plain JavaScript form for `.jsx` (`src/snippets-jsx.json`). The WASM snippet `cmd-wasm` was removed, because the experimental `modern-cmdk-search-wasm` is not functional.

## Install

The extension is not on the VS Code Marketplace; install it from source.

### From source

```bash
pnpm --filter vscode-modern-cmdk run package
code --install-extension packages/vscode-modern-cmdk/vscode-modern-cmdk-1.0.0.vsix
```

## Usage

Type any prefix (e.g., `cmd-dialog`) in a `.tsx` or `.jsx` file (`cmd-machine` also in `.ts` and `.js`) and press Tab to expand.

### Example: `cmd-dialog`

The expanded body with every placeholder at its default (the dialog opens with Cmd+K or Ctrl+K; the empty line inside `Command.List` is where the cursor lands to add items):

```tsx
import { useEffect, useState } from 'react';
import { Command } from 'modern-cmdk/react';

function CommandDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    document.addEventListener(
      'keydown',
      (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          setOpen((current) => !current);
        }
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, []);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command menu">
      <Command.Input placeholder="Search commands..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>
        
      </Command.List>
    </Command.Dialog>
  );
}
```

## Links

- [modern-cmdk on npm](https://www.npmjs.com/package/modern-cmdk)
- [Documentation](https://abcrimson.github.io/modern-cmdk/)
- [GitHub](https://github.com/ABCrimson/modern-cmdk)

## License

[MIT](https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE)
