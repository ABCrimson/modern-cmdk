import { defineConfig } from 'tsdown';

// The packages from node_modules that dist/codemod bundles (tsdown 0.23.7 listed them as "Detected dependencies in bundle"):
// jscodeshift and the parts of its closure it reaches at run time. The dependency-free @babel/parser, flow-parser and
// flow-estree are inlined parsers; @babel/core and its tree are not reached (tests/package/license-policy.json).
// Changing this list requires regenerating packages/modern-cmdk/THIRD-PARTY-NOTICES.md with node scripts/third-party-notices.ts,
// which fails when the packages found in dist/codemod differ from it.
const BUNDLED_FOR_CODEMOD: string[] = [
  '@babel/parser',
  'ast-types',
  'esprima',
  'flow-estree',
  'flow-parser',
  'jscodeshift',
  'recast',
  'source-map',
  'tiny-invariant',
  'tslib',
];

export default defineConfig([
  // Core entry — no banner needed (pure TS, no React)
  {
    entry: { 'core/index': 'src/core/index.ts' },
    format: 'esm',
    dts: true,
  },
  // React entry — the banner below is the only 'use client' in the package, for RSC bundler compatibility; the src/react modules carry none,
  // because rolldown drops a bundled module's directive and warns MODULE_LEVEL_DIRECTIVE for each one;
  // The stylesheet is not a tsdown output: scripts/build-styles.ts builds src/react/styles.css
  // into dist/react/styles.css (package.json ./styles.css export) after tsdown, whose clean
  // empties dist first.
  // Two entries in ONE config: react/index (modern-cmdk/react) and react/dialog (modern-cmdk/react/dialog,
  // src/react/dialog.tsx, whose exports are exactly CommandDialog and CommandDialogProps). Sharing one
  // build lets rolldown emit the code both entries use (context, hooks, CommandDialog with its radix-ui import, which stays external) as shared chunks in
  // dist/react instead of a second copy; hash: false and chunkFileNames keep those chunks in dist/react/chunk-*.mjs
  // (rolldown's default puts a chunk at the outDir root) with stable names across builds. The banner is a per-output option, so every chunk carries 'use client'.
  // One core: src/react imports the core as 'modern-cmdk'. tsdown externalizes dependencies and
  // peers but never the package's own name, so deps.neverBundle (tsdown 0.23.7, DepsConfig) lists
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
    banner: {
      js: "'use client';",
    },
  },
  // The deprecated `modern-cmdk` bin: dist/codemod/bin.mjs is a shim (src/codemod/bin.ts) over dist/codemod/cli.mjs, which
  // bundles the CLI, the worker and the transforms of the sibling package modern-cmdk-codemod, built from its src (never from
  // that package's dist, whose files import jscodeshift as an undeclared dependency here) and jscodeshift with its
  // recast/babel tree, so modern-cmdk has no runtime dependency on the new package or on jscodeshift. The bundle leaves in 2.0
  // (PKG-1). dts is off, written out: package.json's "types" field would auto-enable it, and the codemod is a CLI, not an importable API.
  // The bundled set is an explicit list (RP-28, tsdown 0.23.7 DepsConfig): deps.onlyBundle throws if a node_modules package outside it is
  // bundled, so a new dependency of the codemod fails this build until it is listed here and checked for its licence
  // (tests/package/license-policy.json). deps.onlyImport: [] lets the emitted files import node: builtins and nothing else.
  {
    entry: {
      bin: 'src/codemod/bin.ts',
      cli: '../modern-cmdk-codemod/src/cli.ts',
      worker: '../modern-cmdk-codemod/src/worker.ts',
      'transforms/data-attrs': '../modern-cmdk-codemod/src/transforms/data-attrs.ts',
      'transforms/forward-ref': '../modern-cmdk-codemod/src/transforms/forward-ref.ts',
      'transforms/import-rewrite': '../modern-cmdk-codemod/src/transforms/import-rewrite.ts',
      'transforms/should-filter': '../modern-cmdk-codemod/src/transforms/should-filter.ts',
    },
    format: 'esm',
    platform: 'node',
    dts: false,
    outDir: 'dist/codemod',
    hash: false,
    // bin.mjs imports cli.mjs, which starts worker.mjs as a worker thread, which loads transforms/<name>.mjs next to itself.
    // The entries share code (print-options, jscodeshift), so rolldown may emit chunks: keep them in dist/codemod.
    outputOptions: { chunkFileNames: 'chunk-[name].mjs' },
    deps: {
      alwaysBundle: ['jscodeshift'],
      onlyBundle: BUNDLED_FOR_CODEMOD,
      onlyImport: [],
    },
  },
]);
