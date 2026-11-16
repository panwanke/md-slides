import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate build for the GitHub Pages static studio (mode A).
// Nothing here touches the normal workbench build (src/md_slide_studio/web_dist).
export default defineConfig({
  plugins: [react()],
  publicDir: 'static-public',
  base: './',
  build: {
    outDir: 'dist-static',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'studio.html'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
