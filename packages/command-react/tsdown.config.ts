import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
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
  external: ['react', 'react-dom', 'radix-ui', '@crimson_dev/command'],
  platform: 'browser',
  define: {
    __DEV__: 'process.env.NODE_ENV !== "production"',
  },
});
