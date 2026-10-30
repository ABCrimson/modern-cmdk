import { defineConfig } from 'tsdown';

// Defaults relied on (tsdown 0.23 types): format 'esm', platform 'node', outDir 'dist',
// clean true, treeshake true.
export default defineConfig({
  entry: ['src/index.ts'],
  dts: { generator: 'oxc' },
  sourcemap: true,
  target: 'esnext',
  minify: false,
});
