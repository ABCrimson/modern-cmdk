import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli.ts', 'src/transforms/*.ts'],
  format: ['esm'],
  dts: {
    isolatedDeclarations: true,
  },
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  target: 'es2026',
  treeshake: true,
  minify: false,
  platform: 'node',
});
