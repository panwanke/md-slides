import { useEffect, useRef, useState } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { listThemes, renderMarkdown } from '../render/pyodideEngine';
import { embedWorkspaceImages } from '../render/workspaceImages';
import { workspaceFromDirectory, workspaceFromFiles } from '../store/workspace';
import type { DirectoryPicker, Workspace } from '../store/workspace';
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
- 打开本地工作文件夹，预览 Markdown 引用的图片

---

## 数据去哪了

文件在浏览器内读取。编辑后请保存到本地或导出。

::: notes
真正的多人使用与云端保存，请用自建服务版本。
:::
`;

type Status = 'booting' | 'ready' | 'rendering' | 'error';

const editability = new Compartment();

function editorState(content: string, onChange: (content: string) => void) {
  return EditorState.create({
    doc: content,
    extensions: [
      basicSetup,
      markdown(),
      editability.of(EditorView.editable.of(true)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.state.doc.toString());
      }),
      EditorView.theme({
        '&': { height: '100%', fontSize: '13px' },
        '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65' },
      }),
    ],
  });
}

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
  const [savedContent, setSavedContent] = useState(SAMPLE);
  const [workspace, setWorkspace] = useState<Workspace>();
  const [documentPath, setDocumentPath] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [rendered, setRendered] = useState<{
    html: string;
    previewHtml: string;
    missing: string[];
    content: string;
    theme: string;
    workspace?: Workspace;
    documentPath: string;
  }>();
  const [theme, setTheme] = useState('academic-paper');
  const [themes, setThemes] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>('booting');
  const [error, setError] = useState('');
  const [slideCount, setSlideCount] = useState(0);
  const editorHost = useRef<HTMLDivElement>(null);
  const editorView = useRef<EditorView | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const dirty = content !== savedContent;
  const filename = documentPath.split('/').pop() || 'deck.md';
  const currentRender = rendered?.content === content && rendered.theme === theme
    && rendered.workspace === workspace && rendered.documentPath === documentPath;

  useEffect(() => {
    if (!dirty) return;
    function preventUnsavedClose(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener('beforeunload', preventUnsavedClose);
    return () => window.removeEventListener('beforeunload', preventUnsavedClose);
  }, [dirty]);

  useEffect(() => {
    void listThemes().then(setThemes).catch(() => setThemes([]));
  }, []);

  useEffect(() => {
    if (!editorHost.current) return;
    const view = new EditorView({
      state: editorState(SAMPLE, setContent),
      parent: editorHost.current,
    });
    editorView.current = view;
    return () => {
      view.destroy();
      editorView.current = null;
    };
  }, []);

  useEffect(() => {
    editorView.current?.dispatch({ effects: editability.reconfigure(EditorView.editable.of(!fileBusy)) });
  }, [fileBusy]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setStatus('rendering');
      void renderMarkdown(content, theme)
        .then(async (result) => {
          if (cancelled) return;
          const output = await embedWorkspaceImages(result.html, workspace, documentPath);
          if (cancelled) return;
          setRendered({ ...output, content, theme, workspace, documentPath });
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
  }, [content, theme, workspace, documentPath]);

  function replaceContent(text: string) {
    setContent(text);
    setSavedContent(text);
    const view = editorView.current;
    if (view) {
      view.setState(editorState(text, setContent));
    }
  }

  async function importMarkdown(file?: File) {
    if (!file) return;
    if (fileInput.current) fileInput.current.value = '';
    if (!canReplace()) return;
    await handleFileAction(async () => {
      const text = await file.text();
      setWorkspace(undefined);
      setDocumentPath(file.name);
      replaceContent(text);
    });
  }

  function canReplace() {
    return !dirty || window.confirm('当前 Markdown 有未保存的修改。是否放弃修改并打开其他文件？');
  }

  async function handleFileAction(action: () => Promise<void>) {
    setFileBusy(true);
    setFileError('');
    try {
      await action();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFileError(error instanceof Error ? error.message : String(error));
    } finally {
      setFileBusy(false);
    }
  }

  async function openDocument(folder: Workspace, path: string) {
    const file = await folder.read(path);
    if (!file) throw new Error('找不到选中的 Markdown 文件');
    const text = await file.text();
    setWorkspace(folder);
    setDocumentPath(path);
    replaceContent(text);
  }

  async function openWorkspace(folder: Workspace) {
    if (!folder.documents.length) throw new Error('工作文件夹内没有 Markdown 文件');
    await openDocument(folder, folder.documents[0]);
  }

  function chooseWorkspace() {
    const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
    if (!picker) {
      folderInput.current?.click();
      return;
    }
    if (!canReplace()) return;
    void handleFileAction(async () => {
      const root = await picker.call(window, { mode: 'readwrite' });
      await openWorkspace(await workspaceFromDirectory(root));
    });
  }

  function importWorkspace(files: FileList | null) {
    if (!files?.length) return;
    const folder = workspaceFromFiles(files);
    if (folderInput.current) folderInput.current.value = '';
    if (canReplace()) void handleFileAction(() => openWorkspace(folder));
  }

  function saveDocument() {
    const save = workspace?.save;
    if (!save) return;
    void handleFileAction(async () => {
      await save(documentPath, content);
      setSavedContent(content);
    });
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
            <h1>Slide Studio</h1>
            <p>浏览器内运行 Python 渲染引擎，无需登录、无需后端</p>
          </div>
        </div>
        <div className="studio-actions">
          <input
            ref={folderInput}
            type="file"
            {...{ webkitdirectory: '' }}
            hidden
            onChange={(event) => importWorkspace(event.target.files)}
          />
          <button type="button" disabled={fileBusy} onClick={chooseWorkspace}>打开工作文件夹</button>
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            hidden
            onChange={(event) => void importMarkdown(event.target.files?.[0])}
          />
          <button type="button" disabled={fileBusy} onClick={() => fileInput.current?.click()}>导入 .md</button>
          {workspace?.save && (
            <button type="button" disabled={fileBusy || !dirty} onClick={saveDocument}>保存到本地</button>
          )}
          <button type="button" onClick={() => download(filename, content, 'text/markdown;charset=utf-8')}>
            导出 .md
          </button>
          <button
            type="button"
            disabled={!currentRender}
            onClick={() => rendered && download(filename.replace(/\.[^.]+$/, '') + '.html', rendered.html, 'text/html;charset=utf-8')}
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
          <div className="studio-pane-label studio-document">
            {workspace ? (
              <>
                <span>{workspace.name}</span>
                <select
                  aria-label="工作文件夹中的 Markdown"
                  value={documentPath}
                  disabled={fileBusy}
                  onChange={(event) => {
                    const path = event.target.value;
                    if (canReplace()) void handleFileAction(() => openDocument(workspace, path));
                  }}
                >
                  {workspace.documents.map((path) => <option key={path} value={path}>{path}</option>)}
                </select>
              </>
            ) : <span>{documentPath || 'Markdown 源码'}</span>}
            {dirty && <span>未保存</span>}
          </div>
          <div ref={editorHost} className="studio-editor" />
        </section>
        <section className="studio-pane">
          <div className="studio-pane-label">实时预览</div>
          {rendered ? (
            <iframe
              className="studio-preview"
              title="幻灯片预览"
              sandbox="allow-scripts"
              srcDoc={rendered.previewHtml}
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
        {fileError && <span className="studio-error" role="alert">{fileError}</span>}
        {currentRender && rendered.missing.length > 0 && (
          <span className="studio-error" title={rendered.missing.join('\n')}>
            缺少 {rendered.missing.length} 张图片 · {rendered.missing[0]}
          </span>
        )}
        <span className="studio-note">
          {workspace && !workspace.save ? '文件夹只读，编辑后请导出 .md' : '文件在浏览器内处理'}
        </span>
      </footer>
    </div>
  );
}
