import { useEffect, useRef, useState } from 'react';
import {
  FileText, FolderOpen, LogOut, Pencil, Plus, Presentation, Search,
  Trash2, Upload, X,
} from 'lucide-react';
import { deckApi } from '../store/remote';
import type { DeckMeta, RevisionMeta } from '../store/remote';
import type { StudioUser } from './Login';

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

export default function Library({
  user, onSignOut,
}: {
  user: StudioUser;
  onSignOut: () => void;
}) {
  const [decks, setDecks] = useState<DeckMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [revisions, setRevisions] = useState<{ deck: DeckMeta; items: RevisionMeta[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      const data = await deckApi.list();
      setDecks(data.decks);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  function create() {
    const title = window.prompt('新演示稿的标题', '未命名演示稿');
    if (title === null) return;
    void run(() => deckApi.create(title.trim() || '未命名演示稿'));
  }

  function rename(deck: DeckMeta) {
    const title = window.prompt('重命名演示稿', deck.title);
    if (title === null || !title.trim() || title.trim() === deck.title) return;
    void run(() => deckApi.rename(deck.id, title.trim()));
  }

  function remove(deck: DeckMeta) {
    if (!window.confirm(`删除「${deck.title}」？\n数据仍保留在数据库中，当前仅从列表移除。`)) return;
    void run(() => deckApi.remove(deck.id));
  }

  async function importFiles(list: FileList | null) {
    if (!list?.length) return;
    const files = await Promise.all(
      Array.from(list)
        .filter((file) => /\.(md|markdown|txt)$/i.test(file.name))
        .map(async (file) => ({ name: file.name, content: await file.text() })),
    );
    if (!files.length) {
      setError('请选择 .md / .markdown / .txt 文件');
      return;
    }
    await run(() => deckApi.importFiles(files));
    if (fileInput.current) fileInput.current.value = '';
  }

  async function showRevisions(deck: DeckMeta) {
    try {
      const data = await deckApi.revisions(deck.id);
      setRevisions({ deck, items: data.revisions });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取版本失败');
    }
  }

  const visible = decks.filter((deck) => deck.title.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="library">
      <header className="library-header">
        <div className="brand"><span className="brand-mark"><Presentation size={19} strokeWidth={1.8} /></span>
          <span>Slide Studio</span></div>
        <div className="library-account">
          <span title={user.email}>{user.displayName || user.email}</span>
          <button type="button" className="button" onClick={onSignOut} title="退出登录">
            <LogOut size={15} /> 退出
          </button>
        </div>
      </header>

      <main className="library-main">
        <div className="library-title-row">
          <div>
            <h1>我的演示稿</h1>
            <p>内容保存在服务端，每次保存都会留下一个完整版本快照。</p>
          </div>
          <div className="library-actions">
            <input ref={fileInput} type="file" multiple accept=".md,.markdown,.txt"
              hidden onChange={(e) => void importFiles(e.target.files)} />
            <button type="button" className="button" disabled={busy}
              onClick={() => fileInput.current?.click()}>
              <Upload size={16} /> 导入本地 .md
            </button>
            <button type="button" className="button library-primary" disabled={busy} onClick={create}>
              <Plus size={16} /> 新建演示稿
            </button>
          </div>
        </div>

        <div className="library-search">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索标题…" />
        </div>

        {error && <p className="library-error" role="alert">{error}</p>}

        {loading ? <p className="library-empty">正在读取…</p>
          : visible.length === 0 ? (
            <div className="library-empty">
              <FolderOpen size={30} />
              <p>{query ? '没有匹配的演示稿' : '还没有演示稿，新建一个或导入本地 .md 文件'}</p>
            </div>
          ) : (
            <ul className="deck-grid">
              {visible.map((deck) => (
                <li key={deck.id} className="deck-card">
                  <button type="button" className="deck-open" onClick={() => { location.hash = `#/deck/${deck.id}`; }}>
                    <span className="deck-card-icon"><FileText size={20} /></span>
                    <strong title={deck.title}>{deck.title}</strong>
                    <span className="deck-card-meta">
                      {deck.slideCount} 页 · v{deck.revision} · {formatDate(deck.updatedAt)}
                    </span>
                  </button>
                  <div className="deck-card-actions">
                    <button type="button" title="重命名" aria-label="重命名"
                      onClick={() => rename(deck)}><Pencil size={14} /></button>
                    <button type="button" title="版本历史" aria-label="版本历史"
                      onClick={() => void showRevisions(deck)}>版本</button>
                    <button type="button" title="删除" aria-label="删除"
                      onClick={() => remove(deck)}><Trash2 size={14} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </main>

      {revisions && (
        <div className="revision-overlay" onClick={() => setRevisions(null)}>
          <div className="revision-panel" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>版本历史 · {revisions.deck.title}</h2>
              <button type="button" aria-label="关闭" onClick={() => setRevisions(null)}><X size={16} /></button>
            </header>
            <p className="revision-note">每次保存生成一个完整快照，最近 50 个版本可见。</p>
            <ul>
              {revisions.items.map((item) => (
                <li key={item.revision}>
                  <strong>v{item.revision}</strong>
                  <span>{formatDate(item.createdAt)}</span>
                  <span>{Math.round(item.bytes / 1024 * 10) / 10} KB</span>
                  {item.note && <em>{item.note}</em>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
