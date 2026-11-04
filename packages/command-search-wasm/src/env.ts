// packages/command-search-wasm/src/env.ts
// Development-mode flag for this package — the same pattern as modern-cmdk's core/utils/env.ts.
// Isolated declarations: explicit type annotation on the export

// Module-scoped declaration: no @types/node needed, and nothing global leaks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/**
 * `true` unless `process.env.NODE_ENV` is `'production'`.
 *
 * The check stays a literal `process.env.NODE_ENV` expression in the built output, so a consumer
 * bundler (Vite, webpack, Next, esbuild) replaces it statically and the dev-only branches fold
 * away in production. A browser running the unbundled module throws a ReferenceError on the bare
 * `process` reference; the catch turns that into the production value (`false`).
 */
export const isDev: boolean = (() => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
})();
