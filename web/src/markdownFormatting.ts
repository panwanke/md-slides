import { isolateHistory } from '@codemirror/commands';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { Prec } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import type { MarkdownConfig } from '@lezer/markdown';
import { scanSlideSyntax } from './slideSyntax';

export const markdownFormats = {
  bold: { label: '加粗', key: 'Mod-b', node: 'StrongEmphasis', marker: '**' },
  italic: { label: '斜体', key: 'Mod-i', node: 'Emphasis', marker: '*' },
  strike: { label: '删除线', key: 'Mod-Shift-x', node: 'Strikethrough', marker: '~~' },
  code: { label: '行内代码', key: 'Mod-e', node: 'InlineCode', marker: '`' },
  highlight: { label: '高亮', key: 'Mod-Shift-h', node: 'InlineHighlight', marker: '==' },
};

type Format = keyof typeof markdownFormats;
export type FormatAction = { kind: Format } | { kind: 'color'; value: string | null };
export type MenuPosition = { x: number; y: number };

export const colorOpening = /^<span style="color:(#[0-9a-fA-F]{6})">/;
const colorClosing = '</span>';
const colorMark = { resolve: 'InlineColor', mark: 'InlineColorMark' };
const highlightMark = { resolve: 'InlineHighlight', mark: 'InlineHighlightMark' };

export const presentationSyntax: MarkdownConfig = {
  defineNodes: ['InlineColor', 'InlineColorMark', 'InlineHighlight', 'InlineHighlightMark'],
  parseInline: [
    {
      name: 'InlineColor',
      before: 'HTMLTag',
      parse(context, next, position) {
        if (next !== 60) return -1;
        const source = context.text.slice(position - context.offset);
        const open = colorOpening.exec(source)?.[0];
        if (open) return context.addDelimiter(colorMark, position, position + open.length, true, false);
        if (source.startsWith(colorClosing) && context.findOpeningDelimiter(colorMark) !== null) {
          return context.addDelimiter(colorMark, position, position + colorClosing.length, false, true);
        }
        return -1;
      },
    },
    {
      name: 'InlineHighlight',
      parse(context, next, position) {
        if (next !== 61) return -1;
        const { text, offset } = context;
        const index = position - offset;
        if (text[index + 1] !== '=' || text[index - 1] === '=' || text[index + 2] === '=') return -1;
        const left = text[index - 1];
        const right = text[index + 2];
        return context.addDelimiter(highlightMark, position, position + 2,
          Boolean(right && /\S/.test(right)), Boolean(left && /\S/.test(left)));
      },
    },
  ],
};

type SyntaxTree = ReturnType<typeof syntaxTree>;
const protectedBlocks = new Set(['FencedCode', 'CodeBlock', 'CommentBlock', 'HTMLBlock', 'LinkReference']);
const protectedInlines = new Set(['InlineCode', 'InlineMath', 'DisplayMath', 'URL', 'HTMLTag']);
const textPrefix = /^(?:[ \t]*>[ \t]?)*[ \t]*(?:#{1,6}[ \t]+|(?:[-+*]|\d+\.)[ \t]+(?:\[[ xX]\][ \t]+)?)?/;

function protectedPosition(tree: SyntaxTree, position: number, side: 1 | -1, kind: FormatAction['kind']) {
  for (let node = tree.resolveInner(position, side); node; node = node.parent!) {
    if (protectedBlocks.has(node.name)) return true;
    if (node.name === 'InlineCode' && kind === 'code') continue;
    if (protectedInlines.has(node.name) && node.from < position && position < node.to) return true;
  }
  return false;
}

function formattedSpan(state: EditorState, tree: SyntaxTree, kind: FormatAction['kind'], from: number, to: number) {
  const name = kind === 'color' ? 'InlineColor' : markdownFormats[kind].node;
  for (let node = tree.resolveInner(from, 1); node && node.to >= to; node = node.parent!) {
    if (node.name !== name || node.to === from) continue;
    const open = node.firstChild;
    const close = node.lastChild;
    if (!open || !close) continue;
    if ((node.from === from && node.to === to) || (from >= open.to && to <= close.from)) {
      let contentFrom = open.to;
      let contentTo = close.from;
      const source = state.doc.sliceString(contentFrom, contentTo);
      if (kind === 'code' && source.startsWith(' ') && source.endsWith(' ') && source.trim()) {
        contentFrom++;
        contentTo--;
      }
      return { from: node.from, to: node.to, contentFrom, contentTo };
    }
  }
  if (from !== to || kind === 'color') return;
  // Empty markers are usually not yet valid Markdown, but can be toggled off again.
  const marker = markdownFormats[kind].marker;
  const before = from - marker.length;
  const after = to + marker.length;
  if (before >= 0 && after <= state.doc.length && state.doc.sliceString(before, after) === marker + marker) {
    return { from: before, to: after, contentFrom: from, contentTo: to };
  }
}

function formatEdit(state: EditorState, tree: SyntaxTree, action: FormatAction, from: number, to: number) {
  const span = formattedSpan(state, tree, action.kind, from, to);
  if (!span && action.kind === 'color' && action.value === null) return;
  const contentFrom = span?.contentFrom ?? from;
  const body = state.doc.sliceString(contentFrom, span?.contentTo ?? to);
  let open = '';
  let close = '';
  if (action.kind === 'color') {
    if (action.value !== null) {
      open = '<span style="color:' + action.value + '">';
      close = colorClosing;
    }
  } else if (!span) {
    open = close = markdownFormats[action.kind].marker;
    if (action.kind === 'code') {
      const longest = Math.max(0, ...Array.from(body.matchAll(/`+/g), (match) => match[0].length));
      const fence = open.repeat(longest + 1);
      const pad = body.startsWith(open) || body.endsWith(open) ? ' ' : '';
      open = fence + pad;
      close = pad + fence;
    }
  }
  const clamp = (position: number) => Math.min(body.length, Math.max(0, position - contentFrom));
  return {
    change: { from: span?.from ?? from, to: span?.to ?? to, insert: open + body + close },
    start: open.length + clamp(from),
    end: open.length + clamp(to),
  };
}

export function applyMarkdownFormat(view: EditorView, action: FormatAction) {
  if (action.kind === 'color' && action.value !== null && !/^#[0-9a-fA-F]{6}$/.test(action.value)) return false;
  const { state } = view;
  const { doc, selection: { main } } = state;
  const tree = ensureSyntaxTree(state, main.to) ?? syntaxTree(state);
  const firstRegion = scanSlideSyntax(doc)[0];
  const frontmatterEnd = firstRegion?.kind === 'frontmatter' ? firstRegion.close?.to ?? -1 : -1;
  const edits = [];

  const first = doc.lineAt(main.from).number;
  const last = doc.lineAt(main.empty ? main.to : main.to - 1).number;
  for (let number = first; number <= last; number++) {
    const line = doc.line(number);
    if (line.from <= frontmatterEnd || /^\s*(:::|<!--)/.test(line.text) || /^\s*(?:-{2,}|\+{3,})\s*$/.test(line.text)) continue;
    const prefix = textPrefix.exec(line.text)?.[0].length ?? 0;
    let from = Math.max(main.from, line.from + prefix);
    let to = Math.min(main.to, line.to);
    if (from > to) continue;
    const raw = doc.sliceString(from, to);
    if (line.text.trimStart().startsWith('|') && (raw.includes('|') || /^[| :\-]+$/.test(line.text))) continue;
    if (!main.empty) {
      const content = raw.trim();
      if (!content) continue;
      from += raw.length - raw.trimStart().length;
      to = from + content.length;
    }
    if (protectedPosition(tree, from, 1, action.kind) || protectedPosition(tree, to, -1, action.kind)) continue;
    const edit = formatEdit(state, tree, action, from, to);
    if (!edit || edit.change.insert === doc.sliceString(edit.change.from, edit.change.to)) continue;
    const previous = edits[edits.length - 1];
    if (previous && previous.change.from === edit.change.from && previous.change.to === edit.change.to) {
      // A Markdown span can already wrap several selected lines.
      previous.end = edit.end;
    } else if (!previous || previous.change.to <= edit.change.from) {
      edits.push(edit);
    }
  }

  if (!edits.length) return false;
  const changes = state.changes(edits.map((edit) => edit.change));
  const firstEdit = edits[0];
  const lastEdit = edits[edits.length - 1];
  const from = changes.mapPos(firstEdit.change.from, -1) + firstEdit.start;
  const to = changes.mapPos(lastEdit.change.from, -1) + lastEdit.end;
  view.dispatch({
    changes,
    selection: main.anchor > main.head ? { anchor: to, head: from } : { anchor: from, head: to },
    scrollIntoView: true,
    annotations: isolateHistory.of('full'),
    userEvent: 'input.format',
  });
  return true;
}

export const markdownFormatKeys = Prec.high(keymap.of(
  (Object.keys(markdownFormats) as Format[]).map((kind) => ({
    key: markdownFormats[kind].key,
    run: (view) => applyMarkdownFormat(view, { kind }),
    preventDefault: true,
  })),
));
