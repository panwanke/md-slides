import { isCloudRuntime } from '../cloud/publicConfig';
import { cloudDeckApi } from '../cloud/store';
import {
  DeckConflictError,
  type DeckAsset,
  type DeckMeta,
  type DeckStore,
  type LoadedDeck,
  type RevisionMeta,
  type SavedDeck,
} from './types';

export { DeckConflictError } from './types';
export type { DeckAsset, DeckMeta, RevisionMeta } from './types';

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
      window.dispatchEvent(new CustomEvent('md-slide-studio-unauthorized'));
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

export interface DeckTemplate {
  id: string;
  title: string;
  description: string;
  content: string;
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

const localDeckApi = {
  list: () => request<{ ok: boolean; decks: DeckMeta[] }>('/api/decks'),

  templates: () => request<{ ok: boolean; templates: DeckTemplate[] }>('/api/templates'),

  create: (title: string, template?: string, content?: string) =>
    request<{ ok: boolean; deck: DeckMeta }>('/api/decks', json('POST', { title, template, content })),

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

  listAssets: (deckId: number) =>
    request<{ ok: boolean; assets: DeckAsset[] }>(`/api/decks/${deckId}/assets`),

  uploadAssets: (deckId: number, formData: FormData) =>
    request<{ ok: boolean; saved: DeckAsset[] }>(`/api/decks/${deckId}/assets`, {
      method: 'POST', body: formData,
    }),

  deleteAsset: (asset: DeckAsset) =>
    request<{ ok: boolean }>(asset.url, { method: 'DELETE' }),
};

/** Single API surface: cloud in WorkBuddy, FastAPI in self-hosted mode. */
export const deckApi = isCloudRuntime() ? cloudDeckApi : localDeckApi;
