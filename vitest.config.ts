import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    target: 'esnext',
  },
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
    },
    benchmark: {
      include: ['benchmarks/**/*.bench.ts'],
    },
  },
});
