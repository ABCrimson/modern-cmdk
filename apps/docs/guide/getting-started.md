# Getting Started

`modern-cmdk` is a headless command palette engine with a framework-agnostic core and a React 19 adapter.

## What is it?

A ground-up reimagination of `cmdk` (pacocoursey/cmdk) built for 2026:

- **Framework-agnostic core** — Pure TypeScript state machine. No React. No hard DOM dependency; DOM APIs are feature-detected and SSR-safe
- **React 19 adapter** — Leverages `useTransition`, `useOptimistic`, `use()`, and the Activity API
- **Modern JavaScript** — Iterator Helpers (ES2025) in the search and registry code, and `Symbol.dispose`/`Symbol.asyncDispose` (ESNext explicit resource management) so the machine works with `using`
- **Modern CSS animations** — `@starting-style`, spring `linear()` easing, `scroll-timeline`; the dialog, overlay, page-enter, loading-pulse and list-edge animations change only opacity, scale and translate, while the overlay tint (`--command-overlay-opacity` in its `background`), the list height (`height`) and the item highlight (`background-color`) are not compositor-only, and until 1.8.0 the dialog and overlay ones run only once you set their tokens (see [Theming](/guide/theming#dialog-animations))
- **Full WAI-ARIA** — Combobox pattern, live regions, `forced-colors`, `prefers-contrast`

## Architecture

```
modern-cmdk (core)
├── State Machine (pure TS)
├── Search Engine (pluggable, WASM optional)
├── Frecency Engine (time-weighted)
├── Keyboard Registry
└── Command Registry

modern-cmdk/react (adapter)
├── Compound Components (Command.*)
├── Hooks (useCommand, useCommandState)
├── Virtualization (automatic)
└── Dialog (Radix-based)
```

## Next Steps

- [Installation](/guide/installation) — Add packages to your project
- [Basic Usage](/guide/basic-usage) — Build your first command palette
- [Migration from cmdk](/guide/migration-from-cmdk) — Upgrade from the original
