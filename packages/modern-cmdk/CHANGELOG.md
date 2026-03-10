# modern-cmdk

## 1.0.2

### Patch Changes

- [`f5576bb`](https://github.com/ABCrimson/modern-cmdk/commit/f5576bb917e8d254aae20b419ea02dccfbcab7cd) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Performance: split React context to prevent all-item re-renders, O(1) filtered set lookup, single-pass index build, lazy iterators. Fix CSS sideEffects, invalid transform-origin, GPU will-change misuse. Fix broken docs examples and README links.

## 1.0.1

### Patch Changes

- [`f6a9294`](https://github.com/ABCrimson/modern-cmdk/commit/f6a9294d0f868b4848cfad40770f455f3745d56e) Thanks [@ABCrimson](https://github.com/ABCrimson)! - Fix lint issues, O(1) navigate lookup, error-resilient fuzzy scorer, and modernize branding

## 1.0.0

### Major Changes

- [`f00ac85`](https://github.com/ABCrimson/modern-cmdk/commit/f00ac85f23a9823234f507015c423d0aa066a12c) Thanks [@ABCrimson](https://github.com/ABCrimson)! - modern-cmdk 1.0.0 — consolidated package replacing @crimson_dev/command + @crimson_dev/command-react + @crimson_dev/command-codemod.

  ### Import paths

  - `import { createCommandMachine } from 'modern-cmdk'` — core engine
  - `import { Command } from 'modern-cmdk/react'` — React 19 adapter
  - `import 'modern-cmdk/styles.css'` — default styles
  - `npx modern-cmdk migrate <transform> <glob>` — codemods

  ### Highlights

  - Pure TypeScript state machine with zero DOM dependencies
  - 14 React 19 compound components with Radix UI Dialog
  - Built-in fuzzy search with incremental filtering
  - Frecency ranking with Temporal API
  - Keyboard shortcut registry
  - GPU-composited CSS animations
  - Full WAI-ARIA combobox pattern
  - Automatic virtualization at 100+ items
  - ES2026: Iterator Helpers, Set methods, Explicit Resource Management
