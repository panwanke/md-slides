import { isolateHistory } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { ChangeSet, Compartment, EditorState } from '@codemirror/state';
import type { ChangeDesc } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { Strikethrough } from '@lezer/markdown';
import { minimalSetup } from 'codemirror';
import { imageSource, livePreview } from './livePreview';
import { applyMarkdownFormat, markdownFormatKeys, presentationSyntax } from './markdownFormatting';
import type { FormatAction, MenuPosition } from './markdownFormatting';
import { mathSyntax } from './mathSyntax';
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
  frontmatter: { title?: string; jc?: { title?: string }; md_slide?: { title?: string } };
}

export type SaveStatus =
  | 'loading' | 'saved' | 'pending' | 'saving' | 'save-error' | 'load-error' | 'conflict';
export type Mode = 'live' | 'source';
export type EditorSelection = { anchor: number; head: number };

interface Callbacks {
  onLoad: (doc: LoadedDeck) => { mode: Mode; selection?: EditorSelection } | void;
  onSave: (deck: Deck) => void;
  onStatus: (status: SaveStatus) => void;
  onLoadError?: (message: string) => void;
  onFormatMenu?: (position: MenuPosition) => void;
  onCursor: (
    page: number, line: number, column: number, layout: string, selection: EditorSelection, followPreview: boolean,
  ) => void;
  onChange?: (content: string) => void;
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
  if (!/\r\n|[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(content)) return deck;
  // The API counts code points in the original text. CodeMirror counts UTF-16 units and normalizes newlines.
  const positions = [0];
  let afterCR = false;
  for (const char of content) {
    positions.push(positions[positions.length - 1] + (afterCR && char === '\n' ? 0 : char.length));
    afterCR = char === '\r';
  }
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
  private readonly images = new Compartment();
  private assetBase?: string;
  private view: EditorView | null = null;
  private snapshot: Snapshot | null = null;
  private inflight: { changes: ChangeDesc } | null = null;
  private saving?: Promise<boolean>;
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
      const content = loaded.content.replace(/\r\n?/g, '\n');
      this.assetBase = loaded.assetBase;
      const deck = normalizeDeck(loaded.ast, loaded.content);
      this.snapshot = { deck, content, changes: ChangeSet.empty(content.length).desc };
      this.view = new EditorView({
        parent: this.host,
        state: EditorState.create({
          doc: content,
          extensions: [
            minimalSetup,
            markdown({ extensions: [mathSyntax, Strikethrough, presentationSyntax] }),
            markdownFormatKeys,
            keymap.of([
              { key: 'Shift-F10', run: (view) => this.openFormatMenu(view) },
              { key: 'ContextMenu', run: (view) => this.openFormatMenu(view) },
            ]),
            EditorView.domEventHandlers({
              contextmenu: (event, view) => {
                const target = event.target;
                if (event.shiftKey || !(target instanceof Element) || !view.contentDOM.contains(target)
                    || target.closest('input, select, textarea, button')) return false;
                const { clientX: x, clientY: y } = event;
                return this.openFormatMenu(view, x || y ? { x, y } : undefined);
              },
            }),
            EditorView.lineWrapping,
            EditorView.contentAttributes.of({ 'aria-label': 'Markdown 编辑器', spellcheck: 'false' }),
            this.mode.of(livePreview),
            this.images.of(this.assetBase ? imageSource.of({ base: this.assetBase, revision: 0 }) : []),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                const snapshot = this.snapshot!;
                snapshot.changes = snapshot.changes.composeDesc(update.changes);
                if (this.inflight) this.inflight.changes = this.inflight.changes.composeDesc(update.changes);
                this.callbacks.onChange?.(update.state.doc.toString());
                this.callbacks.onStatus('pending');
                this.scheduleSave();
              }
              if (update.selectionSet || update.docChanged) this.reportCursor(update.view.hasFocus);
            }),
          ],
        }),
      });
      const restored = this.callbacks.onLoad({ ...loaded, content, ast: deck });
      if (restored?.mode === 'source') this.setMode('source');
      if (restored?.selection) {
        const clamp = (pos: number) => Math.max(0, Math.min(content.length, pos));
        const anchor = clamp(restored.selection.anchor);
        const head = clamp(restored.selection.head);
        this.view.dispatch({ selection: { anchor, head }, effects: EditorView.scrollIntoView(head, { y: 'center' }) });
      } else {
        this.selectSlide(1, false);
      }
      this.reportCursor();
      this.callbacks.onStatus('saved');
    } catch (error) {
      if (this.destroyed) return;
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      this.callbacks.onLoadError?.(message);
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

  refreshAssets(revision: number) {
    if (!this.assetBase) return;
    this.view?.dispatch({
      effects: this.images.reconfigure(imageSource.of({ base: this.assetBase, revision })),
    });
  }

  private scheduleSave() {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.save(), 380);
  }

  documentText() {
    return this.view?.state.doc.toString();
  }

  focus() {
    this.view?.focus();
  }

  format(action: FormatAction) {
    if (!this.view) return;
    applyMarkdownFormat(this.view, action);
    this.view.focus();
  }

  private openFormatMenu(view: EditorView, position?: MenuPosition) {
    if (!this.callbacks.onFormatMenu) return false;
    const { main } = view.state.selection;
    if (position) {
      const pos = view.posAtCoords(position);
      if (pos !== null && (pos < main.from || pos > main.to)) {
        view.dispatch({ selection: { anchor: pos }, userEvent: 'select.pointer' });
      }
    } else {
      const box = view.coordsAtPos(main.head) ?? view.contentDOM.getBoundingClientRect();
      position = { x: box.left, y: box.bottom };
    }
    this.callbacks.onFormatMenu(position);
    return true;
  }

  async flush(): Promise<boolean> {
    while (this.view && this.snapshot && (this.saving || this.documentText() !== this.snapshot.content)) {
      if (!(await this.save())) return false;
    }
    return true;
  }

  async save(): Promise<boolean> {
    window.clearTimeout(this.timer);
    if (this.saving) return this.saving;
    const { view, snapshot } = this;
    if (this.blocked) return false;
    if (!view || !snapshot) return true;
    const content = view.state.doc.toString();
    if (content === snapshot.content) {
      snapshot.changes = ChangeSet.empty(content.length).desc;
      this.callbacks.onStatus('saved');
      return true;
    }
    this.saving = this.writeDocument(view, content);
    try {
      return await this.saving;
    } finally {
      this.saving = undefined;
      this.inflight = null;
      if (!this.destroyed && !this.blocked && view.state.doc.toString() !== content) this.scheduleSave();
    }
  }

  private async writeDocument(view: EditorView, content: string) {
    const pending = { changes: ChangeSet.empty(content.length).desc };
    this.inflight = pending;
    this.callbacks.onStatus('saving');
    try {
      const saved = await this.store.save(content);
      if (this.destroyed) return false;
      const deck = normalizeDeck(saved.ast, content);
      this.snapshot = { deck, content, changes: pending.changes };
      this.callbacks.onSave(deck);
      this.reportCursor();
      this.callbacks.onStatus(view.state.doc.toString() === content ? 'saved' : 'pending');
      return true;
    } catch (error) {
      if (this.destroyed) return false;
      console.error(error);
      // A version conflict cannot be resolved by retrying: stop the autosave
      // loop and let the user reload instead of silently overwriting.
      this.blocked = error instanceof DeckConflictError;
      this.callbacks.onStatus(this.blocked ? 'conflict' : 'save-error');
      return false;
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

  private reportCursor(followPreview = false) {
    const view = this.view;
    if (!view) return;
    const { anchor, head: cursor } = view.state.selection.main;
    const line = view.state.doc.lineAt(cursor);
    const slide = this.slideAt(cursor);
    const meta = slide && this.directiveFor(slide, view.state);
    const attributes = meta?.text.match(slideDirective)?.[2] ?? '';
    this.callbacks.onCursor(slide?.index ?? 1, line.number, cursor - line.from + 1,
      getAttribute(attributes, 'layout'), { anchor, head: cursor }, followPreview);
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

  async moveSlide(expected: Deck, source: number, destination: number): Promise<boolean> {
    const { view, snapshot } = this;
    if (!view || snapshot?.deck !== expected || source === destination
        || !expected.slides[source - 1] || !expected.slides[destination - 1]) return false;

    const { doc } = view.state;
    if (doc.toString() !== snapshot.content || this.saving) {
      // Resolve pending structural edits before using positions from the outline.
      const ranges = expected.slides.map((slide) => this.mapRange(slide.sourceRange));
      if (!(await this.flush()) || this.destroyed || view.state.doc !== doc) return false;
      const savedSlides = this.snapshot!.deck.slides;
      if (savedSlides.length !== ranges.length || savedSlides.some(({ sourceRange: [from, to] }, index) =>
        from !== ranges[index][0] || to !== ranges[index][1])) return false;
    }

    const first = Math.min(source, destination);
    const last = Math.max(source, destination);
    const ranges = this.snapshot!.deck.slides.slice(first - 1, last).map(({ sourceRange: [from, to] }) => {
      // Keep the newline after the workspace marker and before each separator in place.
      if (from > 0 && doc.lineAt(from).from !== from && doc.sliceString(from, from + 1) === '\n') from++;
      if (doc.sliceString(to - 1, to) === '\n') to--;
      return { from, to };
    });
    const pages = ranges.map(({ from, to }) => doc.sliceString(from, to));
    const [moved] = pages.splice(source - first, 1);
    pages.splice(destination - first, 0, moved);

    const from = ranges[0].from;
    let insert = '';
    let anchor = from;
    for (const [index, page] of pages.entries()) {
      if (index > 0) insert += doc.sliceString(ranges[index - 1].to, ranges[index].from);
      if (index === destination - first) anchor = from + insert.length;
      insert += page;
    }
    if (from === 0 && insert.startsWith('---')) {
      // A page starting with dashes must not be mistaken for the deck's frontmatter.
      insert = '\n' + insert;
      anchor++;
    }
    view.dispatch({
      changes: { from, to: ranges[ranges.length - 1].to, insert },
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor, { y: 'start', yMargin: 28 }),
      annotations: isolateHistory.of('full'),
      userEvent: 'move.slide',
    });
    return true;
  }

  /** Locate an image reference by its authored path and reveal it in the source. */
  revealImage(path: string) {
    const view = this.view;
    if (!view) return;
    const text = view.state.doc.toString();
    const needle = `](${path}`;
    let index = text.indexOf(needle);
    if (index < 0) {
      // Fall back to a bare path match (covers query/hash variations).
      index = text.indexOf(path);
    }
    if (index < 0) return;
    view.dispatch({
      selection: { anchor: index },
      effects: EditorView.scrollIntoView(index, { y: 'center' }),
    });
    view.focus();
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
      const snippet = nodeType === 'diagram' ? text.trim() : text.trim().slice(0, 40);
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
