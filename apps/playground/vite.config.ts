import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Vite 8.3 config: Rolldown bundles, Oxc transforms and minifies JS,
// Lightning CSS minifies CSS (all defaults, so no minifier options below).
export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    strictPort: true,
    warmup: {
      // Pre-transform frequently used modules for faster HMR
      clientFiles: ['./src/App.tsx', './src/main.tsx', './src/styles.css'],
    },
  },

  // SPA fallback: serve index.html for all routes (/dialog, /virtualization, etc.)
  appType: 'spa',

  build: {
    target: 'esnext',
    // Modern CSS features (nesting, @layer, @starting-style) — no transform needed
    cssTarget: 'esnext',
    rolldownOptions: {
      output: {
        // Rolldown's `codeSplitting.groups` replaces the deprecated `manualChunks`.
        // The pattern anchors on the package directory (pnpm nests packages under
        // node_modules/.pnpm/<id>/node_modules/<name>) so only the React runtime
        // lands in the vendor chunk, not workspace files such as modern-cmdk/dist/react.
        codeSplitting: {
          groups: [{ name: 'react', test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/ }],
        },
      },
    },
  },

  css: {
    // Source maps for CSS in dev (experimental in Vite)
    devSourcemap: true,
  },

  // Pre-bundle the React runtime on dev-server start instead of on first import
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
});
