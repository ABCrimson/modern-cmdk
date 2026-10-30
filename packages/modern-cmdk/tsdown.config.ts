import { defineConfig } from 'tsdown';

export default defineConfig([
  // Core entry — no banner needed (pure TS, no React)
  {
    entry: { 'core/index': 'src/core/index.ts' },
    format: 'esm',
    dts: { generator: 'oxc' },
  },
  // React entry — 'use client' banner for RSC bundler compatibility;
  // styles.css is copied to dist/react/styles.css (package.json ./styles.css export)
  {
    entry: { 'react/index': 'src/react/index.ts' },
    format: 'esm',
    dts: { generator: 'oxc' },
    copy: [{ from: 'src/react/styles.css', to: 'dist/react' }],
    banner: {
      js: "'use client';",
    },
  },
  // Codemod CLI + transforms — separate outDir, bundles jscodeshift/globby
  {
    entry: {
      cli: 'src/codemod/cli.ts',
      'transforms/data-attrs': 'src/codemod/transforms/data-attrs.ts',
      'transforms/forward-ref': 'src/codemod/transforms/forward-ref.ts',
      'transforms/import-rewrite': 'src/codemod/transforms/import-rewrite.ts',
      'transforms/should-filter': 'src/codemod/transforms/should-filter.ts',
    },
    format: 'esm',
    dts: { generator: 'oxc' },
    outDir: 'dist/codemod',
  },
]);
