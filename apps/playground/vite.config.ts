import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  // SPA fallback: serve index.html for all routes (/dialog, /virtualization, etc.)
  appType: 'spa',
});
