import { defineConfig } from 'tsdown';

// Defaults relied on (tsdown 0.23 types): format 'esm', outDir 'dist', clean true,
// treeshake true.
export default defineConfig({
  entry: ['src/index.ts'],
  dts: { generator: 'oxc' },
  sourcemap: true,
  target: 'esnext',
  minify: false,
  define: {
    __DEV__: 'process.env.NODE_ENV !== "production"',
  },
  deps: {
    neverBundle: ['modern-cmdk'],
  },
  platform: 'browser',
});
