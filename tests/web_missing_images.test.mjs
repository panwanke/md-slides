import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const ts = require('../web/node_modules/typescript/lib/typescript.js');

const moduleSourcePath = new URL('../web/src/render/missingImages.ts', import.meta.url);

async function loadModule() {
  const source = await readFile(moduleSourcePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  // Evaluate in this realm (not vm) so returned arrays share Array.prototype
  // and deepStrictEqual works.
  const exports = {};
  new Function('exports', outputText)(exports);
  return exports;
}

/** Minimal stand-in for the parts of the preview DOM the scanner touches. */
function fakeDocument(images) {
  return {
    querySelectorAll(selector) {
      assert.equal(selector, 'img');
      return images.map((img) => ({
        complete: img.complete ?? true,
        naturalWidth: img.naturalWidth ?? 0,
        getAttribute(name) {
          assert.equal(name, 'src');
          return img.src ?? '';
        },
      }));
    },
  };
}

test('normalizeImagePath strips query, hash, ./ prefix and angle brackets', async () => {
  const { normalizeImagePath } = await loadModule();
  assert.equal(normalizeImagePath('./images/fig.png?v=2#x'), 'images/fig.png');
  assert.equal(normalizeImagePath('<images/a b.png>'), 'images/a b.png');
  assert.equal(normalizeImagePath('  pics/x.svg  '), 'pics/x.svg');
});

test('isExternalImageSource excludes data, http, absolute and anchor sources', async () => {
  const { isExternalImageSource } = await loadModule();
  assert.equal(isExternalImageSource('data:image/png;base64,AAAA'), true);
  assert.equal(isExternalImageSource('https://cdn/x.png'), true);
  assert.equal(isExternalImageSource('/root/x.png'), true);
  assert.equal(isExternalImageSource('#frag'), true);
  assert.equal(isExternalImageSource('images/fig.png'), false);
  assert.equal(isExternalImageSource('fig.svg'), false);
});

test('mergeMissingPaths de-duplicates and normalizes across modes', async () => {
  const { mergeMissingPaths } = await loadModule();
  const result = mergeMissingPaths(['./images/a.png', 'b.svg'], undefined, ['images/a.png?v=3', 'c.jpg']);
  assert.deepEqual(result, ['images/a.png', 'b.svg', 'c.jpg']);
});

test('scanBrokenImages reports only failed, document-relative images', async () => {
  const { scanBrokenImages } = await loadModule();
  const doc = fakeDocument([
    { src: 'images/missing.png', complete: true, naturalWidth: 0 },
    { src: 'images/ok.png', complete: true, naturalWidth: 640 },
    { src: 'https://cdn/broken.png', complete: true, naturalWidth: 0 },
    { src: 'data:image/png;base64,AA', complete: true, naturalWidth: 0 },
    { src: 'images/still-loading.png', complete: false, naturalWidth: 0 },
    { src: './images/second.png?x=1', complete: true, naturalWidth: 0 },
  ]);
  assert.deepEqual(scanBrokenImages(doc), ['images/missing.png', 'images/second.png']);
});

test('scanBrokenImages maps resolved src back to authored path when given a mapper', async () => {
  const { scanBrokenImages } = await loadModule();
  const doc = fakeDocument([
    { src: 'https://signed.example/deck/9/images/fig.png?sig=abc', complete: true, naturalWidth: 0 },
  ]);
  const toAuthored = (src) => src.match(/images\/fig\.png/)?.[0] ?? src;
  assert.deepEqual(scanBrokenImages(doc, toAuthored), ['images/fig.png']);
});
