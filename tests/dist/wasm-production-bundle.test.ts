// tests/dist/wasm-production-bundle.test.ts
// PERF-15: packages/command-search-wasm/src/index.ts bundled from source the way tests/dist/production-bundle.test.ts
// bundles the built modern-cmdk entries (rolldown from @size-limit/rolldown, minify on, treeshake on), once with
// `process.env.NODE_ENV` defined as "production" and once as "development". The wasm-bindgen output (`../pkg`, absent
// until `pnpm build:wasm`) and `modern-cmdk` stay external, so the bundle needs no build. Each development guard of the
// package is `dev && process.env.NODE_ENV !== 'production'` (src/env.ts), so the production define folds the guarded
// branch and drops the warning strings inside it, and the development define keeps them.
//
// `platform: 'neutral'` makes the define the only variable (see tests/dist/production-bundle.test.ts).
// `transform.define` is TransformOptions.define in node_modules/rolldown/dist/shared/define-config-*.d.mts.
//
// A third test runs the guard of src/env.ts without a define and without a `process` global, the way a browser
// loads it unbundled: the guard is false and throws nothing (see tests/dist/production-bundle.test.ts).

import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const entry: string = resolve(
  import.meta.dirname,
  '../../packages/command-search-wasm/src/index.ts',
);

/** The id of the virtual entry that imports the guard of src/env.ts; no file on disk holds it. */
const GUARD_ENTRY = 'virtual:wasm-guard-entry';

/** The slice of rolldown's `build()` this file calls. */
interface RolldownBuild {
  readonly build: (options: {
    readonly input: string;
    readonly external: RegExp;
    readonly platform: 'neutral';
    readonly treeshake: boolean;
    readonly write: false;
    readonly transform?: { readonly define: Readonly<Record<string, string>> };
    readonly plugins?: readonly {
      readonly name: string;
      readonly resolveId: (id: string) => string | undefined;
      readonly load: (id: string) => string | undefined;
    }[];
    readonly output: {
      readonly minify: boolean;
      readonly format?: 'iife';
      readonly name?: string;
    };
  }) => Promise<{
    readonly output: readonly { readonly type: string; readonly code?: string }[];
  }>;
}

/** Every development-only string of the wasm package; one entry per guarded `console.warn`. */
const DEV_ONLY_STRINGS: readonly string[] = [
  // wasm-engine.ts: the WASM load failure
  'falling back to TypeScript scorer',
  // worker-engine.ts: a detached request failure
  'search worker request failed',
  // worker-engine.ts: the Worker failure
  'falling back to the main thread',
];

async function loadRolldown(): Promise<RolldownBuild> {
  const root = createRequire(import.meta.url);
  const preset = createRequire(root.resolve('@size-limit/preset-small-lib'));
  const sizeLimitRolldown = createRequire(preset.resolve('@size-limit/rolldown'));
  return (await import(pathToFileURL(sizeLimitRolldown.resolve('rolldown')).href)) as RolldownBuild;
}

/** Bundles the package source, minified, with `../pkg` and `modern-cmdk` external. */
async function bundle(define: 'production' | 'development'): Promise<string> {
  const { build } = await loadRolldown();
  const result = await build({
    input: entry,
    external: /^(modern-cmdk$|\.\.\/pkg\/)/u,
    platform: 'neutral',
    treeshake: true,
    write: false,
    transform: { define: { 'process.env.NODE_ENV': JSON.stringify(define) } },
    output: { minify: true },
  });
  return result.output
    .map((chunk) => (chunk.type === 'chunk' ? (chunk.code ?? '') : ''))
    .join('\n');
}

/**
 * Bundles the guard of src/env.ts with no define, as an IIFE that `vm` can run. The virtual entry reads the guard the
 * way the package's own modules do and assigns it to a global.
 */
async function bundleGuard(): Promise<string> {
  const { build } = await loadRolldown();
  const envSource = resolve(import.meta.dirname, '../../packages/command-search-wasm/src/env.ts');
  const guardEntry = [
    `import { dev } from ${JSON.stringify(envSource)};`,
    "globalThis.__guard = () => dev && process.env.NODE_ENV !== 'production';",
  ].join('\n');
  const result = await build({
    input: GUARD_ENTRY,
    external: /^(modern-cmdk$|\.\.\/pkg\/)/u,
    platform: 'neutral',
    treeshake: true,
    write: false,
    plugins: [
      {
        name: 'wasm-guard-entry',
        resolveId: (id: string): string | undefined => (id === GUARD_ENTRY ? id : undefined),
        load: (id: string): string | undefined => (id === GUARD_ENTRY ? guardEntry : undefined),
      },
    ],
    output: { minify: true, format: 'iife' },
  });
  return result.output
    .map((chunk) => (chunk.type === 'chunk' ? (chunk.code ?? '') : ''))
    .join('\n');
}

/** A `vm` context with the given globals and no `process` global: a fresh context has none. */
function browserLikeContext(): Record<string, unknown> {
  const sandbox: Record<string, unknown> = {};
  createContext(sandbox);
  return sandbox;
}

describe('wasm package: production bundle', () => {
  it('PERF-15: a production-defined bundle of the wasm package carries none of its development-only strings', async () => {
    const code = await bundle('production');
    for (const needle of DEV_ONLY_STRINGS) expect(code, needle).not.toContain(needle);
  });

  it('PERF-15: a development-defined bundle of the wasm package keeps its development-only strings', async () => {
    const code = await bundle('development');
    for (const needle of DEV_ONLY_STRINGS) expect(code, needle).toContain(needle);
  });

  it('PERF-15: an unbundled wasm guard without a process global is false and does not throw', async () => {
    // The guard as shipped (no define), as an IIFE so that `vm` can run it: the bare `process.env.NODE_ENV` read sits
    // in env.ts's try/catch, so `dev` is false and the guard short-circuits before it reads `process`.
    const code = await bundleGuard();
    const context = browserLikeContext();
    expect('process' in context).toBe(false);
    runInContext(code, context);
    const guard = context.__guard as () => unknown;
    let value: unknown;
    expect(() => {
      value = guard();
    }).not.toThrow();
    expect(value).toBe(false);
  });
});
