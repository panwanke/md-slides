import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, FileText, FolderOpen, Save } from 'lucide-react';
import Workbench from '../App';
import type { EditorSession } from '../editorSession';
import { buildAst, listThemes, renderMarkdown } from '../render/pyodideEngine';
import { listServerThemes, parseOnServer, renderOnServer } from '../render/serverEngine';
import { downloadText } from '../render/download';
import { embedWorkspaceImages } from '../render/workspaceImages';
import { StaticDeckStore } from '../store/staticStore';
import { markdownFile, workspaceFromDirectory, workspaceFromFiles } from '../store/workspace';
import type { DirectoryPicker, Workspace } from '../store/workspace';
import { shortcutText, useShortcut, useShortcuts } from '../shortcuts';
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

interface OpenDocument {
  id: number;
  path: string;
  text: string;
  workspace?: Workspace;
}

export default function WorkspaceStudio({ bound = false }: { bound?: boolean }) {
  const [opened, setOpened] = useState<OpenDocument | undefined>(
    bound ? undefined : { id: 0, path: 'sample.md', text: SAMPLE },
  );
  const [content, setContent] = useState(opened?.text ?? '');
  const [savedContent, setSavedContent] = useState(content);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [rendered, setRendered] = useState<(Awaited<ReturnType<typeof embedWorkspaceImages>> & {
    documentId: number;
    content: string;
    theme: string;
    slideCount: number;
  })>();
  const [theme, setTheme] = useState('');
  const [themes, setThemes] = useState<string[]>([]);
  const [renderError, setRenderError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const fileAction = useRef(false);
  const latestContent = useRef(content);
  const session = useRef<EditorSession>();
  const nextDocumentId = useRef(1);
  const documentPath = opened?.path ?? '';
  const workspace = opened?.workspace;
  const dirty = content !== savedContent;
  const filename = documentPath.split('/').pop() || 'deck.md';
  const preview = rendered?.documentId === opened?.id ? rendered : undefined;
  const currentRender = preview?.content === content && preview.theme === theme;

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
    void (bound ? listServerThemes() : listThemes()).then(setThemes).catch(() => setThemes([]));
  }, [bound]);

  const { shortcuts } = useShortcuts();
  useShortcut('openMarkdown', true, () => {
    if (!fileAction.current) fileInput.current?.click();
  });
  useShortcut('openWorkspace', true, () => {
    if (!fileAction.current) chooseWorkspace();
  });
  useShortcut('save', Boolean(opened), () => {
    if (fileAction.current) return;
    if (!workspace?.save) exportMarkdown();
    else if (dirty) saveDocument();
  });

  const store = useMemo(() => opened
    ? new StaticDeckStore(opened.path, opened.text, bound ? parseOnServer : buildAst)
    : undefined, [bound, opened]);

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    setRenderError('');
    const timer = window.setTimeout(async () => {
      try {
        const result = await (bound ? renderOnServer : renderMarkdown)(content, theme);
        if (cancelled) return;
        const output = await embedWorkspaceImages(result.html, opened.workspace, opened.path);
        if (!cancelled) {
          setRendered({ ...output, documentId: opened.id, content, theme, slideCount: result.slideCount });
        }
      } catch (cause) {
        if (!cancelled) setRenderError(cause instanceof Error ? cause.message : String(cause));
      }
    }, content === opened.text ? 0 : 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bound, content, opened, theme]);

  function updateContent(text: string) {
    latestContent.current = text;
    setContent(text);
  }

  function canReplace() {
    return latestContent.current === savedContent
      || window.confirm('当前 Markdown 有未保存的修改。是否放弃修改并打开其他文件？');
  }

  async function replaceDocument(text: string, path: string, folder?: Workspace) {
    if (opened && !canReplace()) return;
    if (!opened && session.current && !await session.current.flush()) {
      throw new Error('当前稿件保存失败，请保存后再切换。');
    }
    const normalized = text.replace(/\r\n?/g, '\n');
    setOpened({ id: nextDocumentId.current++, path, text: normalized, workspace: folder });
    updateContent(normalized);
    setSavedContent(normalized);
    setTheme('');
  }

  function returnToBound() {
    if (!canReplace()) return;
    setOpened(undefined);
    updateContent('');
    setSavedContent('');
    setFileError('');
  }

  function openMarkdown(file?: File) {
    if (!file) return;
    if (fileInput.current) fileInput.current.value = '';
    void handleFileAction(async () => {
      if (!markdownFile.test(file.name)) throw new Error('请选择 .md、.markdown 或 .txt 文件');
      await replaceDocument(await file.text(), file.name);
    });
  }

  async function handleFileAction(action: () => Promise<void>) {
    if (fileAction.current) return;
    fileAction.current = true;
    setFileBusy(true);
    setFileError('');
    try {
      await action();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFileError(error instanceof Error ? error.message : String(error));
    } finally {
      fileAction.current = false;
      setFileBusy(false);
    }
  }

  async function openDocument(folder: Workspace, path: string) {
    const file = await folder.read(path);
    if (!file) throw new Error('找不到选中的 Markdown 文件');
    await replaceDocument(await file.text(), path, folder);
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
    void handleFileAction(async () => {
      const root = await picker.call(window, { mode: 'readwrite' }).catch((cause: unknown) => {
        if (!(cause instanceof DOMException) || !['SecurityError', 'NotAllowedError'].includes(cause.name)) throw cause;
        folderInput.current?.click();
        return undefined;
      });
      if (!root) return;
      await openWorkspace(await workspaceFromDirectory(root));
    });
  }

  function importWorkspace(files: FileList | null) {
    if (!files?.length) return;
    const folder = workspaceFromFiles(files);
    if (folderInput.current) folderInput.current.value = '';
    void handleFileAction(() => openWorkspace(folder));
  }

  function saveDocument() {
    const save = workspace?.save;
    if (!save) return;
    void handleFileAction(async () => {
      await save(documentPath, content);
      setSavedContent(content);
    });
  }

  function exportMarkdown() {
    downloadText(filename, content, 'text/markdown;charset=utf-8');
  }

  let statusText = '渲染中…';
  if (fileBusy) statusText = '正在处理本地文件…';
  else if (fileError) statusText = fileError;
  else if (renderError) statusText = `渲染失败：${renderError}`;
  else if (currentRender) {
    statusText = preview.missing.length
      ? `就绪 · 缺少 ${preview.missing.length} 张图片 (${preview.missing.join(', ')})`
      : `就绪 · ${preview.slideCount} 页`;
  }

  return (
    <Workbench
      key={opened?.id ?? 'bound'}
      viewKey={opened ? (opened.id === 0 ? 'sample' : `browser:${workspace?.name ?? ''}/${documentPath}`) : undefined}
      staticMode={Boolean(opened)}
      store={store}
      sessionRef={session}
      onDocChange={opened ? updateContent : undefined}
      previewSrcDoc={preview?.previewHtml}
      standaloneHtml={currentRender ? preview.html : undefined}
      staticStatusText={opened || fileError || fileBusy ? statusText : undefined}
      workspaceSelect={
        workspace && workspace.documents.length > 0 ? (
          <div className="open-file">
            <select
              aria-label="工作文件夹中的 Markdown"
              title={workspace.name}
              value={documentPath}
              className="button workspace-select"
              disabled={fileBusy}
              onChange={(event) => {
                const path = event.currentTarget.value;
                void handleFileAction(() => openDocument(workspace, path));
              }}
            >
              {workspace.documents.map((doc) => (
                <option key={doc} value={doc}>{doc}</option>
              ))}
            </select>
          </div>
        ) : null
      }
      fileActions={
        <div className="file-actions">
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,.txt"
            hidden
            onChange={(event) => openMarkdown(event.target.files?.[0])}
          />
          <button type="button" className="button" disabled={fileBusy} onClick={() => fileInput.current?.click()}
            title={`打开本地 Markdown（${shortcutText(shortcuts.openMarkdown)}）`}>
            <FileText size={15} /><span>打开 Markdown</span>
          </button>
          <input
            ref={folderInput}
            type="file"
            {...{ webkitdirectory: '' }}
            hidden
            onChange={(event) => importWorkspace(event.target.files)}
          />
          <button type="button" className="button open-workspace" disabled={fileBusy} onClick={chooseWorkspace}
            title={`打开包含 Markdown 与图片的本地文件夹（${shortcutText(shortcuts.openWorkspace)}）`}>
            <FolderOpen size={15} /><span>打开工作文件夹</span>
          </button>
          {bound && opened && (
            <button type="button" className="button" disabled={fileBusy} onClick={returnToBound}>
              <ChevronLeft size={15} /><span>返回启动稿件</span>
            </button>
          )}
        </div>
      }
      headerActions={opened && (
        <>
          {workspace?.save && (
            <button type="button" className="button" disabled={fileBusy || !dirty} onClick={saveDocument}
              title={`直接写回本地文件（${shortcutText(shortcuts.save)}）`}>
              <Save size={15} /><span>保存到本地</span>
            </button>
          )}
          {dirty && (
            <span style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 500 }}>
              未保存
            </span>
          )}
          <button type="button" className="button" onClick={exportMarkdown} title="导出 Markdown 源码文件">
            <span>导出 .md</span>
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
              <option value="">跟随 Markdown 主题</option>
              {themes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
        </>
      )}
      onPresent={opened ? (page) => {
        if (!currentRender) return;
        const blob = new Blob([preview.html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(`${url}#/${page}`, '_blank');
      } : undefined}
    />
  );
}
