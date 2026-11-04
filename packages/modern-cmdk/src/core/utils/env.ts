// packages/modern-cmdk/src/core/utils/env.ts
// Single home for the development-mode flag — one NODE_ENV check shared by core and React.
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
