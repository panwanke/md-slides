import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Presentation, Save } from 'lucide-react';
import Workbench from '../App';
import type { EditorSession } from '../editorSession';
import { buildAst, listThemes, renderMarkdown } from '../render/pyodideEngine';
import { listServerThemes, parseOnServer, renderOnServer } from '../render/serverEngine';
import { downloadText } from '../render/download';
import { embedWorkspaceImages } from '../render/workspaceImages';
import { hasAccess, identifySource, readSession, requestAccess, useRecentHistory, writeSession } from '../store/recent';
import type { RecentSource, RecentVisit, SessionState } from '../store/recent';
import { useFileWatcher } from '../store/fileWatcher';
import { StaticDeckStore } from '../store/staticStore';
import type { WorkbenchView } from '../store/workbenchView';
import { markdownFile, workspaceFromDirectory, workspaceFromFiles } from '../store/workspace';
import type { DirectoryPicker, Workspace, WorkspaceDirectoryHandle } from '../store/workspace';
import { shortcutText, useShortcut, useShortcuts } from '../shortcuts';
import { FileMenu, WorkspaceTabs } from './WorkspaceNavigation';

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

## 结构图表与公式

内置 Pele 图表引擎与 KaTeX，直接书写流程图与数学公式：

\`\`\`mermaid
flowchart LR
    A[Markdown 书写] --> B[实时交互预览]
    B --> C[单文件脱网导出]
\`\`\`

---

## 数据去哪了

文件在浏览器内读取。编辑后请保存到本地或导出。

::: notes
真正的多人使用与云端保存，请用自建服务版本。
:::
`;

interface DraftDocument {
  id: number;
  path: string;
  content: string;
  savedContent: string;
  theme: string;
  store: StaticDeckStore;
  view: { current: WorkbenchView | undefined };
  handle?: FileSystemFileHandle;
}

interface StudioTab {
  id: number;
  label: string;
  hint?: string;
  source?: RecentSource;
  workspace?: Workspace;
  path: string;
  documents: DraftDocument[];
}

interface Reopen {
  visit: RecentVisit;
  project: boolean;
}

type MarkdownPicker = (options: {
  multiple: boolean;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle[]>;

const pickerFallback = (error: unknown) =>
  error instanceof DOMException && ['SecurityError', 'NotAllowedError'].includes(error.name);

function draft(id: number, path: string, text: string, parse: typeof buildAst,
  handle?: FileSystemFileHandle): DraftDocument {
  const content = text.replace(/\r\n?/g, '\n');
  return {
    id, path, content, savedContent: content, theme: '',
    store: new StaticDeckStore(path, content, parse),
    view: { current: undefined }, handle,
  };
}

const isDirty = (document: DraftDocument) => document.content !== document.savedContent;

function initialTab(boundPath?: string): StudioTab {
  if (boundPath) {
    const label = boundPath.split(/[/\\]/).pop() || boundPath;
    return { id: 0, label, hint: boundPath, path: '', documents: [] };
  }
  return {
    id: 0, label: 'sample.md', path: 'sample.md',
    documents: [draft(0, 'sample.md', SAMPLE, buildAst)],
  };
}

export default function WorkspaceStudio({ boundPath }: { boundPath?: string }) {
  const bound = Boolean(boundPath);
  const [tabs, setTabs] = useState(() => [initialTab(boundPath)]);
  const [activeId, setActiveId] = useState(0);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [externalChange, setExternalChange] = useState(false);
  const [pendingSession, setPendingSession] = useState<SessionState>();
  const [rendered, setRendered] = useState<(Awaited<ReturnType<typeof embedWorkspaceImages>> & {
    documentId: number;
    content: string;
    theme: string;
    slideCount: number;
  })>();
  const [themes, setThemes] = useState<string[]>([]);
  const [renderError, setRenderError] = useState('');
  const { history, getHistory, remember } = useRecentHistory();
  const pendingPick = useRef<Reopen>();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const fileAction = useRef(false);
  const focusTab = useRef(false);
  const session = useRef<EditorSession>();
  const nextId = useRef(1);
  const sessionReady = useRef(false);
  const tabsRef = useRef(tabs);
  const openedRef = useRef<DraftDocument | undefined>();
  const getHistoryRef = useRef(getHistory);
  const tab = tabs.find((item) => item.id === activeId);
  const opened = tab?.documents.find((document) => document.path === tab.path);
  tabsRef.current = tabs;
  openedRef.current = opened;
  getHistoryRef.current = getHistory;
  const { id: documentId, path = '', content = '', theme = '' } = opened ?? {};
  const workspace = tab?.workspace;
  const dirty = Boolean(opened && isDirty(opened));
  const hasUnsavedTabs = tabs.some((item) => item.documents.some(isDirty));
  const preview = rendered?.documentId === documentId ? rendered : undefined;
  const currentRender = preview?.content === content && preview.theme === theme;
  const filename = path.split('/').pop() || 'deck.md';
  const parse = bound ? parseOnServer : buildAst;

  useEffect(() => {
    if (!hasUnsavedTabs) return;
    function preventUnsavedClose(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = true;
    }
    window.addEventListener('beforeunload', preventUnsavedClose);
    return () => window.removeEventListener('beforeunload', preventUnsavedClose);
  }, [hasUnsavedTabs]);

  useEffect(() => {
    void (bound ? listServerThemes() : listThemes()).then(setThemes).catch(() => setThemes([]));
  }, [bound]);

  useFileWatcher(opened?.handle, () => {
    const doc = openedRef.current;
    if (!doc?.handle || fileAction.current) return;
    void doc.handle.getFile().then(async (file) => {
      const disk = (await file.text()).replace(/\r\n?/g, '\n');
      if (disk === doc.content) return;
      const target = tabsRef.current.find((item) => item.documents.some((entry) => entry.id === doc.id));
      if (!target) return;
      if (isDirty(doc)) setExternalChange(true);
      else reloadDocument(target, doc, disk);
    }).catch(() => undefined);
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let saved: SessionState | undefined;
      try { saved = await readSession(); } catch { /* IndexedDB unavailable: skip restore */ }
      if (cancelled || !saved?.tabs.length) { sessionReady.current = true; return; }
      const { markdown, projects } = await getHistoryRef.current();
      if (cancelled) return;
      const visits = [...markdown, ...projects];
      const needed = saved.tabs
        .map((entry) => visits.find((visit) => visit.source.id === entry.sourceId))
        .filter((visit): visit is RecentVisit => Boolean(visit));
      if (!needed.length) { sessionReady.current = true; return; }
      const allowed = await Promise.all(needed.map((visit) =>
        hasAccess(visit.source.handle, visit.source.kind === 'project' ? 'readwrite' : 'read')));
      if (cancelled) return;
      if (allowed.every(Boolean)) await restoreSession(saved);
      else setPendingSession(saved);
      sessionReady.current = true;
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!sessionReady.current) return;
    const entries = tabs.filter((item) => item.source).map((item) => ({
      sourceId: item.source!.id, path: item.path, label: item.label,
    }));
    const activeSourceId = tabs.find((item) => item.id === activeId)?.source?.id;
    void writeSession({ tabs: entries, activeSourceId }).catch(() => undefined);
  }, [tabs, activeId]);

  const { shortcuts } = useShortcuts();
  useShortcut('openMarkdown', true, chooseMarkdown);
  useShortcut('openWorkspace', true, chooseWorkspace);
  useShortcut('save', Boolean(opened), () => {
    if (fileAction.current) return;
    if (workspace?.save) saveDocument();
    else exportMarkdown();
  });

  useEffect(() => {
    if (documentId === undefined) return;
    let cancelled = false;
    setRenderError('');
    const timer = window.setTimeout(async () => {
      try {
        const result = await (bound ? renderOnServer : renderMarkdown)(content, theme);
        if (cancelled) return;
        const output = await embedWorkspaceImages(result.html, workspace, path);
        if (!cancelled) setRendered({ ...output, documentId, content, theme, slideCount: result.slideCount });
      } catch (cause) {
        if (!cancelled) setRenderError(cause instanceof Error ? cause.message : String(cause));
      }
    }, dirty ? 300 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bound, documentId, content, theme, path, workspace, dirty]);

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

  async function flushStartup() {
    if (!opened && session.current && !await session.current.flush()) {
      throw new Error('启动稿件保存失败，请保存后再切换。');
    }
  }

  function reloadDocument(target: StudioTab, doc: DraftDocument, text: string) {
    const next = draft(nextId.current++, doc.path, text, parse, doc.handle);
    next.theme = doc.theme;
    setTabs((current) => current.map((item) => item.id === target.id ? {
      ...item,
      documents: item.documents.map((entry) => entry.id === doc.id ? next : entry),
    } : item));
    setExternalChange(false);
    setFileError('');
  }

  function reloadFromDisk() {
    const doc = openedRef.current;
    if (!doc?.handle) return;
    const target = tabsRef.current.find((item) => item.documents.some((entry) => entry.id === doc.id));
    if (!target) return;
    if (isDirty(doc) && !window.confirm('重新载入会丢弃当前未保存的修改，继续吗？')) return;
    void handleFileAction(async () => {
      const file = await doc.handle!.getFile();
      reloadDocument(target, doc, (await file.text()).replace(/\r\n?/g, '\n'));
    });
  }

  function selectTab(id: number, restoreFocus = false) {
    if (id === activeId || fileAction.current) return;
    function activate() {
      focusTab.current = restoreFocus;
      setFileError('');
      setActiveId(id);
      const next = tabs.find((item) => item.id === id);
      if (next?.source) remember([{ source: next.source, path: next.path }]);
    }
    if (opened) activate();
    else void handleFileAction(async () => {
      await flushStartup();
      activate();
    });
  }

  function closeTab(id: number) {
    if (fileAction.current) return;
    const index = tabs.findIndex((item) => item.id === id);
    const closing = tabs[index];
    if (!closing) return;
    if (closing.documents.some(isDirty)
        && !window.confirm(`「${closing.label}」有未保存的修改。是否放弃修改并关闭标签？`)) return;
    setTabs((current) => current.filter((item) => item.id !== id));
    if (id === activeId) {
      focusTab.current = true;
      setActiveId(tabs[index + 1]?.id ?? tabs[index - 1]?.id ?? -1);
      setFileError('');
    }
  }

  async function addTabs(next: StudioTab[]) {
    await flushStartup();
    setTabs((current) => [...current, ...next.filter((item) => !current.some((existing) => item.id === existing.id))]);
    focusTab.current = true;
    setActiveId(next[next.length - 1].id);
    remember(next.flatMap((item) => item.source ? [{ source: item.source, path: item.path }] : []));
  }

  async function knownSources() {
    const { markdown, projects } = await getHistory();
    return [
      ...tabs.flatMap((item) => item.source ? [item.source] : []),
      ...projects.map(({ source }) => source),
      ...markdown.map(({ source }) => source),
    ];
  }

  function chooseMarkdown(reopen?: Reopen) {
    if (fileAction.current) return;
    const picker = (window as Window & { showOpenFilePicker?: MarkdownPicker }).showOpenFilePicker;
    function pickInput() {
      pendingPick.current = reopen;
      fileInput.current?.click();
    }
    if (!picker) {
      pickInput();
      return;
    }
    void handleFileAction(async () => {
      const handles = await picker.call(window, {
        multiple: !reopen,
        types: [{ description: 'Markdown', accept: { 'text/plain': ['.md', '.markdown', '.txt'] } }],
      }).catch((error: unknown) => {
        if (!pickerFallback(error)) throw error;
        pickInput();
        return [];
      });
      if (handles.length) {
        const files = await Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })));
        await openMarkdownEntries(files, reopen);
      }
    });
  }

  async function openMarkdownEntries(entries: { file: File; handle?: FileSystemFileHandle }[], reopen?: Reopen) {
    const expected = reopen?.visit.source;
    const selected = expected ? entries.filter(({ file }) => file.name === expected.name) : entries;
    if (expected && selected.length !== 1) throw new Error(`请选择「${expected.name}」`);
    if (selected.some(({ file }) => !markdownFile.test(file.name))) {
      throw new Error('请选择 .md、.markdown 或 .txt 文件');
    }
    const known = await knownSources();
    const next = await Promise.all(selected.map(async ({ file, handle }) => {
      const source = await identifySource({ kind: 'markdown', name: file.name, handle }, known, expected);
      const existing = tabs.find((item) => item.source?.id === source.id);
      if (existing) return existing;
      const id = nextId.current++;
      const document = draft(id, file.name, await file.text(), parse, handle);
      return { id, label: file.name, path: file.name, source, documents: [document] };
    }));
    await addTabs(next);
  }

  function openMarkdown(files: FileList | null) {
    const reopen = pendingPick.current;
    pendingPick.current = undefined;
    const selected = Array.from(files ?? [], (file) => ({ file }));
    if (fileInput.current) fileInput.current.value = '';
    if (selected.length) void handleFileAction(() => openMarkdownEntries(selected, reopen));
  }

  async function readDocument(folder: Workspace, path: string) {
    const file = await folder.read(path);
    if (!file) throw new Error('找不到选中的 Markdown 文件');
    return draft(nextId.current++, path, await file.text(), parse, folder.handleFor?.(path));
  }

  async function openWorkspace(folder: Workspace, handle?: WorkspaceDirectoryHandle, reopen?: Reopen) {
    const expected = reopen?.visit.source;
    const name = folder.name || '工作文件夹';
    if (expected && name !== expected.name) throw new Error(`请选择项目「${expected.name}」`);
    const source = await identifySource({ kind: 'project', name, handle }, await knownSources(), expected);
    const existing = tabs.find((item) => item.source?.id === source.id);
    const previous = (await getHistory()).projects.find((visit) => visit.source.id === source.id);
    const requested = reopen?.visit.path ?? existing?.path ?? previous?.path;
    const documents = existing?.workspace?.documents ?? folder.documents;
    if (reopen && !reopen.project && requested && !documents.includes(requested)) {
      throw new Error(`项目中找不到「${requested}」`);
    }
    const path = requested && documents.includes(requested) ? requested : documents[0];
    if (!path) throw new Error('工作文件夹内没有 Markdown 文件');
    if (existing) {
      await showProjectDocument(existing, path);
    } else {
      const document = await readDocument(folder, path);
      await addTabs([{ id: document.id, label: name, path, source, workspace: folder, documents: [document] }]);
    }
  }

  function chooseWorkspace(reopen?: Reopen) {
    if (fileAction.current) return;
    const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
    function pickInput() {
      pendingPick.current = reopen;
      folderInput.current?.click();
    }
    if (!picker) {
      pickInput();
      return;
    }
    void handleFileAction(async () => {
      const root = await picker.call(window, { mode: 'readwrite' }).catch((cause: unknown) => {
        if (!pickerFallback(cause)) throw cause;
        pickInput();
        return undefined;
      });
      if (root) await openWorkspace(await workspaceFromDirectory(root), root, reopen);
    });
  }

  function importWorkspace(files: FileList | null) {
    const reopen = pendingPick.current;
    pendingPick.current = undefined;
    if (!files?.length) return;
    const folder = workspaceFromFiles(files);
    if (folderInput.current) folderInput.current.value = '';
    void handleFileAction(() => openWorkspace(folder, undefined, reopen));
  }

  async function showProjectDocument(target: StudioTab, nextPath: string) {
    const loaded = target.documents.find((document) => document.path === nextPath);
    const next = loaded ?? await readDocument(target.workspace!, nextPath);
    await flushStartup();
    setTabs((current) => current.map((item) => item.id === target.id ? {
      ...item, path: nextPath, documents: loaded ? item.documents : [...item.documents, next],
    } : item));
    if (target.id !== activeId || target.path !== nextPath) {
      focusTab.current = true;
      setActiveId(target.id);
    }
    if (target.source) remember([{ source: target.source, path: nextPath }]);
  }

  function selectDocument(nextPath: string) {
    if (!tab || !workspace || fileAction.current || nextPath === path) return;
    void handleFileAction(() => showProjectDocument(tab, nextPath));
  }

  function openRecent(visit: RecentVisit, project: boolean) {
    if (fileAction.current) return;
    void handleFileAction(() => openVisit(visit, project));
  }

  async function openVisit(visit: RecentVisit, project: boolean) {
    const { source } = visit;
    const existing = tabs.find((item) => item.source?.id === source.id);
    if (existing) {
      if (source.kind === 'project' && !project) {
        await showProjectDocument(existing, visit.path);
      } else {
        selectTab(existing.id, true);
      }
      return;
    }

    const reopen = { visit, project };
    const handle = source.handle;
    if (!handle) {
      if (source.kind === 'project') chooseWorkspace(reopen);
      else chooseMarkdown(reopen);
      return;
    }

    try {
      const mode = source.kind === 'project' ? 'readwrite' : 'read';
      if (!await requestAccess(handle, mode)) {
        throw new DOMException('File access denied', 'NotAllowedError');
      }
      if (source.kind === 'project' && source.handle) {
        await openWorkspace(await workspaceFromDirectory(source.handle), source.handle, reopen);
      } else if (source.kind === 'markdown' && source.handle) {
        await openMarkdownEntries([{ file: await source.handle.getFile(), handle: source.handle }], reopen);
      }
    } catch (error) {
      if (pickerFallback(error) || (error instanceof DOMException && error.name === 'NotFoundError')) {
        throw new Error(`无法读取「${source.name}」，请用「文件」菜单重新选择。`);
      }
      throw error;
    }
  }

  async function restoreSession(saved: SessionState) {
    const { markdown, projects } = await getHistory();
    const visits = [...markdown, ...projects];
    let count = 0;
    for (const entry of saved.tabs) {
      const base = visits.find((item) => item.source.id === entry.sourceId);
      if (!base) continue;
      try {
        await openVisit({ ...base, path: entry.path }, base.source.kind === 'project');
        count++;
      } catch {
        // Skip sources whose handles are no longer usable.
      }
    }
    if (count) setTabs((current) => current.filter((item) => item.source || item.id !== 0));
  }

  function updateDocument(changes: Partial<Pick<DraftDocument, 'content' | 'savedContent' | 'theme'>>) {
    if (!tab) return;
    setTabs((current) => current.map((item) => item.id === tab.id ? {
      ...item,
      documents: item.documents.map((document) => document.id === documentId ? { ...document, ...changes } : document),
    } : item));
  }

  function saveDocument() {
    if (!workspace?.save || !dirty) return;
    const save = workspace.save;
    const text = session.current?.documentText() ?? content;
    void handleFileAction(async () => {
      await save(path, text);
      updateDocument({ savedContent: text });
    });
  }

  function exportMarkdown() {
    downloadText(filename, session.current?.documentText() ?? content, 'text/markdown;charset=utf-8');
  }

  const fileActions = (
    <FileMenu busy={fileBusy} onMarkdown={chooseMarkdown} onWorkspace={chooseWorkspace}
      history={history} onRecent={openRecent}>
      <input ref={fileInput} type="file" accept=".md,.markdown,.txt" multiple hidden
        onChange={(event) => openMarkdown(event.currentTarget.files)} />
      <input ref={folderInput} type="file" {...{ webkitdirectory: '' }} hidden
        onChange={(event) => importWorkspace(event.currentTarget.files)} />
    </FileMenu>
  );

  if (!tab) {
    return (
      <div className="studio studio-empty">
        <header className={`app-bar${bound ? '' : ' app-bar-static'}`}>
          <div className="brand"><span className="brand-mark"><Presentation size={19} strokeWidth={1.8} /></span>
            <span>Slide Studio</span></div>
          {fileActions}
        </header>
        <div className="workspace-empty">
          <FolderOpen size={30} strokeWidth={1.4} />
          <p>还没有打开的稿件</p>
          <span>用「文件」菜单打开 Markdown 或工作文件夹，或按 Ctrl/⌘ + O</span>
        </div>
      </div>
    );
  }

  let statusText = '渲染中…';
  if (fileBusy) statusText = '正在处理本地文件…';
  else if (fileError) statusText = fileError;
  else if (renderError) statusText = `渲染失败：${renderError}`;
  else if (currentRender) {
    statusText = `就绪 · ${preview.slideCount} 页`;
  }

  return (
    <Workbench
      key={documentId ?? 'bound'}
      viewKey={opened ? (opened.id === 0 ? 'sample' : `browser:${workspace?.name ?? ''}/${path}`) : undefined}
      viewState={opened?.view}
      staticMode={Boolean(opened)}
      store={opened?.store}
      sessionRef={session}
      onDocChange={opened ? (text) => {
        opened.store.updateDraft(text);
        updateDocument({ content: text });
      } : undefined}
      previewSrcDoc={preview?.previewHtml}
      standaloneHtml={currentRender ? preview.html : undefined}
      staticStatusText={opened || fileError || fileBusy ? statusText : undefined}
      missingAssets={currentRender && preview.missing.length ? preview.missing : undefined}
      activeTabId={`workspace-tab-${activeId}`}
      tabBar={
        <>
          {(externalChange || pendingSession) && (
            <div className="workspace-notices">
              {pendingSession && (
                <div className="workspace-notice" role="status">
                  <span>上次打开了 {pendingSession.tabs.length} 个文件</span>
                  <button type="button" className="button" onClick={() => {
                    const saved = pendingSession;
                    setPendingSession(undefined);
                    void handleFileAction(() => restoreSession(saved))
                      .finally(() => { sessionReady.current = true; });
                  }}>恢复会话</button>
                  <button type="button" className="button" onClick={() => {
                    setPendingSession(undefined);
                    void writeSession({ tabs: [] }).catch(() => undefined);
                  }}>忽略</button>
                </div>
              )}
              {externalChange && (
                <div className="workspace-notice" role="status">
                  <span>本地文件已在外部修改</span>
                  <button type="button" className="button" onClick={reloadFromDisk}>重新载入</button>
                  <button type="button" className="button" onClick={() => setExternalChange(false)}>忽略</button>
                </div>
              )}
            </div>
          )}
          <div className="workspace-bar">
            <WorkspaceTabs tabs={tabs.map((item) => ({
              id: item.id, label: item.label, hint: item.hint, folder: Boolean(item.workspace),
              dirty: item.documents.some(isDirty), closable: !bound || item.id !== 0,
            }))} activeId={activeId} busy={fileBusy} focusTab={focusTab} onSelect={selectTab} onClose={closeTab} />
            {workspace && (
              <div className="workspace-files">
                <select aria-label="工作文件夹中的 Markdown" title={`${workspace.name}/${path}`}
                  className="button workspace-select" value={path} disabled={fileBusy}
                  onChange={(event) => selectDocument(event.currentTarget.value)}>
                  {workspace.documents.map((doc) => (
                    <option key={doc} value={doc}>
                      {doc}{tab.documents.some((item) => item.path === doc && isDirty(item)) ? ' ●' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </>
      }
      fileActions={fileActions}
      headerActions={opened && (
        <>
          {workspace?.save && (
            <button type="button" className="button" disabled={fileBusy || !dirty} onClick={saveDocument}
              title={`直接写回本地文件（${shortcutText(shortcuts.save)}）`}>
              <Save size={15} /><span>保存到本地</span>
            </button>
          )}
          {bound && (
            <button type="button" className="button" onClick={exportMarkdown} title="导出 Markdown 源码文件">
              <span>导出 .md</span>
            </button>
          )}
          {themes.length > 0 && (
            <select aria-label="主题" value={theme} className="button theme-select" title="切换全局演示主题"
              onChange={(event) => updateDocument({ theme: event.target.value })}>
              <option value="">跟随 Markdown 主题</option>
              {themes.map((name) => <option key={name} value={name}>{name}</option>)}
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
