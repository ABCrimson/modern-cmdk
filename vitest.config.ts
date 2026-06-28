import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vitest 5 transpiles with oxc (not esbuild) by default — JSX automatic runtime
  // and ESNext syntax (incl. `using`) are handled natively, so no transform block needed.
  resolve: {
    alias: {
      'modern-cmdk/react': resolve(__dirname, 'packages/modern-cmdk/src/react/index.ts'),
      'modern-cmdk': resolve(__dirname, 'packages/modern-cmdk/src/core/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['packages/*/src/**/*.test.ts', 'tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.bench.ts',
        '**/index.ts',
        '**/primitives.ts',
        '**/command-search-wasm/**',
        '**/codemod/**',
        '**/create-modern-cmdk/**',
      ],
      thresholds: {
        lines: 80,
        functions: 75,
        branches: 70,
        statements: 80,
      },
    },
    benchmark: {
      include: ['benchmarks/**/*.bench.ts'],
      // wasm-search needs the browser-target WASM engine (createWasmSearchEngine loads
      // a `--target web` module) — it runs via the standalone benchmarks/standalone
      // harness, not the Node-based `vitest bench` runner.
      exclude: ['benchmarks/wasm-search.bench.ts'],
    },
  },
});
