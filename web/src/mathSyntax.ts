import type { MarkdownConfig } from '@lezer/markdown';

const delimiters = [
  { open: '$$', close: '$$', node: 'DisplayMath' },
  { open: '$', close: '$', node: 'InlineMath' },
  { open: '\\[', close: '\\]', node: 'DisplayMath' },
  { open: '\\(', close: '\\)', node: 'InlineMath' },
];

function isEscaped(text: string, index: number) {
  let backslashes = 0;
  for (let before = index - 1; text[before] === '\\'; before--) backslashes++;
  return backslashes % 2 === 1;
}

export const mathSyntax: MarkdownConfig = {
  defineNodes: ['InlineMath', 'DisplayMath', 'MathSource'],
  parseInline: [{
    name: 'Math',
    before: 'Escape',
    parse(context, next, position) {
      if (next !== 36 && next !== 92) return -1;
      const { text, offset } = context;
      const start = position - offset;
      const delimiter = delimiters.find(({ open }) => text.startsWith(open, start));
      if (!delimiter || isEscaped(text, start)) return -1;
      const from = start + delimiter.open.length;
      if (delimiter.open.startsWith('$') && (text[start - 1] === '$' || text[from] === '$')) return -1;

      let to = text.indexOf(delimiter.close, from);
      while (to !== -1 && isEscaped(text, to)) {
        to = text.indexOf(delimiter.close, to + delimiter.close.length);
      }
      if (to === -1) return -1;
      const expression = text.slice(from, to);
      if (!expression.trim() || (delimiter.node === 'InlineMath' && expression.includes('\n'))) return -1;
      if (delimiter.open === '$' && (/^\s|\s$/.test(expression) || text[to + 1] === '$')) return -1;

      const source = context.elt('MathSource', from + offset, to + offset);
      return context.addElement(
        context.elt(delimiter.node, position, offset + to + delimiter.close.length, [source]),
      );
    },
  }],
};
