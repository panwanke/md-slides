import type { Deck } from '../editorSession';

// Runs the real Python rendering engine inside the browser via Pyodide.
// Static mode (A) only: no /api calls, no WebSocket, no persistence.
export interface RenderResult {
  html: string;
  slideCount: number;
  title: string;
  theme: string;
  ast: Deck;
}

interface PyodideLike {
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, data: string): void;
  };
  runPython(code: string): unknown;
  globals: {
    get(name: string): (content: string, theme?: string) => string;
  };
}

type LoadPyodide = (options: { indexURL: string }) => Promise<PyodideLike>;

let runtimePromise: Promise<PyodideLike> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`无法加载 Pyodide 运行时：${src}`));
    document.head.appendChild(script);
  });
}

async function boot(): Promise<PyodideLike> {
  const base = new URL('.', document.baseURI);
  const win = window as unknown as { loadPyodide?: LoadPyodide };

  if (!win.loadPyodide) {
    await loadScript(new URL('pyodide/pyodide.js', base).href);
  }
  if (!win.loadPyodide) {
    throw new Error('Pyodide 运行时未能初始化');
  }

  const py = await win.loadPyodide({ indexURL: new URL('pyodide/', base).href });

  const response = await fetch(new URL('engine-bundle.json', base).href);
  if (!response.ok) {
    throw new Error(`引擎资源加载失败（${response.status}）`);
  }
  const bundle = (await response.json()) as { files: Record<string, string> };
  for (const [relative, content] of Object.entries(bundle.files)) {
    const target = `/app/${relative}`;
    py.FS.mkdirTree(target.slice(0, target.lastIndexOf('/')));
    py.FS.writeFile(target, content);
  }

  py.runPython(`
import sys, json
sys.path.insert(0, '/app')
from md_slide_studio.document.parser import build_document_ast
from md_slide_studio.render.engine import render_text

def md_render(content, theme):
    html, info = render_text(content, theme=theme or None)
    return json.dumps({
        'html': html,
        'slideCount': info['slideCount'],
        'title': info['title'],
        'theme': info['theme'],
        'ast': build_document_ast(content),
    })

jc_render = md_render

def md_ast(content):
    return json.dumps(build_document_ast(content))
`);
  return py;
}

function getRuntime(): Promise<PyodideLike> {
  if (!runtimePromise) {
    runtimePromise = boot().catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

/** Warm the engine up without rendering anything. */
export function warmEngine(): Promise<PyodideLike> {
  return getRuntime();
}

/** Render Markdown with exactly the same engine as the local CLI. */
export async function renderMarkdown(content: string, theme?: string): Promise<RenderResult> {
  const py = await getRuntime();
  const raw = py.globals.get('md_render')(content, theme ?? '');
  return JSON.parse(raw) as RenderResult;
}

/** Build document AST in browser using Pyodide. */
export async function buildAst(content: string): Promise<Deck> {
  const py = await getRuntime();
  const raw = py.globals.get('md_ast')(content);
  return JSON.parse(raw) as Deck;
}

/** List bundled themes without booting Python. */
export async function listThemes(): Promise<string[]> {
  const response = await fetch(new URL('engine-bundle.json', document.baseURI).href);
  if (!response.ok) return [];
  const bundle = (await response.json()) as { themes?: string[] };
  return bundle.themes ?? [];
}
