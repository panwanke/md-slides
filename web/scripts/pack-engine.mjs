// Bundle the pure-stdlib Python rendering engine for the browser (static mode A).
// Output lands in static-public/, which Vite copies verbatim into dist-static/.
// The Pyodide runtime is copied alongside it, so the static site needs no external CDN.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(webRoot, '..');
const pkgRoot = path.join(repoRoot, 'src', 'md_slide_studio');
const outDir = path.join(webRoot, 'static-public');
const pyodidePkg = path.join(webRoot, 'node_modules', 'pyodide');

// Closed dependency set of render_text(). server/, studio/, cli.py and document/check.py
// are deliberately excluded: they pull in fastapi/sqlite/click or are unused here.
const MODULES = [
  '__init__.py',
  'document/__init__.py',
  'document/parser.py',
  'providers/__init__.py',
  'providers/assets.py',
  'render/__init__.py',
  'render/engine.py',
  'render/delivery.py',
  'render/navigation.py',
];

function collectAssets(dir, prefix, out) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) {
      collectAssets(full, rel, out);
    } else {
      out[`md_slide_studio/providers/assets/${rel}`] = readFileSync(full, 'utf8');
    }
  }
}

const files = {};
for (const rel of MODULES) {
  files[`md_slide_studio/${rel}`] = readFileSync(path.join(pkgRoot, rel), 'utf8');
}
collectAssets(path.join(pkgRoot, 'providers', 'assets'), '', files);

const themes = Object.keys(files)
  .filter((key) => key.startsWith('md_slide_studio/providers/assets/themes/') && key.endsWith('.css'))
  .map((key) => path.basename(key, '.css'))
  .sort();

mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, 'engine-bundle.json'),
  JSON.stringify({ version: '0.1.0', themes, files }),
);

const runtimeDir = path.join(outDir, 'pyodide');
mkdirSync(runtimeDir, { recursive: true });
for (const name of [
  'pyodide.js',
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
]) {
  copyFileSync(path.join(pyodidePkg, name), path.join(runtimeDir, name));
}

console.log(
  `engine bundle: ${Object.keys(files).length} files, ${themes.length} themes; pyodide runtime copied`,
);
