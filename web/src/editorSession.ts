import { markdown } from '@codemirror/lang-markdown';
import { ChangeSet, Compartment, EditorState } from '@codemirror/state';
import type { ChangeDesc } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { minimalSetup } from 'codemirror';
import { livePreview } from './livePreview';
import { blockArgument, getAttribute, scanSlideSyntax, slideDirective, updateDirective } from './slideSyntax';
import type { BlockKind } from './slideSyntax';
import { LocalFileStore } from './store/localFile';
import { DeckConflictError } from './store/remote';
import type { DeckStore, LoadedDeck } from './store/types';

type Span = [number, number];

interface Node {
  nodeType: string;
  sourceRange: Span;
}

export interface SlideSummary {
  slideId: string;
  index: number;
  title: string;
  layout: string;
}

interface Slide extends SlideSummary {
  sourceRange: Span;
  nodes: Node[];
  metadata: Record<string, string>;
}

export interface Section {
  id: string;
  title: string;
  slides: SlideSummary[];
}

export interface Deck {
  documentRevision: number;
  slides: Slide[];
  sections: Section[];
  frontmatter: { title?: string; jc?: { title?: string } };
}

export type SaveStatus =
  | 'loading' | 'saved' | 'pending' | 'saving' | 'save-error' | 'load-error' | 'conflict';
export type Mode = 'live' | 'source';

interface Callbacks {
  onLoad: (doc: LoadedDeck) => void;
  onSave: (deck: Deck) => void;
  onStatus: (status: SaveStatus) => void;
  onCursor: (page: number, line: number, column: number, layout: string) => void;
}

interface Snapshot {
  content: string;
  deck: Deck;
  changes: ChangeDesc;
}

export interface PreviewClick {
  slideIndex: number;
  nodeType: string;
  text: string;
}

function normalizeDeck(deck: Deck, content: string): Deck {
  if (!/[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(content)) return deck;
  // The API uses Unicode code points, while CodeMirror uses UTF-16 offsets.
  const positions = [0];
  for (const char of content) positions.push(positions[positions.length - 1] + char.length);
  const span = ([from, to]: Span): Span => [positions[from], positions[to]];
  return {
    ...deck,
    slides: deck.slides.map((slide) => ({
      ...slide,
      sourceRange: span(slide.sourceRange),
      nodes: slide.nodes.map((node) => ({ ...node, sourceRange: span(node.sourceRange) })),
    })),
  };
}

export class EditorSession {
  private readonly mode = new Compartment();
  private view: EditorView | null = null;
  private snapshot: Snapshot | null = null;
  private inflight: { changes: ChangeDesc } | null = null;
  private timer: number | undefined;
  private destroyed = false;
  private blocked = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: Callbacks,
    private readonly store: DeckStore = new LocalFileStore(),
  ) {}

  async load() {
    try {
      const loaded = await this.store.load();
      if (this.destroyed) return;
      const content = loaded.content;
      const deck = normalizeDeck(loaded.ast, content);
      this.snapshot = { deck, content, changes: ChangeSet.empty(content.length).desc };
      this.view = new EditorView({
        parent: this.host,
        state: EditorState.create({
          doc: content,
          extensions: [
            minimalSetup,
            markdown(),
            EditorView.lineWrapping,
            EditorView.contentAttributes.of({ 'aria-label': 'Markdown 编辑器', spellcheck: 'false' }),
            this.mode.of(livePreview),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                const snapshot = this.snapshot!;
                snapshot.changes = snapshot.changes.composeDesc(update.changes);
                if (this.inflight) this.inflight.changes = this.inflight.changes.composeDesc(update.changes);
                this.callbacks.onStatus('pending');
                this.scheduleSave();
              }
              if (update.selectionSet || update.docChanged) this.reportCursor();
            }),
          ],
        }),
      });
      this.callbacks.onLoad({ ...loaded, ast: deck });
      this.selectSlide(1, false);
      this.reportCursor();
      this.callbacks.onStatus('saved');
    } catch (error) {
      if (this.destroyed) return;
      console.error(error);
      this.callbacks.onStatus('load-error');
    }
  }

  destroy() {
    this.destroyed = true;
    window.clearTimeout(this.timer);
    this.view?.destroy();
    this.view = null;
  }

  setMode(mode: Mode) {
    this.view?.dispatch({ effects: this.mode.reconfigure(mode === 'live' ? livePreview : [lineNumbers()]) });
  }

  private scheduleSave() {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.save(), 380);
  }

  async save() {
    window.clearTimeout(this.timer);
    const { view, snapshot } = this;
    if (!view || !snapshot || this.inflight || this.blocked) return;
    const content = view.state.doc.toString();
    if (content === snapshot.content) {
      this.callbacks.onStatus('saved');
      return;
    }
    const pending = { changes: ChangeSet.empty(content.length).desc };
    this.inflight = pending;
    this.callbacks.onStatus('saving');
    try {
      const saved = await this.store.save(content);
      if (this.destroyed) return;
      const deck = normalizeDeck(saved.ast, content);
      this.snapshot = { deck, content, changes: pending.changes };
      this.callbacks.onSave(deck);
      this.reportCursor();
      this.callbacks.onStatus(view.state.doc.toString() === content ? 'saved' : 'pending');
    } catch (error) {
      if (this.destroyed) return;
      console.error(error);
      // A version conflict cannot be resolved by retrying: stop the autosave
      // loop and let the user reload instead of silently overwriting.
      this.blocked = error instanceof DeckConflictError;
      this.callbacks.onStatus(this.blocked ? 'conflict' : 'save-error');
    } finally {
      this.inflight = null;
      if (!this.destroyed && !this.blocked && view.state.doc.toString() !== content) this.scheduleSave();
    }
  }

  private mapRange([from, to]: Span): Span {
    const changes = this.snapshot!.changes;
    return [changes.mapPos(from, -1), changes.mapPos(to, 1)];
  }

  private slideAt(pos: number) {
    const slides = this.snapshot?.deck.slides ?? [];
    // A cursor on a separator belongs to the previous page.
    let active = slides[0];
    for (const slide of slides) {
      if (this.mapRange(slide.sourceRange)[0] > pos) break;
      active = slide;
    }
    return active;
  }

  private directiveFor(slide: Slide, state: EditorState) {
    const [from, to] = this.mapRange(slide.sourceRange);
    // A newly typed directive can precede the last parsed AST node.
    return scanSlideSyntax(state.doc).find((region) => region.kind === 'meta'
      && region.from >= from && region.to <= to);
  }

  private reportCursor() {
    const view = this.view;
    if (!view) return;
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const slide = this.slideAt(cursor);
    const meta = slide && this.directiveFor(slide, view.state);
    const attributes = meta?.text.match(slideDirective)?.[2] ?? '';
    this.callbacks.onCursor(slide?.index ?? 1, line.number, cursor - line.from + 1,
      getAttribute(attributes, 'layout'));
  }

  selectSlide(page: number, scroll = true) {
    const slide = this.snapshot?.deck.slides[page - 1];
    const view = this.view;
    if (!slide || !view) return;
    const [start, end] = this.mapRange(slide.sourceRange);
    const heading = slide.nodes.find((node) => node.nodeType === 'heading');
    const meta = slide.nodes.find((node) => node.nodeType === 'meta');
    const after = heading || meta;
    const anchor = after ? Math.min(this.mapRange(after.sourceRange)[1] + 1, end) : start;
    view.dispatch({
      selection: { anchor },
      effects: scroll ? EditorView.scrollIntoView(start, { y: 'start', yMargin: 28 }) : [],
    });
  }

  revealElement({ slideIndex, nodeType, text }: PreviewClick) {
    const view = this.view;
    const slide = this.snapshot?.deck.slides[slideIndex - 1];
    if (!view || !slide) return;
    let [from, to] = this.mapRange(slide.sourceRange);
    const node = slide.nodes.find((candidate) => candidate.nodeType === nodeType);
    if (node) {
      [from, to] = this.mapRange(node.sourceRange);
    } else {
      const snippet = text.trim().slice(0, 40);
      const relative = snippet ? view.state.doc.sliceString(from, to).indexOf(snippet) : -1;
      if (relative >= 0) {
        from += relative;
        to = from + snippet.length;
      } else {
        to = from;
      }
    }
    view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    });
    view.focus();
  }

  setLayout(layout: string) {
    const view = this.view;
    if (!view) return;
    const slide = this.slideAt(view.state.selection.main.head);
    if (!slide) return;
    const region = this.directiveFor(slide, view.state);
    if (region) {
      const insert = updateDirective(region.text, 'layout', layout);
      if (insert !== region.text) view.dispatch({ changes: { from: region.from, to: region.to, insert } });
    } else if (layout) {
      const [start] = this.mapRange(slide.sourceRange);
      const leadingLines = /^\n*/.exec(view.state.doc.sliceString(start))?.[0].length ?? 0;
      view.dispatch({ changes: { from: start + leadingLines, insert: `<!-- slide: layout=${layout} -->\n` } });
    }
  }

  insert(kind: BlockKind | 'slide') {
    const view = this.view;
    if (!view) return;
    const { doc, selection } = view.state;
    const slide = this.slideAt(selection.main.head);
    const slideRange = slide && this.mapRange(slide.sourceRange);
    let from = doc.lineAt(selection.main.to).to;
    let header = '';
    let body = '';
    let footer = '\n:::';
    if (kind === 'slide') {
      from = slideRange?.[1] ?? doc.length;
      header = (slide ? '---\n' : '') + '<!-- slide: layout=bullets -->\n# ';
      body = '新幻灯片';
      footer = '\n\n- ';
    } else if (kind === 'notes') {
      from = slideRange?.[1] ?? doc.length;
      header = '::: notes\n';
      body = '在此输入演讲讲稿';
    } else if (kind === 'box') {
      header = '::: box\n';
      body = '在此输入卡片内容';
    } else {
      const steps = scanSlideSyntax(doc)
        .filter((region) => region.kind === 'fragment'
          && (!slideRange || (region.from >= slideRange[0] && region.to <= slideRange[1])))
        .map((region) => Number(getAttribute(blockArgument(region.text), 'step')) || 0);
      const step = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, ...steps) + 1);
      header = `::: fragment step=${step} effect=fade\n`;
      body = '在此输入分步显示内容';
    }

    const before = doc.sliceString(Math.max(0, from - 2), from);
    const after = doc.sliceString(from, Math.min(from + 2, doc.length));
    const prefix = from === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const suffix = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    const anchor = from + prefix.length + header.length;
    view.dispatch({
      changes: { from, insert: prefix + header + body + footer + suffix },
      selection: { anchor, head: anchor + body.length },
      scrollIntoView: true,
      userEvent: 'input',
    });
    view.focus();
  }

  insertText(text: string) {
    const view = this.view;
    if (!view) return;
    const { selection } = view.state;
    view.dispatch({
      changes: { from: selection.main.from, to: selection.main.to, insert: text },
      selection: { anchor: selection.main.from + text.length },
      scrollIntoView: true,
      userEvent: 'input',
    });
    view.focus();
  }
}
