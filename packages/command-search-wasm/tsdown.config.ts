import { defineConfig } from 'tsdown';

// Defaults relied on (tsdown 0.23 types): format 'esm', outDir 'dist', clean true,
// treeshake true.
// `worker` is a second entry so dist/worker.js exists: worker-engine.ts builds the Worker URL
// as `new URL('./worker.js', import.meta.url)`, which resolves next to dist/index.js.
// No `define` for the dev flag: src/env.ts keeps `process.env.NODE_ENV` for consumer bundlers.
export default defineConfig({
  entry: { index: 'src/index.ts', worker: 'src/worker.ts' },
  dts: { generator: 'oxc' },
  sourcemap: true,
  target: 'esnext',
  minify: false,
  deps: {
    neverBundle: ['modern-cmdk'],
  },
  // 'neutral', not 'browser': the browser platform folds process.env.NODE_ENV to "development" at
  // build time, which would ship the dev-only warnings unguarded to every consumer.
  platform: 'neutral',
});
