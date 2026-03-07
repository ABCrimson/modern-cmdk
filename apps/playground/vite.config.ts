import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  // SPA fallback: serve index.html for all routes (/dialog, /virtualization, etc.)
  appType: 'spa',
});
