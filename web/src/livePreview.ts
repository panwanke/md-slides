import { syntaxTree } from '@codemirror/language';
import { RangeSet, StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import {
  blockArgument, blockNames, effects, getAttribute, layouts, scanSlideSyntax,
  setAttribute, slideDirective, transitions, updateBlockArgument, updateDirective,
} from './slideSyntax';
import type { SyntaxRegion } from './slideSyntax';

const toggleFold = StateEffect.define<number>({ map: (pos, changes) => changes.mapPos(pos, 1) });

const syntaxState = StateField.define({
  create: (state) => ({ regions: scanSlideSyntax(state.doc), toggled: new Set<number>() }),
  update(value, transaction) {
    if (!transaction.docChanged && !transaction.effects.some((effect) => effect.is(toggleFold))) {
      return value;
    }
    const regions = transaction.docChanged ? scanSlideSyntax(transaction.newDoc) : value.regions;
    const starts = new Set(regions.filter((region) => region.close).map((region) => region.from));
    const toggled = new Set<number>();
    for (const from of value.toggled) {
      const right = transaction.changes.mapPos(from, 1);
      const left = transaction.changes.mapPos(from, -1);
      if (starts.has(right)) toggled.add(right);
      else if (starts.has(left)) toggled.add(left);
    }
    for (const effect of transaction.effects) {
      if (!effect.is(toggleFold)) continue;
      if (toggled.has(effect.value)) toggled.delete(effect.value);
      else toggled.add(effect.value);
    }
    return { regions, toggled };
  },
});

function touchesSelection(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

function makeButton(text: string, label: string, action: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'syntax-button';
  button.textContent = text;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.addEventListener('click', action);
  return button;
}

function withLabel(text: string, control: HTMLInputElement | HTMLSelectElement) {
  const label = document.createElement('label');
  label.className = 'syntax-field';
  label.append(text, control);
  return label;
}

function makeSelect(
  label: string,
  options: readonly (readonly [string, string])[],
  value: string,
  commit: (next: string) => void,
) {
  const select = document.createElement('select');
  select.setAttribute('aria-label', label);
  for (const [key, caption] of options) select.add(new Option(caption, key));
  if (!options.some(([key]) => key === value)) select.add(new Option(value, value));
  select.value = value;
  select.addEventListener('change', () => commit(select.value));
  return withLabel(label, select);
}

function makeInput(
  label: string,
  value: string,
  commit: (value: string) => void,
  config: { pattern?: string; number?: boolean; maxLength?: number } = {},
) {
  const input = document.createElement('input');
  input.setAttribute('aria-label', label);
  input.value = input.defaultValue = value;
  input.placeholder = '可选';
  if (config.pattern) input.pattern = config.pattern;
  if (config.maxLength) input.maxLength = config.maxLength;
  if (config.number) {
    input.type = 'number';
    input.min = '1';
    input.max = String(Number.MAX_SAFE_INTEGER);
    input.required = true;
  }
  input.addEventListener('change', () => {
    const next = config.number ? String(input.valueAsNumber) : input.value.trim();
    if (input.checkValidity()) commit(next);
    else {
      input.reportValidity();
      input.value = value;
    }
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    } else if (event.key === 'Escape') {
      input.value = value;
      input.blur();
    }
  });
  return withLabel(label, input);
}

class SyntaxWidget extends WidgetType {
  constructor(readonly region: SyntaxRegion, readonly folded: boolean, readonly lineCount: number) {
    super();
  }

  eq(other: SyntaxWidget) {
    return this.region.kind === other.region.kind && this.region.from === other.region.from
      && this.region.text === other.region.text && this.folded === other.folded
      && this.region.close?.to === other.region.close?.to && this.lineCount === other.lineCount;
  }

  toDOM(view: EditorView) {
    const { kind, from, to, text, close } = this.region;
    const root = document.createElement('span');
    root.className = `syntax-widget syntax-${kind}`;
    root.dataset.syntaxFrom = String(from);
    const title = document.createElement('span');
    title.className = 'syntax-name';
    const label = {
      ...blockNames, meta: '页面设置', workspace: '幻灯片正文', comment: '注释',
      frontmatter: '文档配置', divider: '分页',
    }[kind];
    title.textContent = label;

    function replaceLine(next: string) {
      if (next === text || view.state.doc.sliceString(from, to) !== text) return;
      const focused = document.activeElement;
      const label = focused instanceof HTMLSelectElement && root.contains(focused)
        ? focused.getAttribute('aria-label') : null;
      view.dispatch({ changes: { from, to, insert: next }, userEvent: 'input' });
      if (label) view.dom.querySelector<HTMLSelectElement>(
        `[data-syntax-from="${from}"] select[aria-label="${label}"]`,
      )?.focus({ preventScroll: true });
    }

    if (close) {
      const foldLabel = this.folded ? '展开内容' : '折叠内容';
      const button = makeButton(this.folded ? '›' : '⌄', foldLabel, () => {
        view.dispatch({ effects: toggleFold.of(from) });
        requestAnimationFrame(() => view.dom.querySelector<HTMLButtonElement>(
          `[data-syntax-from="${from}"] .syntax-fold`,
        )?.focus());
      });
      button.classList.add('syntax-fold');
      button.setAttribute('aria-expanded', String(!this.folded));
      root.append(button);
    }
    root.append(title);

    if (kind === 'meta') {
      const values = text.match(slideDirective)?.[2] ?? '';
      root.append(
        makeSelect('版式', layouts, getAttribute(values, 'layout'),
          (value) => replaceLine(updateDirective(text, 'layout', value))),
        makeSelect('转场', transitions, getAttribute(values, 'transition'),
          (value) => replaceLine(updateDirective(text, 'transition', value))),
        makeInput('章节', getAttribute(values, 'section'),
          (value) => replaceLine(updateDirective(text, 'section', value)), { pattern: '[^\\s\\|<>]*' }),
      );
    } else if (kind === 'fragment') {
      const options = blockArgument(text);
      const updateOption = (key: string, value: string) => {
        let next = setAttribute(options, key, value, ' ');
        if (!getAttribute(next, 'step')) next = setAttribute(next, 'step', '1', ' ');
        replaceLine(updateBlockArgument(text, next));
      };
      root.append(
        makeInput('动画步骤', getAttribute(options, 'step') || '1',
          (value) => updateOption('step', value), { number: true }),
        makeSelect('动画效果', effects, getAttribute(options, 'effect') || 'fade',
          (value) => updateOption('effect', value)),
      );
    } else if (kind === 'box') {
      root.append(makeInput('标题', blockArgument(text), (value) => replaceLine(updateBlockArgument(text, value))));
    } else if (kind === 'comment') {
      const comment = document.createElement('span');
      comment.className = 'syntax-comment-text';
      comment.textContent = text.trim().slice(4, -3).trim();
      comment.title = comment.textContent;
      root.append(comment);
    }

    if (this.folded && this.lineCount) {
      const count = document.createElement('span');
      count.className = 'syntax-count';
      count.textContent = `${this.lineCount} 行`;
      root.append(count);
    }

    if (kind !== 'divider' && kind !== 'workspace') {
      root.append(makeButton('‹/›', `编辑${label}源码`, () => {
        const frontmatter = kind === 'frontmatter';
        const anchor = frontmatter ? Math.min(to + 1, view.state.doc.length) : to;
        view.dispatch({
          selection: { anchor },
          effects: [
            ...(this.folded ? [toggleFold.of(from)] : []),
            EditorView.scrollIntoView(anchor, { y: 'nearest' }),
          ],
        });
        view.focus();
      }));
    }
    return root;
  }
}

function buildSyntaxDecorations(state: EditorState) {
  const { regions, toggled } = state.field(syntaxState);
  const decorations: Range<Decoration>[] = [];
  let hiddenThrough = -1;
  let depth = 0;
  const ends: number[] = [];
  const bodyLines = new Map<number, { kind: string; depth: number }>();
  // Process markers in document order, including closing markers of nested blocks.
  const markers = regions.flatMap((region) => region.close
    ? [{ region, pos: region.from, closing: false }, { region, pos: region.close.from, closing: true }]
    : [{ region, pos: region.from, closing: false }]);
  markers.sort((a, b) => a.pos - b.pos);

  for (const { region, pos, closing } of markers) {
    if (pos <= hiddenThrough) continue;
    if (closing) {
      if (ends[ends.length - 1] === pos) {
        ends.pop();
        depth--;
      }
      if (!touchesSelection(state, pos, region.close!.to)) {
        decorations.push(Decoration.replace({}).range(pos, region.close!.to));
      }
      decorations.push(Decoration.line({ class: 'md-block-end' }).range(pos));
      continue;
    }
    const { from, to, kind, close } = region;
    const selected = touchesSelection(state, from, to);
    const folded = Boolean(close) && (kind === 'frontmatter' ? !toggled.has(from) : toggled.has(from));
    const replacementEnd = folded && close ? close.to : to;
    const lineCount = close ? state.doc.lineAt(close.from).number - state.doc.lineAt(from).number - 1 : 0;
    if (folded && !touchesSelection(state, from, replacementEnd)) {
      decorations.push(Decoration.replace({
        widget: new SyntaxWidget(region, true, lineCount), block: true,
      }).range(from, replacementEnd));
      hiddenThrough = replacementEnd;
      continue;
    }
    if (close && kind !== 'frontmatter') {
      depth++;
      ends.push(close.from);
      const last = state.doc.lineAt(close.from).number;
      for (let number = state.doc.lineAt(from).number + 1; number < last; number++) {
        bodyLines.set(state.doc.line(number).from, { kind, depth });
      }
    }
    if (!selected) {
      decorations.push(Decoration.replace({
        widget: new SyntaxWidget(region, false, lineCount),
      }).range(from, to));
    }
    decorations.push(Decoration.line({
      class: `md-syntax-line md-syntax-${kind}${depth > 1 ? ' md-syntax-nested' : ''}`,
    }).range(from));
  }
  const markerLines = new Set(markers.map(({ pos }) => pos));
  for (const [position, { kind, depth }] of bodyLines) {
    if (markerLines.has(position)) continue;
    decorations.push(Decoration.line({
      attributes: { class: `md-block-body md-block-${kind}`, style: `--block-depth: ${Math.min(depth, 6)}` },
    }).range(position));
  }
  return Decoration.set(decorations, true);
}

const syntaxDecorations = StateField.define({
  create: buildSyntaxDecorations,
  update(value, transaction) {
    return transaction.docChanged || transaction.selection || transaction.effects.some((effect) => effect.is(toggleFold))
      ? buildSyntaxDecorations(transaction.state) : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

class BulletWidget extends WidgetType {
  toDOM() {
    const bullet = document.createElement('span');
    bullet.className = 'md-bullet-marker';
    bullet.textContent = '•';
    return bullet;
  }
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super(); }

  eq(other: ImageWidget) { return this.src === other.src && this.alt === other.alt; }

  toDOM() {
    const container = document.createElement('span');
    const image = document.createElement('img');
    container.className = 'md-image';
    image.alt = this.alt;
    image.src = this.src;
    image.addEventListener('error', () => { container.textContent = this.alt || '图片无法加载'; });
    container.append(image);
    return container;
  }
}

const markClasses: Record<string, string> = {
  Emphasis: 'md-emphasis', StrongEmphasis: 'md-strong', InlineCode: 'md-code',
  Strikethrough: 'md-strike', Link: 'md-link',
};

function markdownDecorations(view: EditorView) {
  const { state } = view;
  const decorations: Range<Decoration>[] = [];
  const seen = new Set<string>();
  const { regions } = state.field(syntaxState);
  const syntaxLines = new Set(regions.flatMap((region) => region.close
    ? [region.from, region.close.from] : [region.from]));
  const frontmatterEnd = regions[0]?.kind === 'frontmatter' ? regions[0].close?.to ?? 0 : -1;
  const hide = Decoration.replace({});

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter({ name, from: start, to: end, node }) {
        const firstLine = state.doc.lineAt(start);
        if (firstLine.from <= frontmatterEnd || syntaxLines.has(firstLine.from)) return;
        const key = `${name}:${start}:${end}`;
        if (seen.has(key)) return;
        seen.add(key);
        const lastLine = state.doc.lineAt(end);
        const active = touchesSelection(state, firstLine.from, lastLine.to);
        const heading = /^(ATX|Setext)Heading([1-6])$/.exec(name);
        if (heading) {
          decorations.push(Decoration.line({ class: `md-heading md-heading-${heading[2]}` }).range(firstLine.from));
        } else if (markClasses[name] && start < end) {
          decorations.push(Decoration.mark({ class: markClasses[name] }).range(start, end));
        }
        if (name === 'Image' && active) return false;
        if (active) return;
        if (name === 'Image' && firstLine.number === lastLine.number) {
          const source = node.getChild('URL');
          if (!source) return;
          const url = state.doc.sliceString(source.from, source.to).replace(/^<|>$/g, '');
          const alt = /^!\[([^\]]*)\]/.exec(state.doc.sliceString(start, end))?.[1] ?? '';
          try {
            const asset = new URL(url, new URL('/preview/', location.origin));
            if (['http:', 'https:'].includes(asset.protocol) || asset.href.startsWith('data:image/')) {
              decorations.push(Decoration.replace({ widget: new ImageWidget(asset.href, alt) }).range(start, end));
              return false;
            }
          } catch {
            return;
          }
        } else if (name === 'ListMark' && /^[-*+]$/.test(state.doc.sliceString(start, end))) {
          decorations.push(Decoration.replace({ widget: new BulletWidget() }).range(start, end));
        } else if (name === 'QuoteMark') {
          decorations.push(Decoration.mark({ class: 'md-quote-marker' }).range(start, end));
        } else if (name === 'HeaderMark') {
          const whitespace = /^[ \t]*/.exec(state.doc.sliceString(end, state.doc.lineAt(end).to))?.[0].length ?? 0;
          decorations.push(hide.range(start, end + whitespace));
        } else if (['EmphasisMark', 'CodeMark', 'StrikethroughMark'].includes(name)
                   && node.parent?.name !== 'FencedCode') {
          decorations.push(hide.range(start, end));
        } else if (name === 'Link' && !state.doc.sliceString(start, end).startsWith('<')) {
          const marks = node.getChildren('LinkMark');
          if (marks.length === 4) {
            decorations.push(hide.range(marks[0].from, marks[0].to), hide.range(marks[1].from, end));
          }
        }
      },
    });
  }
  return RangeSet.of(decorations, true);
}

const markdownPreview = ViewPlugin.fromClass(class {
  decorations;

  constructor(view: EditorView) {
    this.decorations = markdownDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged
        || syntaxTree(update.startState) !== syntaxTree(update.state)) {
      this.decorations = markdownDecorations(update.view);
    }
  }
}, { decorations: (plugin) => plugin.decorations });

export const livePreview = [syntaxState, syntaxDecorations, markdownPreview];
