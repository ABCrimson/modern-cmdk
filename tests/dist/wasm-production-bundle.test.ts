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

import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const entry: string = resolve(
  import.meta.dirname,
  '../../packages/command-search-wasm/src/index.ts',
);

/** The slice of rolldown's `build()` this file calls. */
interface RolldownBuild {
  readonly build: (options: {
    readonly input: string;
    readonly external: RegExp;
    readonly platform: 'neutral';
    readonly treeshake: boolean;
    readonly write: false;
    readonly transform: { readonly define: Readonly<Record<string, string>> };
    readonly output: { readonly minify: boolean };
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

describe('wasm package: production bundle', () => {
  it('PERF-15: a production-defined bundle of the wasm package carries none of its development-only strings', async () => {
    const code = await bundle('production');
    for (const needle of DEV_ONLY_STRINGS) expect(code, needle).not.toContain(needle);
  });

  it('PERF-15: a development-defined bundle of the wasm package keeps its development-only strings', async () => {
    const code = await bundle('development');
    for (const needle of DEV_ONLY_STRINGS) expect(code, needle).toContain(needle);
  });
});
