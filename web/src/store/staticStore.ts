import type { Deck } from '../editorSession';
import { renderMarkdown } from '../render/pyodideEngine';
import type { DeckStore, LoadedDeck, SavedDeck } from './types';

export class StaticDeckStore implements DeckStore {
  private content: string;
  private documentPath: string;
  private theme: string;
  private onRender?: (html: string, content: string, theme: string, ast: Deck) => void;

  constructor(options: {
    initialContent: string;
    documentPath?: string;
    theme?: string;
    onRender?: (html: string, content: string, theme: string, ast: Deck) => void;
  }) {
    this.content = options.initialContent;
    this.documentPath = options.documentPath || 'showcase.md';
    this.theme = options.theme || 'academic-paper';
    this.onRender = options.onRender;
  }

  setDocument(path: string, content: string) {
    this.documentPath = path;
    this.content = content;
  }

  setTheme(theme: string) {
    this.theme = theme;
  }

  getContent(): string {
    return this.content;
  }

  getDocumentPath(): string {
    return this.documentPath;
  }

  async load(): Promise<LoadedDeck> {
    const res = await renderMarkdown(this.content, this.theme);
    this.onRender?.(res.html, this.content, this.theme, res.ast);
    return {
      source: this.documentPath.split('/').pop() || 'showcase.md',
      fullPath: this.documentPath,
      content: this.content,
      revision: 1,
      ast: res.ast,
    };
  }

  async save(content: string): Promise<SavedDeck> {
    this.content = content;
    const res = await renderMarkdown(content, this.theme);
    this.onRender?.(res.html, content, this.theme, res.ast);
    return {
      revision: Date.now(),
      ast: res.ast,
    };
  }
}
