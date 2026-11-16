import type { Deck } from '../editorSession';

/** A document as delivered by any store. Mirrors the existing /api/document shape. */
export interface LoadedDeck {
  source: string;
  fullPath: string;
  content: string;
  assetBase?: string;
  revision: number;
  ast: Deck;
}

/** Result of a successful write. `revision` is kept for future optimistic locking. */
export interface SavedDeck {
  revision: number;
  ast: Deck;
}

/**
 * The storage boundary of the editor.
 *
 * EditorSession does not know where the Markdown lives. LocalFileStore,
 * StaticDeckStore, RemoteDeckStore and CloudDeckStore all implement this.
 */
export interface DeckStore {
  load(): Promise<LoadedDeck>;
  save(content: string): Promise<SavedDeck>;
}

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

export interface DeckAsset {
  name: string;
  path: string;
  size: number;
  mimeType: string;
  url: string;
  /** Full object key in runtime storage; only present for cloud-backed assets. */
  storagePath?: string;
}

/** Raised when another writer advanced the deck revision first (HTTP 409 equivalent). */
export class DeckConflictError extends Error {
  constructor(message = '文档已被其他窗口更新，请刷新后重试') {
    super(message);
    this.name = 'DeckConflictError';
  }
}
