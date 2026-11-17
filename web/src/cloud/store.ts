import { cloud } from './client';
import { currentUser } from './auth';
import { starterContent } from './templates';
import { buildAst, renderMarkdown } from '../render/pyodideEngine';
import { normalizeImagePath } from '../render/missingImages';
import {
  DeckConflictError,
  type DeckAsset,
  type DeckMeta,
  type DeckStore,
  type LoadedDeck,
  type RevisionMeta,
  type SavedDeck,
} from '../store/types';

type Db = {
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): any;
};

type Storage = {
  list(prefix: string, options?: Record<string, unknown>): Promise<{ data?: unknown; error?: { message?: string } | null }>;
  upload(path: string, body: Blob, options?: Record<string, unknown>): Promise<{ data?: unknown; error?: { message?: string } | null }>;
  remove(paths: string[]): Promise<{ data?: unknown; error?: { message?: string } | null }>;
  download(path: string): Promise<{ data?: Blob; error?: { message?: string } | null }>;
  createSignedUrl(path: string, ttl?: number): Promise<{ data?: { signedUrl?: string } | null; error?: { message?: string } | null }>;
  userPath(uid: string, path: string): string;
};

const db = cloud.database as unknown as Db;
const storage = cloud.storage as unknown as Storage;

function unwrap<T>(result: { data?: T; error?: { message?: string; code?: string } | null }): T {
  if (result.error) {
    const error = new Error(result.error.message || '云端请求失败') as Error & { code?: string };
    error.code = result.error.code;
    throw error;
  }
  return result.data as T;
}

async function ownerId(): Promise<string> {
  const user = await currentUser();
  if (!user) throw new Error('请先登录');
  return user.id;
}

interface DeckRow {
  id: number;
  title: string;
  slug: string;
  theme: string | null;
  slide_count: number;
  current_revision: number;
  created_at: string;
  updated_at: string;
  content_hash?: string | null;
}

function toMeta(row: DeckRow): DeckMeta {
  return {
    id: Number(row.id),
    title: row.title,
    slug: row.slug,
    theme: row.theme ?? null,
    slideCount: Number(row.slide_count || 0),
    revision: Number(row.current_revision || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function countSlides(content: string): number {
  return content.split(/\n---\s*\n/).length;
}

function safeName(name: string): string {
  const raw = name.split(/[\\/]/).pop() || 'asset.bin';
  let base = raw;
  try {
    base = decodeURIComponent(raw);
  } catch {
    // Keep the raw segment when it is not valid percent-encoding.
  }
  return base.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120);
}

async function signedUrl(path: string): Promise<string> {
  const result = await storage.createSignedUrl(path, 600);
  if (result.error) return '';
  return result.data?.signedUrl || '';
}

async function assetPath(deckId: number, relativePath: string, uid?: string): Promise<string> {
  const id = uid ?? await ownerId();
  return storage.userPath(id, `decks/${deckId}/images/${safeName(relativePath)}`);
}

/** Relative Markdown image paths that could not be resolved to a cloud URL. */
export interface CloudImageResolution {
  content: string;
  /** Author-written relative paths whose signed URL could not be created. */
  missing: string[];
}

/**
 * Replace relative Markdown image paths with short-lived cloud URLs for preview.
 * Paths that fail to resolve are reported so the workbench can badge them,
 * instead of silently leaving a broken relative `<img src>` behind.
 */
export async function resolveCloudImages(content: string, deckId: number): Promise<CloudImageResolution> {
  const uid = await ownerId();
  const matches = [...content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)];
  let resolved = content;
  const missing = new Set<string>();
  for (const match of matches) {
    const raw = match[1].trim().replace(/^<|>$/g, '');
    if (/^(https?:|data:)/i.test(raw)) continue;
    const authored = normalizeImagePath(raw);
    const path = await assetPath(deckId, authored, uid);
    const url = await signedUrl(path);
    if (url) {
      resolved = resolved.replace(match[0], match[0].replace(raw, url));
    } else {
      missing.add(authored);
    }
  }
  return { content: resolved, missing: [...missing] };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Build a self-contained HTML deck for export/presentation. Images are fetched
 * from cloud storage and inlined as data URLs, so the file stays intact after
 * the short-lived signed URLs expire. Unlike the live preview, this renders the
 * original Markdown (relative paths untouched) and rewrites the emitted <img>
 * tags, mirroring the local `package_document` behaviour in delivery.py.
 */
export async function buildStandaloneHtml(content: string, deckId: number): Promise<string> {
  const uid = await ownerId();
  const rendered = await renderMarkdown(content);
  const attribute = document.createElement('textarea');
  const embedded = new Map<string, Promise<string>>();

  const imageTag = /<script\b[^>]*>[\s\S]*?<\/script\s*>|<img src="([^"]+)"/gi;
  for (const match of rendered.html.matchAll(imageTag)) {
    const encoded = match[1];
    if (!encoded || /^(?:data:|https?:|#|\/)/i.test(encoded)) continue;
    attribute.innerHTML = encoded;
    const source = attribute.value.trim().split(/[?#]/, 1)[0];
    if (!source) continue;
    const path = await assetPath(deckId, source, uid);
    if (!embedded.has(encoded)) {
      embedded.set(encoded, (async () => {
        const downloaded = await storage.download(path);
        if (downloaded.error || !downloaded.data) {
          throw new Error(downloaded.error?.message || `图片不存在：${source}`);
        }
        return blobToDataUrl(downloaded.data);
      })());
    }
  }

  const replacements = new Map<string, string>();
  await Promise.all([...embedded].map(async ([encoded, task]) => {
    replacements.set(encoded, await task);
  }));

  return rendered.html.replace(imageTag, (tag, src: string) => {
    const dataUrl = src ? replacements.get(src) : undefined;
    return dataUrl ? tag.replace(src, dataUrl) : tag;
  });
}

export class CloudDeckStore implements DeckStore {
  private revision = 1;

  constructor(private readonly deckId: number) {}

  async load(): Promise<LoadedDeck> {
    const uid = await ownerId();
    const { data: rows, error } = await db.from('decks')
      .select('id,title,slug,theme,slide_count,current_revision,created_at,updated_at')
      .eq('id', this.deckId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message || '读取演示稿失败');
    if (!rows) throw new Error('演示稿不存在');
    const deck = rows as DeckRow;
    this.revision = Number(deck.current_revision || 1);

    const revision = unwrap<{ content: string }[]>(await db.from('deck_revisions')
      .select('content')
      .eq('deck_id', this.deckId)
      .eq('revision', this.revision)
      .limit(1))[0];
    const content = revision?.content ?? '';
    return {
      source: `${deck.title}.md`,
      fullPath: `cloud://decks/${this.deckId}`,
      content,
      // userPath() validates a relative OBJECT path and rejects a trailing slash;
      // re-append it so assetBase still works as a URL base for relative images.
      assetBase: `${storage.userPath(uid, `decks/${this.deckId}/images`)}/`,
      revision: this.revision,
      ast: await buildAst(content),
    };
  }

  async save(content: string): Promise<SavedDeck> {
    const base = this.revision;
    await ownerId();
    const next = base + 1;
    try {
      unwrap(await db.from('deck_revisions').insert({
        deck_id: this.deckId,
        revision: next,
        content,
        note: null,
      }));
    } catch (error) {
      const code = (error as Error & { code?: string }).code;
      if (code === '23505') throw new DeckConflictError();
      throw error;
    }
    const updated = unwrap<DeckRow[]>(await db.from('decks')
      .update({
        current_revision: next,
        slide_count: countSlides(content),
        updated_at: new Date().toISOString(),
      })
      .eq('id', this.deckId)
      .eq('current_revision', base)
      .is('deleted_at', null)
      .select());
    if (!updated.length) throw new DeckConflictError();
    this.revision = next;
    return { revision: next, ast: await buildAst(content) };
  }
}

export const cloudDeckApi = {
  async list(): Promise<{ ok: boolean; decks: DeckMeta[] }> {
    const rows = unwrap<DeckRow[]>(await db.from('decks')
      .select('id,title,slug,theme,slide_count,current_revision,created_at,updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }));
    return { ok: true, decks: rows.map(toMeta) };
  },

  async create(title: string, template?: string, content?: string): Promise<{ ok: boolean; deck: DeckMeta }> {
    const user = await currentUser();
    if (!user) throw new Error('请先登录');
    const tpl = starterContent(template);
    const finalTitle = title.trim() || tpl.title;
    const finalContent = content ?? tpl.content;
    const row = unwrap<DeckRow>(await db.from('decks').insert({
      title: finalTitle,
      slug: crypto.randomUUID?.().slice(0, 12) || Math.random().toString(36).slice(2, 14),
      theme: null,
      slide_count: countSlides(finalContent),
      current_revision: 1,
      owner_name: user.name || null,
    }).select().single());
    unwrap(await db.from('deck_revisions').insert({
      deck_id: row.id,
      revision: 1,
      content: finalContent,
      note: '创建演示稿',
    }));
    return { ok: true, deck: toMeta(row) };
  },

  async rename(id: number, title: string): Promise<{ ok: boolean; deck: DeckMeta }> {
    const rows = unwrap<DeckRow[]>(await db.from('decks')
      .update({ title: title.trim() || '未命名演示稿', updated_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null)
      .select());
    if (!rows.length) throw new Error('演示稿不存在或不属于当前用户');
    return { ok: true, deck: toMeta(rows[0]) };
  },

  async remove(id: number): Promise<{ ok: boolean }> {
    const rows = unwrap<DeckRow[]>(await db.from('decks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null)
      .select());
    if (!rows.length) throw new Error('演示稿不存在或不属于当前用户');
    return { ok: true };
  },

  async importFiles(files: { name: string; content: string }[]): Promise<{ ok: boolean; count: number; decks: DeckMeta[] }> {
    const decks: DeckMeta[] = [];
    for (const file of files) {
      const title = file.name.replace(/\.(md|markdown|txt)$/i, '') || '未命名演示稿';
      const created = await this.create(title, undefined, file.content);
      decks.push(created.deck);
    }
    return { ok: true, count: decks.length, decks };
  },

  async revisions(id: number): Promise<{ ok: boolean; revisions: RevisionMeta[] }> {
    const rows = unwrap<{ revision: number; note: string | null; created_at: string; content: string }[]>(
      await db.from('deck_revisions')
        .select('revision,note,created_at,content')
        .eq('deck_id', id)
        .order('revision', { ascending: false })
        .limit(50),
    );
    return {
      ok: true,
      revisions: rows.map((row) => ({
        revision: Number(row.revision),
        note: row.note,
        createdAt: row.created_at,
        bytes: row.content?.length ?? 0,
      })),
    };
  },

  async listAssets(deckId: number): Promise<{ ok: boolean; assets: DeckAsset[] }> {
    const uid = await ownerId();
    // userPath() rejects a trailing slash; re-append it for an exact directory prefix.
    const prefix = `${storage.userPath(uid, `decks/${deckId}/images`)}/`;
    const result = await storage.list(prefix, { limit: 200 });
    if (result.error) throw new Error(result.error.message || '读取附件失败');
    const entries = (Array.isArray(result.data) ? result.data : []) as {
      name?: string; path?: string; metadata?: { size?: number; mimetype?: string }; size?: number;
    }[];
    const assets: DeckAsset[] = [];
    for (const entry of entries) {
      const path = entry.path || entry.name;
      if (!path || path.endsWith('/')) continue;
      const name = path.split('/').pop() || path;
      assets.push({
        name,
        path: `images/${name}`,
        size: Number(entry.size ?? entry.metadata?.size ?? 0),
        mimeType: entry.metadata?.mimetype || 'application/octet-stream',
        url: await signedUrl(path),
        storagePath: path,
      });
    }
    return { ok: true, assets };
  },

  async uploadAssets(deckId: number, formData: FormData): Promise<{ ok: boolean; saved: DeckAsset[] }> {
    const uid = await ownerId();
    const files = formData.getAll('files').filter((item): item is File => item instanceof File);
    const saved: DeckAsset[] = [];
    for (const file of files) {
      // Keep the object key derived from the referenced filename only. Markdown
      // keeps its original relative path, so resolveCloudImages() looks up the
      // same basename; a timestamp prefix here would make every imported image
      // unresolvable. Deterministic keys also make re-imports idempotent.
      const filename = safeName(file.name);
      const relative = `images/${filename}`;
      const path = await assetPath(deckId, relative, uid);
      const result = await storage.upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });
      if (result.error) throw new Error(result.error.message || '上传失败');
      saved.push({
        name: file.name,
        path: relative,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        url: await signedUrl(path),
        storagePath: path,
      });
    }
    return { ok: true, saved };
  },

  async deleteAsset(asset: DeckAsset): Promise<{ ok: boolean }> {
    if (!asset.storagePath) throw new Error('无法定位云端附件');
    const result = await storage.remove([asset.storagePath]);
    if (result.error) throw new Error(result.error.message || '删除失败');
    return { ok: true };
  },
};
