import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'tsdown';

// create-modern-cmdk is bin-only: the package ships dist/index.mjs and nothing else (the manifest
// has no `types` or `exports`), so the build emits no declaration file and no sourcemap.
// `dts: false` must be explicit: tsconfig.base.json sets `declaration: true`, and tsdown 0.23
// enables dts generation from it when the option is absent (that index.d.mts was unreachable).
// `sourcemap: false` is tsdown's default, written out so the bin-only choice sits beside dts;
// tsdown would force sourcemaps on only if the tsconfig enabled `declarationMap`, which it does not.
// Stack traces point at the unminified dist/index.mjs itself (16.89 kB with the templates embedded, as tsdown 0.23.7 reports it).
// Other defaults relied on (tsdown 0.23 types): format 'esm', platform 'node', outDir 'dist',
// clean true, treeshake true.

/** The version of the modern-cmdk this build scaffolds, read once at build time. */
const { version: modernCmdkVersion } = JSON.parse(
  readFileSync(new URL('../modern-cmdk/package.json', import.meta.url), 'utf-8'),
) as { version: string };

// tsdown's `loader` option maps file extensions to module types, so it cannot single out the
// `?raw` query the sources use (Vite and Vitest resolve `?raw` natively); this plugin does the
// same for rolldown: the module is the file's text as the default export.
const RAW = /[?]raw$/;

export default defineConfig({
  entry: ['src/index.ts'],
  dts: false,
  sourcemap: false,
  target: 'esnext',
  minify: false,
  env: { MODERN_CMDK_VERSION: modernCmdkVersion },
  plugins: [
    {
      name: 'raw-query',
      resolveId: {
        filter: { id: RAW },
        handler(id: string, importer: string | undefined): string | null {
          return importer === undefined ? null : resolve(dirname(importer), id);
        },
      },
      load: {
        filter: { id: RAW },
        async handler(id: string): Promise<{ code: string; moduleType: 'js' }> {
          const text = await readFile(id.replace(RAW, ''), 'utf-8');
          return { code: `export default ${JSON.stringify(text)};`, moduleType: 'js' };
        },
      },
    },
  ],
});
