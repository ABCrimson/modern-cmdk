import { defineConfig } from 'tsdown';

// modern-cmdk-codemod is bin-only: dist/cli.mjs is the bin, dist/worker.mjs the worker thread it starts, and
// dist/transforms/<name>.mjs the transforms it loads next to itself; the manifest has no `exports` or `types`.
// `dts: false` must be explicit: tsconfig.base.json sets `declaration: true`, and tsdown 0.23 enables dts
// generation from it when the option is absent.
// Only this package's own src is bundled. jscodeshift is a dependency, so it stays external and npm installs it.
// deps.onlyBundle: [] throws if anything from node_modules is bundled, and deps.onlyImport allows the emitted
// files to import jscodeshift (and node: builtins, always allowed on platform 'node') and nothing else, so a
// stray bare import, or a dependency added without a manifest entry, fails the build (tsdown 0.23.7, DepsConfig).
// The entries share code (print-options, the jscodeshift import in worker), so rolldown may emit chunks:
// hash: false and chunkFileNames keep them in dist as chunk-<name>.mjs with stable names.
export default defineConfig({
  entry: {
    cli: 'src/cli.ts',
    worker: 'src/worker.ts',
    'transforms/data-attrs': 'src/transforms/data-attrs.ts',
    'transforms/forward-ref': 'src/transforms/forward-ref.ts',
    'transforms/import-rewrite': 'src/transforms/import-rewrite.ts',
    'transforms/should-filter': 'src/transforms/should-filter.ts',
  },
  format: 'esm',
  platform: 'node',
  dts: false,
  hash: false,
  outputOptions: { chunkFileNames: 'chunk-[name].mjs' },
  deps: {
    neverBundle: ['jscodeshift'],
    onlyBundle: [],
    onlyImport: ['jscodeshift'],
  },
});
