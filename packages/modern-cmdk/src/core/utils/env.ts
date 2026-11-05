// packages/modern-cmdk/src/core/utils/env.ts
// The development-mode flag for core (core/search imports it). react/hooks/use-devtools.ts keeps its own
// copy of the same check so that dist/react imports nothing from core by path.
// Isolated declarations: explicit type annotation on the export

// Module-scoped declaration: core needs no @types/node, and nothing global leaks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/**
 * `true` unless `process.env.NODE_ENV` is `'production'`.
 *
 * Consumer bundlers (Vite, webpack, Next, esbuild) replace `process.env.NODE_ENV` statically,
 * so the dev-only branches guarded by this flag fold away in production builds. A browser
 * running the unbundled module throws a ReferenceError on the bare `process` reference;
 * the catch turns that into the production value (`false`), so dev-only code stays off.
 */
export const isDev: boolean = (() => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
})();
