import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import thresholds from './coverage-thresholds.json' with { type: 'json' };

export default defineConfig({
  // Vitest 5.1 on Vite 8 (Rolldown) transpiles with oxc (target node22), not esbuild —
  // JSX automatic runtime and ESNext syntax (incl. `using`) are handled natively,
  // so no transform block is needed.
  resolve: {
    alias: {
      'modern-cmdk/react': resolve(import.meta.dirname, 'packages/modern-cmdk/src/react/index.ts'),
      'modern-cmdk': resolve(import.meta.dirname, 'packages/modern-cmdk/src/core/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    expect: { requireAssertions: true },
    setupFiles: ['./tests/setup.ts'],
    include: [
      'packages/*/src/**/*.test.ts',
      'tests/unit/**/*.test.{ts,tsx}',
      // Built-package tests import packages/modern-cmdk/dist, so they need `pnpm build` first
      'tests/dist/**/*.test.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.bench.ts',
        // Pure barrels (re-exports only, verified): exact paths, never a glob that could hide logic.
        'packages/modern-cmdk/src/core/index.ts',
        'packages/modern-cmdk/src/react/index.ts',
        'packages/command-search-wasm/src/index.ts',
        // Not measured: dead file (JSX in a .ts file, imported by nothing, outside the tsdown
        // entries and excluded by packages/modern-cmdk/tsconfig.json); Vite cannot transform it,
        // so coverage-v8 cannot parse it. Deleted in the D window (ledger RA-24, ARCH-37, RDG-91).
        'packages/modern-cmdk/src/react/primitives.ts',
        // Not measured: these import ../pkg (wasm-pack output), which the unit-test run does not
        // build, so vitest cannot load them (ledger W13 clause 3).
        'packages/command-search-wasm/src/wasm-engine.ts',
        'packages/command-search-wasm/src/worker.ts',
        // Type declarations only, never instrumented.
        '**/*.d.ts',
      ],
      reportOnFailure: true,
      reporter: ['text', 'lcov', 'json-summary'],
      // Measured honest baseline, floored to integers; scripts/coverage-ratchet.mjs
      // fails CI when a metric drops below the value on origin/main.
      thresholds,
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
