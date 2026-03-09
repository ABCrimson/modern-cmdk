<p align="center">
  <img src="https://raw.githubusercontent.com/ABCrimson/modern-cmdk/main/.github/assets/logo.svg" width="80" alt="@crimson_dev/command-react" />
</p>

<h1 align="center">@crimson_dev/command-react</h1>

<p align="center">
  <strong>React 19 compound components for building command palettes</strong>
  <br />
  Headless &middot; Accessible &middot; Virtualized &middot; Composable
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@crimson_dev/command-react"><img src="https://img.shields.io/npm/v/@crimson_dev/command-react?style=flat-square&color=crimson" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/@crimson_dev/command-react"><img src="https://img.shields.io/npm/dm/@crimson_dev/command-react?style=flat-square" alt="downloads" /></a>
  <a href="https://bundlephobia.com/package/@crimson_dev/command-react"><img src="https://img.shields.io/bundlephobia/minzip/@crimson_dev/command-react?style=flat-square&label=gzip" alt="bundle size" /></a>
  <a href="https://github.com/ABCrimson/modern-cmdk/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@crimson_dev/command-react?style=flat-square" alt="license" /></a>
</p>

---

## What is this?

A complete command palette UI built on React 19 compound components. Drop-in replacement for `cmdk` with more features, better performance, and full TypeScript 6 support.

- **14 compound components** — `Command`, `Input`, `List`, `Item`, `Group`, `Empty`, `Loading`, `Separator`, `Dialog`, `Highlight`, `Shortcut`, `Badge`, `Page`, `AsyncItems`
- **React 19 native** — `use()`, `useOptimistic`, `useTransition`, `ref` as prop
- **`useSyncExternalStore`** — zero tearing, Concurrent Mode safe
- **Auto-virtualization** — switches on at 100+ items, GPU-composited scroll
- **Radix Dialog** — focus trap, portal, overlay, accessible by default
- **Full ARIA** — combobox pattern, live regions, keyboard navigation
- **Frecency ranking** — items you use often rise to the top
- **Match highlighting** — render exact match ranges in results

## Install

```bash
pnpm add @crimson_dev/command @crimson_dev/command-react
```

> Requires `react@>=19.0.0` and `react-dom@>=19.0.0`.

## Quick Start

### Inline palette

```tsx
import { Command } from '@crimson_dev/command-react';

function CommandPalette() {
  return (
    <Command label="Command menu">
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.Empty>No results found.</Command.Empty>

        <Command.Group heading="Actions">
          <Command.Item value="Copy" onSelect={() => copy()}>
            Copy
          </Command.Item>
          <Command.Item value="Paste" onSelect={() => paste()}>
            Paste
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Navigation">
          <Command.Item value="Go to Settings" keywords={['preferences']}>
            Settings
            <Command.Shortcut>Ctrl+,</Command.Shortcut>
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command>
  );
}
```

### Dialog (Ctrl+K)

```tsx
import { Command } from '@crimson_dev/command-react';
import { useState } from 'react';

function App() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open Command Palette</button>
      <Command.Dialog open={open} onOpenChange={setOpen}>
        <Command.Input placeholder="Type a command..." />
        <Command.List>
          <Command.Empty>Nothing found.</Command.Empty>
          <Command.Item value="New File" onSelect={() => createFile()}>
            New File
          </Command.Item>
        </Command.List>
      </Command.Dialog>
    </>
  );
}
```

### Async items with Suspense

```tsx
import { Command } from '@crimson_dev/command-react';

const fetchItems = fetch('/api/commands').then((r) => r.json());

function App() {
  return (
    <Command label="Command menu">
      <Command.Input placeholder="Search..." />
      <Command.List>
        <Command.AsyncItems items={fetchItems} fallback={<Command.Loading>Loading...</Command.Loading>}>
          {(items) => items.map((item) => (
            <Command.Item key={item.id} value={item.value} onSelect={item.onSelect}>
              {item.label}
            </Command.Item>
          ))}
        </Command.AsyncItems>
      </Command.List>
    </Command>
  );
}
```

## Components

| Component | Description |
|-----------|-------------|
| `<Command>` | Root — creates state machine, provides context |
| `<Command.Input>` | Search input — ARIA combobox, auto-filters items |
| `<Command.List>` | Scrollable list container — auto-virtualizes at 100+ items |
| `<Command.Item>` | Selectable item — keyboard nav, pointer tracking |
| `<Command.Group>` | Group with heading — items grouped visually |
| `<Command.Empty>` | Shown when no items match the filter |
| `<Command.Loading>` | Shown while async items are loading |
| `<Command.Separator>` | Visual divider between groups |
| `<Command.Dialog>` | Radix Dialog wrapper — portal, overlay, focus trap |
| `<Command.Highlight>` | Renders match ranges with `<mark>` tags |
| `<Command.Shortcut>` | Displays formatted keyboard shortcut |
| `<Command.Badge>` | Status badge for items |
| `<Command.Page>` | Multi-page navigation |
| `<Command.AsyncItems>` | Suspense-powered async item loading |

## Hooks

| Hook | Description |
|------|-------------|
| `useCommandState()` | Read full state or a selector slice |
| `useCommandState(s => s.search)` | Derived state — only re-renders on change |
| `useCommand(machine)` | Low-level: connect a machine to React |
| `useRegisterItem(value, opts)` | Imperatively register an item |
| `useRegisterGroup(heading, opts)` | Imperatively register a group |
| `useVirtualizer(opts)` | Standalone virtualizer hook |

## Styling

Import the optional base CSS or write your own:

```tsx
import '@crimson_dev/command-react/src/styles.css';
```

All components use `data-command-*` attributes for styling:

```css
[data-command-root] { /* root container */ }
[data-command-input] { /* search input */ }
[data-command-list] { /* scrollable list */ }
[data-command-item] { /* each item */ }
[data-command-item][data-active] { /* highlighted item */ }
[data-command-item][data-disabled] { /* disabled item */ }
[data-command-empty] { /* no results message */ }
[data-command-group] { /* group wrapper */ }
[data-command-separator] { /* divider line */ }
[data-command-dialog] { /* dialog content */ }
[data-command-overlay] { /* dialog backdrop */ }
```

## Migrating from cmdk

Use the automated codemod:

```bash
npx @crimson_dev/command-codemod --transform import-rewrite ./src
npx @crimson_dev/command-codemod --transform forward-ref ./src
npx @crimson_dev/command-codemod --transform data-attrs ./src
npx @crimson_dev/command-codemod --transform should-filter ./src
```

## Links

- [Documentation](https://github.com/ABCrimson/modern-cmdk)
- [Core Engine](https://www.npmjs.com/package/@crimson_dev/command)
- [Playground](https://github.com/ABCrimson/modern-cmdk/tree/main/apps/playground)

## License

MIT
