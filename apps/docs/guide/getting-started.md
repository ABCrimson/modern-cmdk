# Getting Started

`modern-cmdk` is a headless command palette engine with a framework-agnostic core and a React 19 adapter.

## What is it?

A ground-up reimagination of `cmdk` (pacocoursey/cmdk) built for 2026:

- **Framework-agnostic core** — Pure TypeScript state machine, zero dependencies
- **React 19 adapter** — Leverages `useTransition`, `useOptimistic`, `useEffectEvent`, React Compiler
- **ES2026 throughout** — Iterator Helpers, Set methods, `using`/`await using`, `Temporal`, `Promise.try`
- **GPU-composited animations** — `@starting-style`, View Transitions, `scroll-timeline`
- **Full WAI-ARIA** — Combobox pattern, live regions, `forced-colors`, `prefers-contrast`

## Architecture

```
modern-cmdk (core)
├── State Machine (pure TS)
├── Search Engine (pluggable, WASM optional)
├── Frecency Engine (Temporal-based)
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
