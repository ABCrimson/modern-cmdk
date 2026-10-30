---
'create-modern-cmdk': patch
---

Refresh the generated project template to current stable releases: `modern-cmdk` ^1.2.2, `react` and `react-dom` ^19.3.1, `vite` ^8.3.5, `@vitejs/plugin-react` ^6.1.2 and `typescript` ^7.0.2. Add `@types/react` and `@types/react-dom` (React ships no types, so `tsc --noEmit` failed without them) and `radix-ui` (the optional peer that `Command.Dialog` imports). Drop `isolatedDeclarations` from the generated `tsconfig.json`: TypeScript 7 rejects it without `declaration` or `composite` (TS5069), and an app project emits no declarations.
