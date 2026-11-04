import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import thresholds from './coverage-thresholds.json' with { type: 'json' };

// Source aliases for the unit and perf projects. The dist project sets none: dist/react imports
// 'modern-cmdk' by name, and an alias to src would run built React over source core (a mixed tree).
// Most specific key first: Vite matches a string key exactly or as a prefix followed by '/', so
// 'modern-cmdk/react/dialog' precedes 'modern-cmdk/react', which precedes 'modern-cmdk'.
const srcAlias = {
  'modern-cmdk/react/dialog': resolve(
    import.meta.dirname,
    'packages/modern-cmdk/src/react/dialog.tsx',
  ),
  'modern-cmdk/react': resolve(import.meta.dirname, 'packages/modern-cmdk/src/react/index.ts'),
  'modern-cmdk': resolve(import.meta.dirname, 'packages/modern-cmdk/src/core/index.ts'),
};

export default defineConfig({
  // Vitest 5.1 on Vite 8 (Rolldown) transpiles with oxc (target node22), not esbuild —
  // JSX automatic runtime and ESNext syntax (incl. `using`) are handled natively,
  // so no transform block is needed.
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    // Vitest 5.1.0, expandBenchmarksInEntries in its node bundle: under `vitest bench` each project's
    // bench variant runs its own benchmark.include, so benchmarks (which assert nothing) live in the 'perf'
    // project, which never sets requireAssertions, and 'unit' benchmarks nothing.
    projects: [
      {
        extends: true,
        resolve: { alias: srcAlias },
        test: {
          name: 'unit',
          expect: { requireAssertions: true },
          include: ['packages/*/src/**/*.test.ts', 'tests/unit/**/*.test.{ts,tsx}'],
          benchmark: { include: [] },
        },
      },
      {
        // Built-package tests import packages/modern-cmdk/dist, so they need `pnpm build` first;
        // no alias, so 'modern-cmdk' resolves through the package self-reference to dist/core.
        extends: true,
        test: {
          name: 'dist',
          expect: { requireAssertions: true },
          include: ['tests/dist/**/*.test.{ts,tsx}'],
          benchmark: { include: [] },
        },
      },
      {
        extends: true,
        resolve: { alias: srcAlias },
        test: {
          name: 'perf',
          include: [],
          benchmark: {
            include: ['benchmarks/**/*.bench.ts'],
            // wasm-search needs the browser-target WASM engine (createWasmSearchEngine loads
            // a `--target web` module), and the engine does not initialise yet (ledger W01),
            // so the suite stays excluded until it does.
            exclude: ['benchmarks/wasm-search.bench.ts'],
          },
        },
      },
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
  },
});
