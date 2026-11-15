import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function bundleLicenses(): Plugin {
  return {
    name: 'bundle-runtime-licenses',
    apply: 'build',
    generateBundle(_options, bundle) {
      const packages = new Map<string, string>();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const [id, rendered] of Object.entries(chunk.modules)) {
          const marker = '/node_modules/';
          const location = id.lastIndexOf(marker);
          if (location < 0 || !rendered.renderedLength) continue;
          const segments = id.slice(location + marker.length).split('/');
          const name = segments.slice(0, segments[0].startsWith('@') ? 2 : 1).join('/');
          const directory = id.slice(0, location + marker.length) + name;
          packages.set(name, directory);
        }
      }
      const notices = [...packages].sort(([left], [right]) => left.localeCompare(right))
        .map(([name, directory]) => {
          const file = readdirSync(directory).find((filename) => /^licen[cs]e(\..+)?$/i.test(filename));
          if (!file) this.error(`Missing license for bundled package ${name}`);
          return `${name}\n\n${readFileSync(path.join(directory, file), 'utf8').trim()}`;
        });
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_LICENSES.txt', source: notices.join('\n\n') + '\n' });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), bundleLicenses()],
  base: command === 'build' ? '/workbench/' : '/',
  build: {
    outDir: '../src/jc_slide_studio/web_dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          editor: ['@codemirror/state', '@codemirror/view', '@codemirror/language', 'codemirror'],
          markdown: ['@codemirror/lang-markdown'],
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
      },
      '/preview': 'http://127.0.0.1:8000',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}));
