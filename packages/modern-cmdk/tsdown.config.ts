import { defineConfig } from 'tsdown';

export default defineConfig([
  // Core entry — no banner needed (pure TS, no React)
  {
    entry: { 'core/index': 'src/core/index.ts' },
    format: 'esm',
    dts: true,
  },
  // React entry — 'use client' banner for RSC bundler compatibility;
  // styles.css is copied to dist/react/styles.css (package.json ./styles.css export).
  // Two entries in ONE config: react/index (modern-cmdk/react) and react/dialog (modern-cmdk/react/dialog,
  // src/react/dialog.tsx, whose exports are exactly CommandDialog and CommandDialogProps). Sharing one
  // build lets rolldown emit the code both entries use (context, hooks, CommandDialog with its radix-ui import, which stays external) as shared chunks in
  // dist/react instead of a second copy; hash: false and chunkFileNames keep those chunks in dist/react/chunk-*.mjs
  // (rolldown's default puts a chunk at the outDir root) with stable names across builds. The banner is a per-output option, so every chunk carries 'use client'.
  // One core: src/react imports the core as 'modern-cmdk'. tsdown externalizes dependencies and
  // peers but never the package's own name, so deps.neverBundle (tsdown 0.23.5, DepsConfig) lists
  // it; it is matched as written (before tsconfig paths resolve it) for the JS and the dts build,
  // so dist/react/index.mjs and index.d.mts import 'modern-cmdk' (the exports map self-reference
  // in the repo, node_modules/modern-cmdk once installed) instead of inlining a second core.
  {
    entry: { 'react/index': 'src/react/index.ts', 'react/dialog': 'src/react/dialog.tsx' },
    format: 'esm',
    dts: true,
    hash: false,
    outputOptions: { chunkFileNames: 'react/chunk-[name].mjs' },
    deps: { neverBundle: ['modern-cmdk'] },
    copy: [{ from: 'src/react/styles.css', to: 'dist/react' }],
    banner: {
      js: "'use client';",
    },
  },
  // Codemod CLI + transforms — separate outDir, bundles jscodeshift/globby. dts is off, written out:
  // package.json's "types" field would auto-enable it, and the codemod is a CLI, not an importable API.
  {
    entry: {
      cli: 'src/codemod/cli.ts',
      'transforms/data-attrs': 'src/codemod/transforms/data-attrs.ts',
      'transforms/forward-ref': 'src/codemod/transforms/forward-ref.ts',
      'transforms/import-rewrite': 'src/codemod/transforms/import-rewrite.ts',
      'transforms/should-filter': 'src/codemod/transforms/should-filter.ts',
    },
    format: 'esm',
    dts: false,
    outDir: 'dist/codemod',
  },
]);
