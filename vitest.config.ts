import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    target: 'esnext',
  },
  resolve: {
    alias: {
      '@crimson_dev/command': resolve(__dirname, 'packages/command/src/index.ts'),
      '@crimson_dev/command-react': resolve(__dirname, 'packages/command-react/src/index.ts'),
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
        '**/command-codemod/**',
        '**/create-command/**',
      ],
      thresholds: {
        statements: 40,
        branches: 35,
        functions: 35,
        lines: 40,
      },
    },
    benchmark: {
      include: ['benchmarks/**/*.bench.ts'],
    },
  },
});
