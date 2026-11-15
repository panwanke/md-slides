import type { Deck } from '../editorSession';
import type { DeckStore, LoadedDeck, SavedDeck } from './types';

interface PutResponse {
  revision?: number;
  ast: Deck;
}

async function request<T>(options?: RequestInit): Promise<T> {
  const response = await fetch('/api/document', options);
  if (!response.ok) throw new Error(`Document request failed (${response.status})`);
  return response.json() as Promise<T>;
}

/** Original behaviour: a single Markdown file opened by the local CLI process. */
export class LocalFileStore implements DeckStore {
  load(): Promise<LoadedDeck> {
    return request<LoadedDeck>();
  }

  async save(content: string): Promise<SavedDeck> {
    const saved = await request<PutResponse>({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    return { revision: saved.revision ?? 0, ast: saved.ast };
  }
}
