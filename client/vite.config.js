import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the React app runs on :5173 and the API on :4000.
// The proxy forwards /api, /media and /ws so the browser sees a single
// origin (no CORS issues, same URLs as in production).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/media': 'http://localhost:4000',
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
