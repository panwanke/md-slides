import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, MutableRefObject, PointerEvent } from 'react';
import {
  ArrowUpRight, Check, ChevronsUpDown, ChevronDown, ChevronLeft, ChevronRight, Code2, Columns,
  Copy, Download, FileText, Film, FolderUp, Image as ImageIcon, List, Monitor, PanelTop, Plus, Presentation, Save,
  StickyNote, Trash2, Upload, X,
} from 'lucide-react';
import { EditorSession } from './editorSession';
import type { Deck, EditorSelection, Mode, PreviewClick, SaveStatus, SlideSummary } from './editorSession';
import { layouts } from './slideSyntax';
import { LocalFileStore } from './store/localFile';
import { deckApi } from './store/remote';
import type { DeckAsset } from './store/remote';
import type { DeckStore } from './store/types';
import { mediaFile } from './store/workspace';
import { readWorkbenchView, writeWorkbenchView } from './store/workbenchView';
import type { Pane, WorkbenchView } from './store/workbenchView';
import { shortcutText, useShortcut, useShortcuts } from './shortcuts';
import ProjectControls from './ui/ProjectControls';
import { downloadText } from './render/download';
import { exportServerDeck } from './render/serverEngine';
import './workbench.css';

export interface WorkbenchProps {
  /** Storage implementation. Omitted in local-file mode. */
  store?: DeckStore;
  deckId?: number;
  /** iframe source for the embedded preview. */
  previewUrl?: string;
  /** Full-screen presentation URL (without the `#/page` fragment). */
  presentUrl?: string;
  /** When provided, the header offers a way back to the deck library. */
  onExit?: () => void;
  userLabel?: string;
  /** Static mode options (for GitHub Pages / pure client) */
  staticMode?: boolean;
  /** Client-side Pyodide preview with cloud persistence (no FastAPI preview route). */
  clientRender?: boolean;
  previewSrcDoc?: string;
  standaloneHtml?: string;
  staticStatusText?: string;
  tabBar?: React.ReactNode;
  activeTabId?: string;
  fileActions?: React.ReactNode;
  headerActions?: React.ReactNode;
  onPresent?: (page: number) => void;
  onDocChange?: (content: string) => void;
  sessionRef?: MutableRefObject<EditorSession | undefined>;
  viewKey?: string;
  viewState?: MutableRefObject<WorkbenchView | undefined>;
}

type Split = 'outline' | 'editor';

function assetSnippet(path: string) {
  const destination = path.split('/').map((part) =>
    encodeURIComponent(part).replace(/\(/g, '%28').replace(/\)/g, '%29')).join('/');
  return `![图片](${destination})`;
}

interface PlayerState {
  page: number;
  step: number;
  steps: number;
  total: number;
}

interface DeckPlayer {
  getState: () => PlayerState;
  goTo: (page: number, step?: number) => PlayerState;
  next: () => void;
  previous: () => void;
}

const statusLabels: Record<SaveStatus, string> = {
  loading: '正在加载',
  saved: '已保存',
  pending: '有未保存的修改',
  saving: '正在保存',
  'save-error': '保存失败',
  'load-error': '打开失败',
  conflict: '版本冲突，请刷新页面',
};

const layoutLabels = new Map<string, string>(layouts);
const pageNumber = (page: number) => String(page).padStart(2, '0');

function slideTitle(slide: SlideSummary, deck: Deck) {
  if (slide.layout === 'cover') return deck.frontmatter.md_slide?.title || deck.frontmatter.jc?.title || deck.frontmatter.title || slide.title;
  return slide.title === `Slide ${slide.index}` ? '未命名幻灯片' : slide.title;
}

function player(frame: HTMLIFrameElement | null) {
  return (frame?.contentWindow as (Window & { JCDeck?: DeckPlayer }) | null)?.JCDeck;
}

function readSplit() {
  try {
    const raw = localStorage.getItem('md-slide-studio-workbench-split') || localStorage.getItem('jc-studio-workbench-split') || '{}';
    const saved = JSON.parse(raw);
    return {
      outline: Number.isFinite(saved.outline) ? Math.max(160, Math.min(360, saved.outline)) : 230,
      editor: Number.isFinite(saved.editor) ? Math.min(0.72, Math.max(0.28, saved.editor)) : 0.47,
    };
  } catch {
    return { outline: 230, editor: 0.47 };
  }
}

function PreviewControls({
  page, total, stepped, state, onToggle, onStep, onNavigate,
}: {
  page: number;
  total: number;
  stepped: boolean;
  state: PlayerState | null;
  onToggle: () => void;
  onStep: (delta: number) => void;
  onNavigate: (page: number) => void;
}) {
  return (
    <footer className="preview-footer">
      <div className="preview-steps">
        <button type="button" className="step-toggle" aria-pressed={stepped} onClick={onToggle}
          disabled={!total}>
          <Film size={15} /> 分步
        </button>
        {stepped && state && state.steps > 0 && (
          <div className="step-counter">
            <button type="button" className="icon-button" title="上一步" aria-label="上一步"
              disabled={state.step === 0} onClick={() => onStep(-1)}><ChevronLeft size={15} /></button>
            <span>{state.step}/{state.steps}</span>
            <button type="button" className="icon-button" title="下一步" aria-label="下一步"
              disabled={state.step >= state.steps} onClick={() => onStep(1)}><ChevronRight size={15} /></button>
          </div>
        )}
      </div>
      <div className="preview-pager">
        <button type="button" className="icon-button" title="上一页" aria-label="上一页"
          disabled={page <= 1} onClick={() => onNavigate(page - 1)}><ChevronLeft size={17} /></button>
        <span aria-label={total ? `第 ${page} 页，共 ${total} 页` : '没有幻灯片'}>
          {pageNumber(total ? page : 0)} <span>/</span> {pageNumber(total)}
        </span>
        <button type="button" className="icon-button" title="下一页" aria-label="下一页"
          disabled={page >= total} onClick={() => onNavigate(page + 1)}><ChevronRight size={17} /></button>
      </div>
    </footer>
  );
}

export default function App({
  store,
  deckId,
  previewUrl = '/preview/workbench',
  presentUrl = '/preview/live',
  onExit,
  userLabel,
  staticMode = false,
  clientRender = false,
  previewSrcDoc,
  standaloneHtml,
  staticStatusText,
  tabBar,
  activeTabId,
  fileActions,
  headerActions,
  onPresent,
  onDocChange,
  sessionRef,
  viewKey,
  viewState,
}: WorkbenchProps = {}) {
  const [file, setFile] = useState<{ source: string; fullPath: string; assetBase?: string }>();
  const [deck, setDeck] = useState<Deck>();
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [activePage, setActivePage] = useState(1);
  const [cursor, setCursor] = useState<{ line: number; column: number; layout: string; selection?: EditorSelection }>({
    line: 1, column: 1, layout: '',
  });
  const [mode, setMode] = useState<Mode>('live');
  const [insertMenu, setInsertMenu] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [pane, setPane] = useState<Pane>('editor');
  const [split, setSplit] = useState(readSplit);
  const [stepped, setStepped] = useState(false);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [scale, setScale] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  // Asset management states
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [assetsList, setAssetsList] = useState<DeckAsset[]>([]);
  const [assetUploading, setAssetUploading] = useState(false);
  const [assetError, setAssetError] = useState('');
  const [assetRevision, setAssetRevision] = useState(0);
  const nextAssetRevision = useRef(0);
  const [copiedPath, setCopiedPath] = useState('');
  const assetFileInput = useRef<HTMLInputElement>(null);
  const assetFolderInput = useRef<HTMLInputElement>(null);

  const localSessionRef = useRef<EditorSession>();
  const session = sessionRef ?? localSessionRef;
  const host = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const connectedPreview = useRef<Document | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const workbench = useRef<HTMLElement>(null);
  const outline = useRef<HTMLElement>(null);
  const editorPane = useRef<HTMLElement>(null);
  const active = useRef(1);
  const slideCount = useRef(0);
  const byStep = useRef(false);
  const step = useRef(0);
  const drivingPreview = useRef(false);
  const { shortcuts } = useShortcuts();
  useShortcut('save', !staticMode && Boolean(file), () => void session.current?.save());

  function refreshAssetPreviews() {
    const revision = ++nextAssetRevision.current;
    session.current?.refreshAssets(revision);
    setAssetRevision(revision);
  }

  function drivePreview(page: number, preserveStep = false) {
    if (!preserveStep) step.current = 0;
    const deckPlayer = player(frame.current);
    if (!deckPlayer) return;
    drivingPreview.current = true;
    const state = deckPlayer.goTo(page, byStep.current ? step.current : Number.MAX_SAFE_INTEGER);
    drivingPreview.current = false;
    if (byStep.current) step.current = state.step;
    setPlayerState(state);
  }

  function updatePreviewPage(page: number) {
    active.current = Math.max(1, Math.min(slideCount.current, page));
    setActivePage(active.current);
  }

  function navigatePreview(page: number) {
    updatePreviewPage(page);
    drivePreview(active.current);
  }

  function previewArrows(event: globalThis.KeyboardEvent) {
    if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
        || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || event.isComposing
        || !slideCount.current) return;
    const target = event.target as Element | null;
    if (target?.closest?.('input, select, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const forwards = event.key === 'ArrowRight';
    const deckPlayer = player(frame.current);
    if (byStep.current && deckPlayer) {
      if (forwards) deckPlayer.next();
      else deckPlayer.previous();
    } else {
      navigatePreview(active.current + (forwards ? 1 : -1));
    }
  }

  useEffect(() => {
    function showRevision(revision: number) {
      setPreviewRevision((current) => Math.max(revision, current));
    }

    // Storage seam: swap LocalFileStore for a remote store to move the deck off
    // this machine. Nothing else in the workbench needs to change.
    const editor = new EditorSession(host.current!, {
      onLoad(doc) {
        slideCount.current = doc.ast.slides.length;
        const previous = viewState?.current ?? readWorkbenchView(viewKey ?? doc.fullPath);
        updatePreviewPage(previous?.page ?? 1);
        if (previous) {
          setMode(previous.mode);
          setPane(previous.pane);
          setClosed(new Set(previous.closed));
          byStep.current = previous.stepped;
          step.current = previous.step;
          setStepped(previous.stepped);
        }
        setFile(doc);
        setDeck(doc.ast);
        showRevision(doc.ast.documentRevision);
        return previous;
      },
      onSave(next) {
        slideCount.current = next.slides.length;
        if (active.current > slideCount.current) updatePreviewPage(active.current);
        setDeck(next);
        showRevision(next.documentRevision);
      },
      onStatus: setStatus,
      onChange: onDocChange,
      onCursor(page, line, column, layout, selection, followPreview) {
        setCursor({ line, column, layout, selection });
        if (followPreview && active.current !== page) navigatePreview(page);
      },
    }, store ?? new LocalFileStore());
    session.current = editor;
    void editor.load();

    let disposed = false;
    let socket: WebSocket | undefined;
    let reconnect = 0;
    function connect() {
      if (staticMode || clientRender) return;
      try {
        const url = new URL('/ws', location.href);
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(url);
        socket.onmessage = (event: MessageEvent<string>) => {
          const message = JSON.parse(event.data);
          if (message.type === 'RELOAD' && Number.isInteger(message.revision)) showRevision(message.revision);
        };
        socket.onclose = () => { if (!disposed) reconnect = window.setTimeout(connect, 1000); };
      } catch { /* ignore in static mode */ }
    }
    if (!staticMode && !clientRender) connect();

    function onPreviewMessage(event: MessageEvent<PreviewClick & { type?: string }>) {
      if (event.source !== frame.current?.contentWindow) return;
      if (!staticMode && !clientRender && event.origin !== location.origin) return;
      if (event.data?.type === 'ELEMENT_CLICKED'
          && ['heading', 'text', 'image', 'notes', 'diagram'].includes(event.data.nodeType)) {
        editor.revealElement(event.data);
      }
    }
    function onPaste(event: ClipboardEvent) {
      if (!deckId || !(event.target instanceof Node) || !host.current?.contains(event.target)) return;
      const files = event.clipboardData?.files;
      if (!files?.length) return;
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (!imageFiles.length) return;
      event.preventDefault();
      const formData = new FormData();
      const uploadId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
      for (const [index, img] of imageFiles.entries()) {
        const ext = img.type.split('/')[1].split('+')[0] || 'png';
        const filename = `images/pasted-${uploadId}-${index}.${ext}`;
        formData.append('files', img, filename);
      }
      void deckApi.uploadAssets(deckId, formData).then((res) => {
        if (disposed) return;
        editor.insertText('\n' + res.saved.map((item) => assetSnippet(item.path)).join('\n\n') + '\n');
        refreshAssetPreviews();
        void loadAssets();
      }).catch((error: unknown) => {
        if (!disposed) alert(error instanceof Error ? error.message : '上传失败');
      });
    }

    window.addEventListener('paste', onPaste);
    window.addEventListener('message', onPreviewMessage);
    return () => {
      disposed = true;
      window.clearTimeout(reconnect);
      socket?.close();
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('message', onPreviewMessage);
      editor.destroy();
      if (session.current === editor) session.current = undefined;
    };
  }, [deckId]);

  async function exportHtml() {
    const content = session.current?.documentText();
    if (!file || content === undefined || exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const html = (staticMode || clientRender) ? standaloneHtml : await exportServerDeck(content, file.assetBase);
      if (html !== undefined) {
        const name = file.source.replace(/\.(?:md|markdown|txt)$/i, '') || 'deck';
        downloadText(`${name}.html`, html, 'text/html;charset=utf-8');
      }
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : '无法生成 HTML');
    } finally {
      setExporting(false);
    }
  }

  async function loadAssets() {
    if (!deckId) return;
    try {
      const res = await deckApi.listAssets(deckId);
      setAssetsList(res.assets);
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : '读取附件失败');
    }
  }

  useEffect(() => {
    if (assetsOpen && deckId) {
      setAssetError('');
      void loadAssets();
    }
  }, [assetsOpen, deckId]);

  async function handleAssetUpload(list: FileList | null) {
    if (!list?.length || !deckId) return;
    const files = Array.from(list).filter((file) => mediaFile.test(file.name));
    if (assetFileInput.current) assetFileInput.current.value = '';
    if (assetFolderInput.current) assetFolderInput.current.value = '';
    if (!files.length) {
      setAssetError('选中的文件中没有可上传的图片或附件');
      return;
    }
    setAssetUploading(true);
    setAssetError('');
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file, file.webkitRelativePath || file.name);
      }
      await deckApi.uploadAssets(deckId, formData);
      refreshAssetPreviews();
      await loadAssets();
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setAssetUploading(false);
    }
  }

  async function handleAssetDelete(asset: DeckAsset) {
    if (!confirm(`确认删除「${asset.path}」？`)) return;
    setAssetError('');
    try {
      await deckApi.deleteAsset(asset);
      refreshAssetPreviews();
      await loadAssets();
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : '删除失败');
    }
  }

  function insertAssetSnippet(path: string) {
    session.current?.insertText('\n' + assetSnippet(path) + '\n');
    setAssetsOpen(false);
  }

  function copyAssetSnippet(path: string) {
    const text = assetSnippet(path);
    void navigator.clipboard.writeText(text);
    setCopiedPath(path);
    window.setTimeout(() => setCopiedPath(''), 1800);
  }

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setScale(Math.min(width / 1280, Math.max(0, height - 30) / 720));
    });
    observer.observe(stage.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!insertMenu) return;
    function outside(event: Event) {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) setInsertMenu(false);
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setInsertMenu(false);
        menuTrigger.current?.focus();
      }
    }
    window.addEventListener('pointerdown', outside);
    window.addEventListener('focusin', outside);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('focusin', outside);
      window.removeEventListener('keydown', escape);
    };
  }, [insertMenu]);

  useEffect(() => {
    try { localStorage.setItem('md-slide-studio-workbench-split', JSON.stringify(split)); } catch { /* Optional. */ }
  }, [split]);

  useEffect(() => {
    if (!file) return;
    const state = {
      page: activePage, mode, pane, selection: cursor.selection, closed: [...closed], stepped, step: step.current,
    };
    if (viewState) viewState.current = state;
    writeWorkbenchView(viewKey ?? file.fullPath, state);
  }, [file, viewKey, viewState, activePage, mode, pane, cursor.selection, closed, stepped, playerState?.step]);

  function navigate(page: number) {
    navigatePreview(page);
    session.current?.selectSlide(page);
    if (pane === 'outline') setPane('editor');
  }

  function onPreviewLoad() {
    const document = frame.current?.contentDocument;
    if (!document || !player(frame.current)) {
      setPlayerState(null);
      return;
    }
    if (connectedPreview.current === document) return;
    connectedPreview.current = document;
    document.addEventListener('keydown', previewArrows, true);
    drivePreview(active.current, true);
    document.addEventListener('deck-state', (event) => {
      const next = (event as CustomEvent<PlayerState>).detail;
      setPlayerState(next);
      if (byStep.current) step.current = next.step;
      if (!drivingPreview.current && next.page !== active.current) {
        updatePreviewPage(next.page);
        if (!byStep.current && next.step < next.steps) drivePreview(next.page);
      }
    });
  }

  useEffect(() => {
    if (!file || staticMode || clientRender) return;
    // Fonts and remote images can hold the iframe's load event after the player is ready.
    const deadline = performance.now() + 10_000;
    const timer = window.setInterval(() => {
      const iframe = frame.current;
      if (iframe?.contentDocument?.URL.split('#')[0] === iframe?.src.split('#')[0] && player(iframe)) {
        onPreviewLoad();
        window.clearInterval(timer);
      } else if (performance.now() >= deadline) {
        window.clearInterval(timer);
      }
    }, 60);
    return () => window.clearInterval(timer);
  }, [file, staticMode, previewUrl, previewRevision, assetRevision]);

  function toggleStepped() {
    byStep.current = !byStep.current;
    setStepped(byStep.current);
    drivePreview(active.current);
  }

  function jumpStep(delta: number) {
    const deckPlayer = player(frame.current);
    if (!deckPlayer) return;
    const state = deckPlayer.goTo(active.current, step.current + delta);
    step.current = state.step;
    setPlayerState(state);
  }

  function changeMode(next: Mode) {
    setMode(next);
    session.current?.setMode(next);
  }

  function adjustSplit(which: Split, width: number) {
    const total = workbench.current?.clientWidth ?? 0;
    const side = outline.current?.offsetWidth ?? split.outline;
    if (which === 'outline') {
      const next = Math.round(Math.max(160, Math.min(360, total - 540, width)));
      setSplit((current) => ({ ...current, outline: next }));
    } else {
      const available = total - side - 16;
      if (available <= 0) return;
      const min = Math.min(250, available * 0.4);
      const next = Math.max(min, Math.min(available - min, width)) / available;
      setSplit((current) => ({ ...current, editor: next }));
    }
  }

  function resize(which: Split, event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const left = (which === 'outline' ? outline : editorPane).current?.getBoundingClientRect().left ?? 0;
    adjustSplit(which, event.clientX - left - 4);
  }

  function resizeKey(which: Split, event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const width = (which === 'outline' ? outline : editorPane).current?.getBoundingClientRect().width ?? 0;
    adjustSplit(which, width + (event.key === 'ArrowRight' ? 24 : -24));
  }

  function splitter(which: Split, label: string, id: string, controls: string) {
    return <div className="splitter" id={id} role="separator" tabIndex={0} aria-label={label}
      aria-orientation="vertical" aria-controls={controls}
      aria-valuenow={Math.round(100 * (which === 'outline' ? split.outline / (workbench.current?.clientWidth || 1440) : split.editor))}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.classList.add('dragging');
      }}
      onPointerMove={(event) => resize(which, event)}
      onLostPointerCapture={(event) => event.currentTarget.classList.remove('dragging')}
      onKeyDown={(event) => resizeKey(which, event)} />;
  }

  const total = deck?.slides.length ?? 0;
  const selected = deck?.slides[activePage - 1];
  const allClosed = Boolean(deck?.sections.length) && Boolean(deck?.sections.every(({ id }) => closed.has(id)));
  const gridStyle = {
    '--outline-width': `${split.outline}px`,
    '--editor-share': `${split.editor}fr`,
    '--preview-share': `${1 - split.editor}fr`,
  } as CSSProperties;

  return (
    <div className="studio">
      <header className={`app-bar${tabBar ? ' app-bar-workspace' : ''}${staticMode ? ' app-bar-static' : ''}`}>
        <div className="brand"><span className="brand-mark"><Presentation size={19} strokeWidth={1.8} /></span>
          <span>Slide Studio</span></div>
        {fileActions}
        {!tabBar && <div className="open-file" title={file?.fullPath}><FileText size={16} />
          <span id="fileNameDisplay">{file?.source ?? (status === 'load-error' ? '未加载文件' : '正在打开稿件…')}</span>
        </div>}
        <div className="document-actions">
          {headerActions}
          {onExit && <button type="button" className="button" onClick={onExit} title="返回幻灯片库">
            <ChevronLeft size={16} /><span>幻灯片库</span>
          </button>}
          {userLabel && <span className="user-chip" title={userLabel}>{userLabel}</span>}
          <span id="saveStatus" className={`save-status ${staticMode ? 'studio-status' : ''}`} data-state={status}
            role="status" title={staticStatusText}>
            {staticStatusText || statusLabels[status]}
          </span>
          {!staticMode && (
            <button type="button" className="button save-button" aria-label="保存" title={`保存（${shortcutText(shortcuts.save)}）`}
              disabled={!file || status === 'saving'} onClick={() => void session.current?.save()}>
              <Save size={16} /><span>保存</span>
            </button>
          )}
          {deckId && (
            <button
              type="button"
              className="button"
              onClick={() => setAssetsOpen(true)}
              title="管理幻灯片图片附件与批量上传"
            >
              <ImageIcon size={16} /><span>图片</span>
            </button>
          )}
          <button type="button" className="button" disabled={!file || exporting || ((staticMode || clientRender) && !standaloneHtml)}
            onClick={() => void exportHtml()} title="下载单独的 HTML 演示文件">
            <Download size={16} /><span>{exporting ? '正在导出…' : '导出 HTML'}</span>
          </button>
          {onPresent ? (
            <button type="button" className="button present-button" disabled={!standaloneHtml}
              onClick={() => onPresent(activePage)} title="全屏演示当前幻灯片">
              <Monitor size={16} /><span>演示</span><ArrowUpRight className="external-icon" size={13} />
            </button>
          ) : (
            <a className="button present-button" href={`${presentUrl}#/${activePage}`} target="_blank" rel="noreferrer">
              <Monitor size={16} /><span>演示</span><ArrowUpRight className="external-icon" size={13} />
            </a>
          )}
        </div>
        <ProjectControls />
      </header>
      {tabBar}
      {exportError && <p className="export-error" role="alert">导出失败：{exportError}</p>}

      <nav className="mobile-panes" aria-label="工作区">
        {([{ id: 'outline', label: '大纲', Icon: List }, { id: 'editor', label: '编辑', Icon: FileText },
          { id: 'preview', label: '预览', Icon: Monitor }] as const).map(({ id, label, Icon }) =>
          <button type="button" key={id} aria-pressed={pane === id} onClick={() => setPane(id)}>
            <Icon size={15} />{label}
          </button>)}
      </nav>

      <main className="workbench" id="workbench" data-pane={pane} style={gridStyle} ref={workbench}
        role={activeTabId ? 'tabpanel' : undefined} aria-labelledby={activeTabId}>
        <aside className="outline-pane" id="sidebar" ref={outline} aria-label="幻灯片大纲">
          <div className="pane-bar outline-bar">
            <h2><List size={17} /> 大纲</h2>
            <div className="pane-actions">
              <button type="button" className="icon-button" disabled={!total}
                title={allClosed ? '展开全部章节' : '折叠全部章节'}
                aria-label={allClosed ? '展开全部章节' : '折叠全部章节'}
                onClick={() => setClosed(new Set(allClosed ? [] : deck?.sections.map(({ id }) => id)))}>
                <ChevronsUpDown size={16} />
              </button>
              <button type="button" className="icon-button outline-add" id="insertSlideBtn"
                disabled={!file} title="在当前页后新建幻灯片" aria-label="新建幻灯片"
                onClick={() => { setPane('editor'); session.current?.insert('slide'); }}>
                <Plus size={17} />
              </button>
            </div>
          </div>
          <div className="outline-list" id="slideList">
            {deck?.sections.map((section) => (
              <div className="section-group" key={section.id}>
                <button type="button" className="section-header" aria-expanded={!closed.has(section.id)}
                  aria-controls={`section-${section.id}`}
                  onClick={() => setClosed((previous) => {
                    const next = new Set(previous);
                    if (next.has(section.id)) next.delete(section.id);
                    else next.add(section.id);
                    return next;
                  })}>
                  {closed.has(section.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span className="section-title" title={section.title}>{section.title}</span>
                  <span className="section-count">{section.slides.length}</span>
                </button>
                <div className="section-slides" id={`section-${section.id}`} hidden={closed.has(section.id)}>
                  {section.slides.map((slide) =>
                    <button type="button" key={slide.index} className="slide-item" id={`slide-item-${slide.index}`}
                      aria-current={activePage === slide.index ? 'page' : undefined} onClick={() => navigate(slide.index)}>
                      <span className="slide-index">{pageNumber(slide.index)}</span>
                      <span className="slide-label">
                        <span className="slide-title" title={slideTitle(slide, deck)}>{slideTitle(slide, deck)}</span>
                        <span className="slide-layout">{layoutLabels.get(slide.layout) || (slide.layout === 'normal' ? '自动版式' : slide.layout)}</span>
                      </span>
                    </button>)}
                </div>
              </div>
            ))}
            {deck && !total && <p className="outline-empty">使用 ＋ 新建幻灯片</p>}
          </div>
          <footer className="outline-footer"><span id="slideCount">{total}</span> 页
            <span className="middle-dot" /> <span id="sectionCount">{deck?.sections.length ?? 0}</span> 节</footer>
        </aside>

        {splitter('outline', '调整大纲宽度', 'resizer-1', 'sidebar editorPane')}

        <section className="editor-pane" id="editorPane" ref={editorPane} aria-label="Markdown 编辑区">
          <div className="pane-bar editor-bar">
            <h2>Markdown</h2>
            <div className="pane-actions">
              <div className="insert-menu" ref={menu}>
                <button type="button" className="button insert-trigger" ref={menuTrigger} aria-expanded={insertMenu}
                  aria-controls="insertBlocks" onClick={() => setInsertMenu(!insertMenu)} disabled={!file}>
                  <Plus size={15} /> 插入块 <ChevronDown size={12} />
                </button>
                {insertMenu && (
                  <div className="insert-popover" id="insertBlocks" role="group" aria-label="插入块">
                    {([{ id: 'notes', buttonId: 'insertNotesBtn', label: '演讲讲稿', Icon: StickyNote },
                      { id: 'box', buttonId: 'insertBoxBtn', label: '重点卡片', Icon: PanelTop },
                      { id: 'fragment', buttonId: 'insertFragmentBtn', label: '分步动画', Icon: Film }] as const)
                      .map(({ id, buttonId, label, Icon }) =>
                        <button type="button" id={buttonId} key={id} onClick={() => {
                          setInsertMenu(false);
                          session.current?.insert(id);
                        }}>
                          <Icon size={16} /><span>{label}</span><code>{id}</code>
                        </button>)}
                  </div>
                )}
              </div>
              <div className="mode-control" role="group" aria-label="编辑模式">
                <button type="button" aria-label="实时编辑" aria-pressed={mode === 'live'}
                  onClick={() => changeMode('live')} disabled={!file} title="实时编辑">
                  <FileText size={14} /><span>实时</span>
                </button>
                <button type="button" aria-label="Markdown 源码" aria-pressed={mode === 'source'}
                  onClick={() => changeMode('source')} disabled={!file} title="Markdown 源码">
                  <Code2 size={16} /><span>源码</span>
                </button>
              </div>
            </div>
          </div>
          <div className="editor-host studio-editor" id="editor" data-mode={mode} ref={host} />
          {!file && (
            <div className="editor-empty">
              <FileText size={25} />
              <p>{status === 'load-error' ? '无法打开当前 Markdown 文件' : '正在读取 Markdown…'}</p>
              {status === 'load-error' && <button className="button" type="button"
                onClick={() => { setStatus('loading'); void session.current?.load(); }}>重新加载</button>}
            </div>
          )}
          <footer className="editor-footer">
            <label className="layout-control"><Columns size={15} /><span>当前版式</span>
              <select id="layoutSelect" value={cursor.layout} disabled={!total}
                onChange={(event) => session.current?.setLayout(event.target.value)}>
                {layouts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                {cursor.layout && !layoutLabels.has(cursor.layout) &&
                  <option value={cursor.layout}>{cursor.layout}</option>}
              </select>
            </label>
            <span className="cursor-position">行 {cursor.line} · 列 {cursor.column}</span>
          </footer>
        </section>

        {splitter('editor', '调整编辑器和预览宽度', 'resizer-2', 'editorPane previewPane')}

        <section className="preview-pane" id="previewPane" aria-label="成片预览">
          <div className="pane-bar preview-bar">
            <h2><Monitor size={17} /> 成片预览</h2>
            <span className="preview-ratio">16:9</span>
          </div>
          <div className="preview-stage" role="group" aria-label="预览翻页" tabIndex={0}
            onPointerDown={(event) => {
              if (event.button === 0) event.currentTarget.focus({ preventScroll: true });
            }}
            onKeyDown={(event) => previewArrows(event.nativeEvent)}>
            <div className="frame-fit" ref={stage}>
              {file && <div className="frame-assembly" style={{ width: 1280 * scale }}>
                <div className="frame-box" style={{ height: 720 * scale }}>
                  <iframe
                    id="previewFrame"
                    className="studio-preview"
                    title="当前幻灯片"
                    ref={frame}
                    src={staticMode || clientRender ? undefined : `${previewUrl}?revision=${previewRevision}${deckId ? '&assets=' + assetRevision : ''}`}
                    srcDoc={staticMode || clientRender ? previewSrcDoc : undefined}
                    onLoad={onPreviewLoad}
                    style={{ transform: `scale(${scale})` }}
                  />
                </div>
                {selected && <p className="preview-caption" title={slideTitle(selected, deck!)}>{slideTitle(selected, deck!)}</p>}
              </div>}
            </div>
          </div>
          <PreviewControls page={activePage} total={total} stepped={stepped} state={playerState}
            onToggle={toggleStepped} onStep={jumpStep} onNavigate={navigatePreview} />
        </section>
      </main>

      {/* 图片资源管理器 Modal */}
      {assetsOpen && (
        <div className="assets-modal-overlay" onClick={() => setAssetsOpen(false)}>
          <div className="assets-modal-panel" onClick={(e) => e.stopPropagation()}>
            <header className="assets-modal-header">
              <h2><ImageIcon size={19} /> 图片与附件资源库</h2>
              <button type="button" aria-label="关闭" onClick={() => setAssetsOpen(false)}>
                <X size={16} />
              </button>
            </header>

            <div className="assets-toolbar">
              <input
                ref={assetFileInput}
                type="file"
                multiple
                accept="image/*"
                hidden
                onChange={(e) => void handleAssetUpload(e.target.files)}
              />
              <input
                ref={assetFolderInput}
                type="file"
                multiple
                {...({ webkitdirectory: '', directory: '' } as unknown as object)}
                hidden
                onChange={(e) => void handleAssetUpload(e.target.files)}
              />
              <button
                type="button"
                className="button library-primary"
                disabled={assetUploading}
                onClick={() => assetFileInput.current?.click()}
              >
                <Upload size={15} /> 上传图片
              </button>
              <button
                type="button"
                className="button"
                disabled={assetUploading}
                onClick={() => assetFolderInput.current?.click()}
                title="上传图片文件夹并保留文件夹名称及其子目录"
              >
                <FolderUp size={15} /> 上传图片文件夹
              </button>
              <span style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: 'auto' }}>
                在编辑区粘贴截图 (Ctrl+V) 自动上传并插入
              </span>
            </div>

            {assetError && <p className="library-error" role="alert">{assetError}</p>}
            <div className="assets-grid">
              {assetsList.length === 0 ? (
                <div className="asset-empty">
                  <ImageIcon size={32} strokeWidth={1.5} />
                  <span>当前演示稿暂无上传的图片资源</span>
                  <span style={{ fontSize: '11.5px', color: 'var(--subtle)' }}>
                    点击上方按钮上传单张或整个文件夹图片，或在编辑区直接粘贴截图
                  </span>
                </div>
              ) : (
                assetsList.map((asset) => (
                  <div key={asset.path} className="asset-card">
                    <div className="asset-thumb-box" onClick={() => insertAssetSnippet(asset.path)} title="点击插入到文档">
                      <img src={asset.url} alt={asset.name} loading="lazy" />
                    </div>
                    <div className="asset-info">
                      <span className="asset-name" title={asset.name}>{asset.name}</span>
                      <span className="asset-path" title={asset.path}>{asset.path}</span>
                      <div className="asset-actions">
                        <button
                          type="button"
                          className="button"
                          onClick={() => insertAssetSnippet(asset.path)}
                          title="在光标处插入 Markdown"
                        >
                          插入
                        </button>
                        <button
                          type="button"
                          className="button"
                          onClick={() => copyAssetSnippet(asset.path)}
                          title="复制 Markdown 引用格式"
                        >
                          {copiedPath === asset.path ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                        <button
                          type="button"
                          className="button"
                          onClick={() => void handleAssetDelete(asset)}
                          title="删除图片"
                          style={{ marginLeft: 'auto', color: 'var(--accent-ink)' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
