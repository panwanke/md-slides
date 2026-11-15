import type { DeckStore, LoadedDeck, SavedDeck } from './types';

export interface DeckMeta {
  id: number;
  title: string;
  slug: string;
  theme: string | null;
  slideCount: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface RevisionMeta {
  revision: number;
  note: string | null;
  createdAt: string;
  bytes: number;
}

/** Raised when another window advanced the deck revision first (HTTP 409). */
export class DeckConflictError extends Error {
  constructor(message = '文档已被其他窗口更新，请刷新后重试') {
    super(message);
    this.name = 'DeckConflictError';
  }
}

interface ErrorBody {
  detail?: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    try {
      const body = (await response.json()) as ErrorBody;
      if (body.detail) message = body.detail;
    } catch { /* non-JSON error */ }
    if (response.status === 401) {
      // Let the shell drop its in-memory user so the login view actually shows.
      window.dispatchEvent(new CustomEvent('jc-studio-unauthorized'));
      location.hash = '#/login';
      throw new Error(message);
    }
    if (response.status === 409) throw new DeckConflictError(message);
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

/**
 * Server-backed deck store. Keeps the revision it last saw and sends it as
 * `baseRevision` on every write, so a stale client cannot silently overwrite
 * a newer version.
 */
export class RemoteDeckStore implements DeckStore {
  private revision = 1;

  constructor(private readonly deckId: number) {}

  async load(): Promise<LoadedDeck> {
    const doc = await request<LoadedDeck>(`/api/decks/${this.deckId}`);
    this.revision = doc.revision;
    return doc;
  }

  async save(content: string): Promise<SavedDeck> {
    const saved = await request<SavedDeck>(`/api/decks/${this.deckId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, baseRevision: this.revision }),
    });
    this.revision = saved.revision;
    return saved;
  }
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const deckApi = {
  list: () => request<{ ok: boolean; decks: DeckMeta[] }>('/api/decks'),

  create: (title: string) =>
    request<{ ok: boolean; deck: DeckMeta }>('/api/decks', json('POST', { title })),

  rename: (id: number, title: string) =>
    request<{ ok: boolean; deck: DeckMeta }>(`/api/decks/${id}`, json('PATCH', { title })),

  remove: (id: number) =>
    request<{ ok: boolean }>(`/api/decks/${id}`, { method: 'DELETE' }),

  importFiles: (files: { name: string; content: string }[]) =>
    request<{ ok: boolean; count: number; decks: DeckMeta[] }>(
      '/api/decks/import', json('POST', { files }),
    ),

  revisions: (id: number) =>
    request<{ ok: boolean; revisions: RevisionMeta[] }>(`/api/decks/${id}/revisions`),
};
