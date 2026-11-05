import { defineConfig } from 'tsdown';

// create-modern-cmdk is bin-only: the package ships dist/index.mjs and nothing else (the manifest
// has no `types` or `exports`), so the build emits no declaration file and no sourcemap.
// `dts: false` must be explicit: tsconfig.base.json sets `declaration: true`, and tsdown 0.23
// enables dts generation from it when the option is absent (that index.d.mts was unreachable).
// `sourcemap: false` is tsdown's default, written out so the bin-only choice sits beside dts;
// tsdown would force sourcemaps on only if the tsconfig enabled `declarationMap`, which it does not.
// Stack traces point at the unminified ~9 kB dist/index.mjs itself.
// Other defaults relied on (tsdown 0.23 types): format 'esm', platform 'node', outDir 'dist',
// clean true, treeshake true.
export default defineConfig({
  entry: ['src/index.ts'],
  dts: false,
  sourcemap: false,
  target: 'esnext',
  minify: false,
});
