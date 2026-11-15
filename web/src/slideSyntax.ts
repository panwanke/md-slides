import type { Text } from '@codemirror/state';

export const layouts = [
  ['', '自动'],
  ['cover', '封面'],
  ['bullets', '要点'],
  ['two-col', '双栏图文'],
  ['figure', '全幅图件'],
  ['table', '表格'],
  ['section', '章节页'],
  ['toc', '目录'],
  ['journal', '期刊信息'],
  ['quote', '引文'],
  ['end', '结语'],
] as const;

export const transitions = [
  ['', '默认'],
  ['fade', '淡入'],
  ['slide', '滑动'],
  ['none', '无'],
] as const;

export const effects = [
  ['fade', '淡入'],
  ['fade-up', '上浮淡入'],
  ['none', '无'],
] as const;

export const blockNames = { notes: '讲稿', box: '重点卡片', fragment: '分步动画' };
export type BlockKind = keyof typeof blockNames;

export const slideDirective = /^(<!--\s*slide:\s*)(.*?)(\s*-->[ \t]*)$/i;
const blockStart = /^\s*:::\s*(\w+)(?:\s+(.*?))?\s*$/;
const workspaceMarker = /^\s*<!--[ \t]*(?:slides:start|slides|@slides)[ \t]*-->\s*$/;

type SyntaxKind = BlockKind | 'meta' | 'comment' | 'divider' | 'workspace' | 'frontmatter';

export interface SyntaxRegion {
  kind: SyntaxKind;
  from: number;
  to: number;
  text: string;
  close?: { from: number; to: number };
}

const syntaxCache = new WeakMap<Text, SyntaxRegion[]>();

export function scanSlideSyntax(doc: Text) {
  const cached = syntaxCache.get(doc);
  if (cached) return cached;
  const regions: SyntaxRegion[] = [];
  const stack: (SyntaxRegion | null)[] = [];
  let firstBodyLine = 1;

  if (doc.line(1).text.startsWith('---')) {
    for (let number = 2; number <= doc.lines; number++) {
      const line = doc.line(number);
      if (line.text.trim() === '---') {
        regions.push({
          kind: 'frontmatter', from: 0, to: doc.line(1).to, text: doc.line(1).text, close: line,
        });
        firstBodyLine = number + 1;
        break;
      }
    }
  }

  let fence: { char: string; size: number } | undefined;
  let inComment = false;
  for (let number = firstBodyLine; number <= doc.lines; number++) {
    const { text, from, to } = doc.line(number);
    const trimmed = text.trim();
    const codeMark = trimmed.match(/^(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (codeMark?.[1][0] === fence.char && codeMark[1].length >= fence.size && !codeMark[2]) {
        fence = undefined;
      }
      continue;
    }
    if (inComment) {
      if (trimmed.includes('-->')) inComment = false;
      continue;
    }
    if (codeMark) {
      fence = { char: codeMark[1][0], size: codeMark[1].length };
      continue;
    }
    if (trimmed.startsWith('<!--') && !trimmed.includes('-->')) {
      inComment = true;
      continue;
    }
    if (trimmed === ':::') {
      const opening = stack.pop();
      if (opening) opening.close = { from, to };
      continue;
    }
    if (trimmed.startsWith(':::')) {
      const kind = text.match(blockStart)?.[1].toLowerCase();
      const region = kind && Object.prototype.hasOwnProperty.call(blockNames, kind)
        ? { kind: kind as BlockKind, from, to, text }
        : null;
      stack.push(region);
      if (region) regions.push(region);
      continue;
    }
    if (slideDirective.test(text)) regions.push({ kind: 'meta', from, to, text });
    else if (workspaceMarker.test(text)) regions.push({ kind: 'workspace', from, to, text });
    else if (/^<!--.*-->$/.test(trimmed)) regions.push({ kind: 'comment', from, to, text });
    else if (!stack.length && /^-{3,}$/.test(trimmed)) {
      regions.push({ kind: 'divider', from, to, text });
    }
  }
  syntaxCache.set(doc, regions);
  return regions;
}

export function getAttribute(text: string, key: string) {
  const matches = text.matchAll(new RegExp(`(?:^|[|\\s])${key}=([^|\\s]*)`, 'gi'));
  let value = '';
  for (const match of matches) value = match[1];
  return value;
}

export function setAttribute(text: string, key: string, value: string, separator = ' | ') {
  const pattern = new RegExp(`(^|[|\\s])(${key}=)[^|\\s]*`, 'gi');
  const matches = Array.from(text.matchAll(pattern));
  if (!value) {
    for (const match of matches.reverse()) {
      const at = match.index! + match[1].length;
      const end = match.index! + match[0].length;
      const before = text.slice(0, at);
      const after = text.slice(end);
      const leftSeparator = /\s*\|\s*$/.exec(before);
      text = leftSeparator
        ? before.slice(0, leftSeparator.index) + after
        : before + after.replace(/^\s*(?:\|\s*)?/, '');
    }
    return text.trim();
  }
  const match = matches[matches.length - 1];
  if (!match) return text ? `${text}${separator}${key}=${value}` : `${key}=${value}`;
  const start = match.index! + match[1].length + match[2].length;
  return text.slice(0, start) + value + text.slice(match.index! + match[0].length);
}

export function updateDirective(line: string, key: string, value: string) {
  const parts = line.match(slideDirective);
  if (!parts) return line;
  const content = setAttribute(parts[2], key, value);
  const suffix = content && parts[3].startsWith('-->') ? ` ${parts[3]}` : parts[3];
  return parts[1] + content + suffix;
}

export function blockArgument(text: string) {
  return text.match(blockStart)?.[2] ?? '';
}

export function updateBlockArgument(text: string, arg: string) {
  const prefix = text.match(/^\s*:::\s*\w+/)?.[0] ?? text;
  return arg ? `${prefix} ${arg}` : prefix;
}
