import type { Deck } from '../editorSession';
import type { DeckStore, LoadedDeck, SavedDeck } from './types';

export class StaticDeckStore implements DeckStore {
  constructor(
    private readonly documentPath: string,
    private content: string,
    private readonly buildAst: (content: string) => Promise<Deck>,
  ) {}

  async load(): Promise<LoadedDeck> {
    const content = this.content;
    return {
      source: this.documentPath.split('/').pop() || 'showcase.md',
      fullPath: this.documentPath,
      content,
      revision: 1,
      ast: await this.buildAst(content),
    };
  }

  updateDraft(content: string) {
    this.content = content;
  }

  async save(content: string): Promise<SavedDeck> {
    return {
      revision: Date.now(),
      ast: await this.buildAst(content),
    };
  }
}
