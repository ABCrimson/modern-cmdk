import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Vite 8.0.0-beta.16 config
// Environment API is stable, CSS features auto-detected
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
    // Vite 8 uses esbuild by default, enable minification
    minify: 'esbuild',
    cssMinify: 'esbuild',
    // Modern CSS features (nesting, @layer, @starting-style) — no transform needed
    cssTarget: 'esnext',
    rollupOptions: {
      output: {
        // Vite 8 requires function form for manualChunks
        manualChunks(id: string) {
          if (id.includes('react-dom') || id.includes('react')) {
            return 'react';
          }
        },
      },
    },
  },

  css: {
    // Vite 8 native CSS features — no PostCSS needed for nesting, @layer
    devSourcemap: true,
  },

  // Vite 8 optimizeDeps — pre-bundle workspace packages for dev speed
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
});
