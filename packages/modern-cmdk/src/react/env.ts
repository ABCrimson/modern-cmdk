// packages/modern-cmdk/src/react/env.ts
// The development flag of this package region: an unbundled-import-safe read of `process.env.NODE_ENV`.
// Isolated declarations: explicit type annotation on the export

// Module-scoped declaration: no @types/node needed, and nothing global leaks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/**
 * `true` unless `process.env.NODE_ENV` is `'production'`; `false` where `process` does not exist.
 *
 * Every development branch is guarded as `dev && process.env.NODE_ENV !== 'production'`:
 * - Unbundled browser import: no bundler replaced the expression and there is no `process`, so the read throws, the
 *   catch makes `dev` `false`, and the first operand short-circuits before the bare `process` at the use site.
 * - Development bundle (Vite's dev server defines `process.env.NODE_ENV` as `"development"`, still without a
 *   `process` global): both operands are `true`.
 * - Production bundle: the define turns the use site into `dev && false`, which the minifier folds. A `const`
 *   read has no side effect, so the `@__PURE__`-marked call is then unused and the minifier drops it with its
 *   branch. The comparison repeats at the use site because a flag alone is a runtime value the minifier cannot fold.
 */
export const dev: boolean = /* @__PURE__ */ (() => {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
})();
