import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bold, Code2, Eraser, Highlighter, Italic, Strikethrough } from 'lucide-react';
import { markdownFormats } from '../markdownFormatting';
import type { FormatAction, MenuPosition } from '../markdownFormatting';
import { shortcutText } from '../shortcuts';

const icons = { bold: Bold, italic: Italic, strike: Strikethrough, code: Code2, highlight: Highlighter };
const colors = [
  ['红色', '#b33e38'], ['橙色', '#a25c15'], ['绿色', '#247052'],
  ['蓝色', '#2563b5'], ['紫色', '#744ba1'], ['灰色', '#57636d'],
] as const;

export function MarkdownContextMenu({ position, onClose, onFormat }: {
  position: MenuPosition;
  onClose: (restoreFocus: boolean) => void;
  onFormat: (action: FormatAction) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  useLayoutEffect(() => {
    const panel = menu.current!;
    const margin = 8;
    panel.style.left = Math.max(margin, Math.min(position.x + 3, window.innerWidth - panel.offsetWidth - margin)) + 'px';
    panel.style.top = Math.max(margin, Math.min(position.y + 3, window.innerHeight - panel.offsetHeight - margin)) + 'px';
    panel.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [position]);

  useEffect(() => {
    function outside(event: Event) {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) onClose(false);
    }
    function dismiss() { onClose(false); }
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
    };
  }, [onClose]);

  return createPortal(
    <div className="markdown-menu" ref={menu} role="menu" aria-label="Markdown 格式" onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose(true);
        return;
      }
      const buttons = items();
      const current = buttons.findIndex((button) => button === document.activeElement);
      let next: number;
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight': next = (current + 1) % buttons.length; break;
        case 'ArrowUp':
        case 'ArrowLeft': next = (current + buttons.length - 1) % buttons.length; break;
        case 'Home': next = 0; break;
        case 'End': next = buttons.length - 1; break;
        default: return;
      }
      event.preventDefault();
      buttons[next]?.focus();
    }}>
      {(Object.keys(markdownFormats) as (keyof typeof markdownFormats)[]).map((kind) => {
        const { label, key } = markdownFormats[kind];
        const Icon = icons[kind];
        const shortcut = key.split('-').map((part) => part.length === 1 ? part.toUpperCase() : part).join('+');
        return (
          <button key={kind} type="button" role="menuitem" tabIndex={-1} className="markdown-menu-action"
            onClick={() => onFormat({ kind })}>
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
            <kbd aria-hidden="true">{shortcutText(shortcut)}</kbd>
          </button>
        );
      })}
      <div className="markdown-menu-divider" role="separator" />
      <div role="group" aria-label="字体颜色">
        <div className="markdown-menu-label" aria-hidden="true">字体颜色</div>
        <div className="markdown-menu-colors">
          {colors.map(([label, value]) => (
            <button type="button" role="menuitem" tabIndex={-1} key={value} className="markdown-menu-swatch"
              aria-label={'字体颜色：' + label} title={label} onClick={() => onFormat({ kind: 'color', value })}>
              <span style={{ backgroundColor: value }} />
            </button>
          ))}
        </div>
        <button type="button" role="menuitem" tabIndex={-1} className="markdown-menu-action"
          onClick={() => onFormat({ kind: 'color', value: null })}>
          <Eraser size={15} aria-hidden="true" /><span>清除字体颜色</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
