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
 * EditorSession does not know where the Markdown lives. Today only
 * LocalFileStore exists (one .md file bound to the local Python process).
 * A database-backed store can implement the same two methods without any
 * change to the editor kernel, preview or source mapping.
 */
export interface DeckStore {
  load(): Promise<LoadedDeck>;
  save(content: string): Promise<SavedDeck>;
}
