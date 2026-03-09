---
"modern-cmdk": major
"create-modern-cmdk": major
---

modern-cmdk 1.0.0 — consolidated package replacing @crimson_dev/command + @crimson_dev/command-react + @crimson_dev/command-codemod.

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
