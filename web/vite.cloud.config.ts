import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// WorkBuddy cloud-service build: the Shell/CloudApp entry (with WorkBuddy
// auth + cloud persistence) plus the self-contained Pyodide runtime.
// The static GitHub build uses studio.html/staticMain.tsx and stays untouched.
export default defineConfig({
  // Force the cloud branch regardless of hostname so a shared/preview domain
  // cannot fall back to the FastAPI library mode.
  define: {
    'import.meta.env.VITE_CLOUD': JSON.stringify('1'),
  },
  plugins: [react()],
  publicDir: 'static-public',
  base: './',
  build: {
    outDir: 'dist-cloud',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
