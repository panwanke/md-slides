import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderUp, Save, Upload } from 'lucide-react';
import Workbench from '../App';
import { listThemes, renderMarkdown } from '../render/pyodideEngine';
import { embedWorkspaceImages } from '../render/workspaceImages';
import { StaticDeckStore } from '../store/staticStore';
import { workspaceFromDirectory, workspaceFromFiles } from '../store/workspace';
import type { DirectoryPicker, Workspace } from '../store/workspace';
import '../workbench.css';

const SAMPLE = `---
md_slide:
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
  const [documentPath, setDocumentPath] = useState('sample.md');
  const [fileBusy, setFileBusy] = useState(false);
  const [, setFileError] = useState('');
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

  const store = useMemo(() => {
    return new StaticDeckStore({
      initialContent: content,
      documentPath,
      theme,
      onRender: async (rawHtml, newContent, newTheme, ast) => {
        setContent(newContent);
        try {
          const output = await embedWorkspaceImages(rawHtml, workspace, documentPath);
          setRendered({ ...output, content: newContent, theme: newTheme, workspace, documentPath });
          setSlideCount(ast.slides.length);
          setError('');
          setStatus('ready');
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus('error');
        }
      },
    });
  }, [documentPath, workspace]);

  // Keep theme in store updated
  useEffect(() => {
    store.setTheme(theme);
    if (status === 'ready') {
      void renderMarkdown(content, theme).then(async (res) => {
        const output = await embedWorkspaceImages(res.html, workspace, documentPath);
        setRendered({ ...output, content, theme, workspace, documentPath });
      });
    }
  }, [theme]);

  // Initial render on boot
  useEffect(() => {
    let cancelled = false;
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
    return () => {
      cancelled = true;
    };
  }, []);

  function replaceContent(text: string, path: string) {
    setContent(text);
    setSavedContent(text);
    setDocumentPath(path);
    store.setDocument(path, text);
    void renderMarkdown(text, theme).then(async (res) => {
      const output = await embedWorkspaceImages(res.html, workspace, path);
      setRendered({ ...output, content: text, theme, workspace, documentPath: path });
      setSlideCount(res.slideCount);
    });
  }

  async function importMarkdown(file?: File) {
    if (!file) return;
    if (fileInput.current) fileInput.current.value = '';
    if (!canReplace()) return;
    await handleFileAction(async () => {
      const text = await file.text();
      setWorkspace(undefined);
      replaceContent(text, file.name);
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
    replaceContent(text, path);
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

  const currentStatusText = error
    ? `渲染失败：${error}`
    : rendered?.missing?.length
    ? `就绪 · 缺少 ${rendered.missing.length} 张图片 (${rendered.missing.join(', ')})`
    : statusText[status];

  return (
    <Workbench
      key={documentPath}
      staticMode
      store={store}
      onDocChange={(newContent) => setContent(newContent)}
      previewSrcDoc={rendered?.previewHtml}
      staticStatusText={currentStatusText}
      workspaceSelect={
        workspace && workspace.documents.length > 0 ? (
          <div className="open-file" style={{ marginLeft: '12px' }}>
            <select
              aria-label="工作文件夹中的 Markdown"
              value={documentPath}
              className="button"
              style={{ padding: '4px 8px', fontSize: '13px' }}
              onChange={(event) => void handleFileAction(() => openDocument(workspace, event.target.value))}
            >
              {workspace.documents.map((doc) => (
                <option key={doc} value={doc}>{doc}</option>
              ))}
            </select>
          </div>
        ) : null
      }
      headerActions={
        <>
          <input
            ref={folderInput}
            type="file"
            {...{ webkitdirectory: '' }}
            hidden
            onChange={(event) => importWorkspace(event.target.files)}
          />
          <button type="button" className="button" disabled={fileBusy} onClick={chooseWorkspace} title="打开包含 Markdown 与图片的本地文件夹">
            <FolderUp size={15} /><span>打开工作文件夹</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            hidden
            onChange={(event) => void importMarkdown(event.target.files?.[0])}
          />
          <button type="button" className="button" disabled={fileBusy} onClick={() => fileInput.current?.click()} title="导入单个 Markdown 文件">
            <Upload size={15} /><span>导入 .md</span>
          </button>
          {workspace?.save && (
            <button type="button" className="button" disabled={fileBusy || !dirty} onClick={saveDocument} title="直接写回本地文件">
              <Save size={15} /><span>保存到本地</span>
            </button>
          )}
          {dirty && (
            <span style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 500 }}>
              未保存
            </span>
          )}
          <button type="button" className="button" onClick={() => download(filename, content, 'text/markdown;charset=utf-8')} title="导出 Markdown 源码文件">
            <span>导出 .md</span>
          </button>
          <button
            type="button"
            className="button"
            disabled={!currentRender}
            onClick={() => download(filename.replace(/\.[^.]+$/, '') + '.html', rendered?.html || '', 'text/html;charset=utf-8')}
            title="编译打包为独立离线 HTML 演示稿"
          >
            <span>导出 .html</span>
          </button>
          {themes.length > 0 && (
            <select
              aria-label="主题"
              value={theme}
              className="button theme-select"
              style={{ padding: '4px 8px', fontSize: '13px' }}
              onChange={(event) => setTheme(event.target.value)}
              title="切换全局演示主题"
            >
              {themes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
        </>
      }
      onPresent={(page) => {
        if (!rendered?.html) return;
        const blob = new Blob([rendered.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(`${url}#/${page}`, '_blank');
      }}
    />
  );
}
