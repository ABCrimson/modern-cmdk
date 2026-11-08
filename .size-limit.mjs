// .size-limit.mjs
// The size-limit budgets. size-limit 14.3.0 reads this file because the root package.json holds no `size-limit` key
// (its search places in size-limit/get-config.js); package.json is JSON and cannot hold the function below.
//
// Every entry that @size-limit/rolldown bundles gets `process.env.NODE_ENV` defined as "production" through
// `modifyRolldownConfig` (size-limit/index.d.ts) and rolldown's `transform.define`, because that is the bundle every
// consumer bundler produces: the development guards (`typeof process !== 'undefined' && process.env.NODE_ENV !==
// 'production'`) fold away. Entries with `rolldown: false` measure their files as they are.
// `pnpm size` and the Bundle Size job (.github/workflows/ci.yml) both run `size-limit` and read this file.

/** Defines `process.env.NODE_ENV` as "production" in rolldown's transform options, keeping any other define. */
const defineProduction = (config) => ({
  ...config,
  transform: {
    ...config.transform,
    define: { ...config.transform?.define, 'process.env.NODE_ENV': '"production"' },
  },
});

const checks = [
  {
    name: 'modern-cmdk (core)',
    path: 'packages/modern-cmdk/dist/core/index.mjs',
    limit: '7.4 kB',
    gzip: true,
  },
  {
    name: 'modern-cmdk/react (adapter only)',
    path: 'packages/modern-cmdk/dist/react/index.mjs',
    limit: '5.7 kB',
    gzip: true,
    ignore: [
      'modern-cmdk',
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'radix-ui',
    ],
  },
  {
    name: 'modern-cmdk/react/dialog (adapter only)',
    path: 'packages/modern-cmdk/dist/react/dialog.mjs',
    limit: '1.5 kB',
    gzip: true,
    ignore: [
      'modern-cmdk',
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'radix-ui',
    ],
  },
  {
    name: 'modern-cmdk/react: CommandSeparator only',
    path: 'packages/modern-cmdk/dist/react/index.mjs',
    import: '{ CommandSeparator }',
    limit: '5 kB',
    gzip: true,
    ignore: [
      'modern-cmdk',
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'radix-ui',
    ],
  },
  {
    name: 'modern-cmdk + modern-cmdk/react',
    path: 'packages/modern-cmdk/dist/react/index.mjs',
    limit: '10.85 kB',
    gzip: true,
    ignore: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'radix-ui'],
  },
  {
    name: 'modern-cmdk/styles.css',
    path: 'packages/modern-cmdk/dist/react/styles.css',
    limit: '4 kB',
    gzip: true,
    rolldown: false,
  },
  {
    name: 'modern-cmdk codemod bin (installed size)',
    path: [
      'packages/modern-cmdk/dist/codemod/*.mjs',
      'packages/modern-cmdk/dist/codemod/transforms/*.mjs',
    ],
    limit: '3.4 MB',
    gzip: false,
    brotli: false,
    rolldown: false,
  },
  {
    name: 'modern-cmdk codemod shim (bin.mjs)',
    path: 'packages/modern-cmdk/dist/codemod/bin.mjs',
    limit: '1 kB',
    gzip: false,
    brotli: false,
    rolldown: false,
  },
  {
    name: 'modern-cmdk-codemod (own files, dependencies excluded)',
    path: [
      'packages/modern-cmdk-codemod/dist/*.mjs',
      'packages/modern-cmdk-codemod/dist/transforms/*.mjs',
    ],
    limit: '102 kB',
    gzip: false,
    brotli: false,
    rolldown: false,
  },
];

export default checks.map((check) =>
  check.rolldown === false ? check : { ...check, modifyRolldownConfig: defineProduction },
);
