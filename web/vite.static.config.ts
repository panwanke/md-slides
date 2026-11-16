import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate build for the GitHub Pages static studio (mode A).
// Nothing here touches the normal workbench build (src/md_slide_studio/web_dist).
export default defineConfig({
  plugins: [react(), {
    name: 'static-studio-entrypoints',
    writeBundle({ dir }) {
      if (!dir) return;
      const studio = path.join(dir, 'studio.html');
      copyFileSync(studio, path.join(dir, 'index.html'));
      const alias = path.join(dir, 'studio');
      mkdirSync(alias, { recursive: true });
      const page = readFileSync(studio, 'utf-8').replace('<head>', '<head>\n    <base href="../" />');
      writeFileSync(path.join(alias, 'index.html'), page);
    },
  }],
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
