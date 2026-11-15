import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { listThemes, renderMarkdown } from '../render/pyodideEngine';
import './static.css';

const SAMPLE = `---
jc:
  title: 我的第一份演示稿
  theme: academic-paper
  lang: zh
---

# 在浏览器里写幻灯片

无需安装、无需登录，Markdown 直接变成演示稿。

---

## 支持什么

- 同一套 Python 渲染引擎，和本地 CLI 输出一致
- 主题切换、分节导航、演讲者备注
- 导入本地 .md，导出 .md 或独立 .html

---

## 数据去哪了

静态站不保存任何内容。写完请导出，刷新页面会丢失。

::: notes
真正的多人使用与云端保存，请用自建服务版本。
:::
`;

type Status = 'booting' | 'ready' | 'rendering' | 'error';

function download(filename: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StaticStudio() {
  const [content, setContent] = useState(SAMPLE);
  const [html, setHtml] = useState('');
  const [theme, setTheme] = useState('academic-paper');
  const [themes, setThemes] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>('booting');
  const [error, setError] = useState('');
  const [slideCount, setSlideCount] = useState(0);
  const editorHost = useRef<HTMLDivElement>(null);
  const editorView = useRef<EditorView | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listThemes().then(setThemes).catch(() => setThemes([]));
  }, []);

  useEffect(() => {
    if (!editorHost.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: SAMPLE,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) setContent(update.state.doc.toString());
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '13px' },
            '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65' },
          }),
        ],
      }),
      parent: editorHost.current,
    });
    editorView.current = view;
    return () => {
      view.destroy();
      editorView.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setStatus('rendering');
      void renderMarkdown(content, theme)
        .then((result) => {
          if (cancelled) return;
          setHtml(result.html);
          setSlideCount(result.slideCount);
          setError('');
          setStatus('ready');
        })
        .catch((reason: unknown) => {
          if (cancelled) return;
          setError(reason instanceof Error ? reason.message : String(reason));
          setStatus('error');
        });
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [content, theme]);

  function replaceContent(text: string) {
    setContent(text);
    const view = editorView.current;
    if (view) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }
  }

  async function importMarkdown(file?: File) {
    if (!file) return;
    replaceContent(await file.text());
    if (fileInput.current) fileInput.current.value = '';
  }

  const statusText: Record<Status, string> = {
    booting: '正在加载渲染引擎（首次约 13 MB）…',
    ready: `就绪 · ${slideCount} 页`,
    rendering: '渲染中…',
    error: '渲染失败',
  };

  return (
    <div className="studio">
      <header className="studio-header">
        <div className="studio-brand">
          <span className="studio-mark">jc</span>
          <div>
            <h1>Slide Studio · 在线试用</h1>
            <p>浏览器内运行 Python 渲染引擎，无需登录、无需后端</p>
          </div>
        </div>
        <div className="studio-actions">
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            hidden
            onChange={(event) => void importMarkdown(event.target.files?.[0])}
          />
          <button type="button" onClick={() => fileInput.current?.click()}>导入 .md</button>
          <button type="button" onClick={() => download('deck.md', content, 'text/markdown;charset=utf-8')}>
            导出 .md
          </button>
          <button
            type="button"
            disabled={!html}
            onClick={() => download('deck.html', html, 'text/html;charset=utf-8')}
          >
            导出 .html
          </button>
          <label className="studio-theme">
            主题
            <select value={theme} onChange={(event) => setTheme(event.target.value)}>
              {(themes.length ? themes : [theme]).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className="studio-body">
        <section className="studio-pane">
          <div className="studio-pane-label">Markdown 源码</div>
          <div ref={editorHost} className="studio-editor" />
        </section>
        <section className="studio-pane">
          <div className="studio-pane-label">实时预览</div>
          {html ? (
            <iframe
              className="studio-preview"
              title="幻灯片预览"
              sandbox="allow-scripts allow-same-origin"
              srcDoc={html}
            />
          ) : (
            <div className="studio-placeholder">
              {status === 'error' ? '渲染失败，请检查下方提示' : '正在准备预览…'}
            </div>
          )}
        </section>
      </main>

      <footer className={`studio-status studio-status-${status}`}>
        <span>{statusText[status]}</span>
        {error ? <span className="studio-error">{error}</span> : null}
        <span className="studio-note">
          内容只留在当前浏览器，刷新即丢失；渲染引擎由 Pyodide (MPL-2.0) 提供
        </span>
      </footer>
    </div>
  );
}
