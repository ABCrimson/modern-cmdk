// tests/dist/production-bundle.test.ts
// PERF-15, D105: the BUILT entries (packages/modern-cmdk/dist) bundled the way @size-limit/rolldown bundles them
// (rolldown, minify on, treeshake on, react and radix-ui external), once with `process.env.NODE_ENV` defined as
// "production" through `transform.define` and once without. The development guards compare `process.env.NODE_ENV`
// inline, so the production bundle folds the guarded branch and drops the strings inside it. Needs `pnpm build` first.
//
// `platform: 'neutral'` makes the define the only variable: on rolldown's default (browser) platform the minifier
// already treats `process.env.NODE_ENV` as "production" when `output.minify` is on (observed with rolldown 1.2.16:
// the unminified bundle keeps the leak warning, the minified one drops it), so a control without a define would
// lose the strings too.
//
// rolldown is not a root dependency: the file resolves the copy @size-limit/rolldown uses (14.3.0 depends on
// rolldown ^1.2.15), through @size-limit/preset-small-lib, so the test bundles with the measuring tool's own engine.
// `transform.define` is TransformOptions.define in node_modules/rolldown/dist/shared/define-config-*.d.mts.

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const distRoot: string = resolve(import.meta.dirname, '../../packages/modern-cmdk/dist');
const distBuilt: boolean =
  existsSync(join(distRoot, 'core/index.mjs')) &&
  existsSync(join(distRoot, 'react/index.mjs')) &&
  existsSync(join(distRoot, 'react/dialog.mjs'));

if (!distBuilt && process.env.CI) {
  // A silent pass would hide a missing build: fail the whole file loudly in CI.
  throw new Error(
    `${distRoot} is missing its core, react or dialog build: run pnpm build first (tests/dist needs the built package)`,
  );
}
if (!distBuilt) {
  // biome-ignore lint/suspicious/noConsole: tells the developer why this file is skipped
  console.warn(`[tests/dist] skipped: ${distRoot} is not built: run pnpm build first`);
}

/** The slice of rolldown's `build()` this file calls. */
interface RolldownBuild {
  readonly build: (options: {
    readonly input: string;
    readonly external?: RegExp;
    readonly platform: 'neutral';
    readonly treeshake: boolean;
    readonly write: false;
    readonly transform?: { readonly define: Readonly<Record<string, string>> };
    readonly output: { readonly minify: boolean };
    readonly onLog: (level: string, log: { readonly code?: string }) => void;
  }) => Promise<{
    readonly output: readonly { readonly type: string; readonly code?: string }[];
  }>;
}

/** Every development-only string a production bundle must not carry; one entry per guarded branch. */
const DEV_ONLY_STRINGS: readonly string[] = [
  // core/search/index.ts: the FinalizationRegistry leak warning
  'was garbage collected without being disposed',
  // react/hooks/use-devtools.ts: the global devtools registry key
  '__CRIMSON_COMMAND_DEVTOOLS__',
];

const ENTRIES: readonly {
  readonly name: string;
  readonly file: string;
  readonly needs: readonly string[];
}[] = [
  { name: 'dist/core/index.mjs', file: 'core/index.mjs', needs: DEV_ONLY_STRINGS.slice(0, 1) },
  { name: 'dist/react/index.mjs', file: 'react/index.mjs', needs: DEV_ONLY_STRINGS },
];

async function loadRolldown(): Promise<RolldownBuild> {
  const root = createRequire(import.meta.url);
  const preset = createRequire(root.resolve('@size-limit/preset-small-lib'));
  const sizeLimitRolldown = createRequire(preset.resolve('@size-limit/rolldown'));
  return (await import(pathToFileURL(sizeLimitRolldown.resolve('rolldown')).href)) as RolldownBuild;
}

/** Bundles one built entry with its own dependencies inlined, react and radix-ui external, minified. */
async function bundle(file: string, production: boolean): Promise<string> {
  const { build } = await loadRolldown();
  const result = await build({
    input: join(distRoot, file),
    external: /^(react|react-dom|radix-ui)($|\/)/u,
    platform: 'neutral',
    treeshake: true,
    write: false,
    ...(production ? { transform: { define: { 'process.env.NODE_ENV': '"production"' } } } : {}),
    output: { minify: true },
    onLog(_level: string, log: { readonly code?: string }): void {
      if (log.code === 'UNRESOLVED_IMPORT') throw new Error(`unresolved import in ${file}`);
    },
  });
  return result.output
    .map((chunk) => (chunk.type === 'chunk' ? (chunk.code ?? '') : ''))
    .join('\n');
}

describe.skipIf(!distBuilt)('built package: production bundle', () => {
  // Without the define the guards stay live: the control proves the strings are findable in each bundle.
  for (const entry of ENTRIES) {
    it(`control: the bundle of ${entry.name} without a define carries its development-only strings`, async () => {
      const code = await bundle(entry.file, false);
      for (const needle of entry.needs) expect(code, needle).toContain(needle);
    });
  }

  it('PERF-15: a production-defined bundle of the built dist carries none of the development-only strings', async () => {
    for (const entry of ENTRIES) {
      const code = await bundle(entry.file, true);
      for (const needle of DEV_ONLY_STRINGS)
        expect(code, `${entry.name}: ${needle}`).not.toContain(needle);
    }
    const dialog = await bundle('react/dialog.mjs', true);
    for (const needle of DEV_ONLY_STRINGS)
      expect(dialog, `dist/react/dialog.mjs: ${needle}`).not.toContain(needle);
  });
});
