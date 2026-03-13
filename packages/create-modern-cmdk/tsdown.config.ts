import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { isolatedDeclarations: true },
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  target: 'esnext',
  treeshake: true,
  minify: false,
  platform: 'node',
});
