import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import type { Deck, SlideSummary } from '../editorSession';
import { layoutLabels } from '../slideSyntax';

export function slideTitle(slide: SlideSummary, deck: Deck) {
  if (slide.layout === 'cover') return deck.frontmatter.md_slide?.title || deck.frontmatter.jc?.title || deck.frontmatter.title || slide.title;
  return slide.title === `Slide ${slide.index}` ? '未命名幻灯片' : slide.title;
}

export function SlideOutline({ deck, activePage, closed, onToggle, onSelect, onMove }: {
  deck?: Deck;
  activePage: number;
  closed: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (page: number) => void;
  onMove: (deck: Deck, source: number, destination: number) => Promise<boolean>;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ deck: Deck; page: number }>();
  const [drop, setDrop] = useState<{ page: number; edge: 'before' | 'after' }>();
  const [moving, setMoving] = useState(false);
  const total = deck?.slides.length ?? 0;
  const canMove = total > 1 && !moving;

  function clearDrag() {
    setDrag(undefined);
    setDrop(undefined);
  }

  function dropPosition(page: number, row: HTMLElement, y: number) {
    if (!drag || drag.deck !== deck) return;
    const { top, height } = row.getBoundingClientRect();
    const edge = y < top + height / 2 ? 'before' : 'after';
    const insertion = page + (edge === 'after' ? 1 : 0);
    const destination = insertion - (drag.page < insertion ? 1 : 0);
    if (destination !== drag.page) return { page, edge, destination } as const;
  }

  async function move(source: number, destination: number, focusedRow?: HTMLButtonElement) {
    if (!deck || !canMove || destination < 1 || destination > total) return;
    setMoving(true);
    try {
      if (await onMove(deck, source, destination) && focusedRow) {
        window.requestAnimationFrame(() => {
          if (document.activeElement === focusedRow || document.activeElement === document.body) {
            list.current?.querySelector<HTMLButtonElement>(`#slide-item-${destination}`)?.focus();
          }
        });
      }
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="outline-list" id="slideList" ref={list} aria-busy={moving}>
      {deck?.sections.map((section) => (
        <div className="section-group" key={section.id}>
          <button type="button" className="section-header" aria-expanded={!closed.has(section.id)}
            aria-controls={`section-${section.id}`} onClick={() => onToggle(section.id)}>
            {closed.has(section.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            <span className="section-title" title={section.title}>{section.title}</span>
            <span className="section-count">{section.slides.length}</span>
          </button>
          <div className="section-slides" id={`section-${section.id}`} hidden={closed.has(section.id)}>
            {section.slides.map((slide) => {
              const { index } = slide;
              const title = slideTitle(slide, deck);
              return (
                <button type="button" key={index} className="slide-item" id={`slide-item-${index}`}
                  aria-current={activePage === index ? 'page' : undefined}
                  aria-keyshortcuts={total > 1 ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
                  draggable={canMove} data-dragging={drag?.page === index}
                  data-drop-edge={drop?.page === index ? drop.edge : undefined}
                  onClick={() => onSelect(index)}
                  onKeyDown={(event) => {
                    if (!event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) return;
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();
                    void move(index, index + (event.key === 'ArrowUp' ? -1 : 1), event.currentTarget);
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('application/x-md-slide', String(index));
                    setDrag({ deck, page: index });
                  }}
                  onDragEnd={clearDrag}
                  onDragOver={(event) => {
                    const position = dropPosition(index, event.currentTarget, event.clientY);
                    if (!position) {
                      setDrop(undefined);
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDrop((current) => current?.page === index && current.edge === position.edge ? current : position);
                  }}
                  onDragLeave={(event) => {
                    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
                    setDrop((current) => current?.page === index ? undefined : current);
                  }}
                  onDrop={(event) => {
                    const position = dropPosition(index, event.currentTarget, event.clientY);
                    if (!position || !drag) return;
                    event.preventDefault();
                    clearDrag();
                    void move(drag.page, position.destination);
                  }}>
                  <span className="slide-index">{String(index).padStart(2, '0')}</span>
                  <span className="slide-label">
                    <span className="slide-title" title={title}>{title}</span>
                    <span className="slide-layout">{layoutLabels.get(slide.layout) || (slide.layout === 'normal' ? '自动版式' : slide.layout)}</span>
                  </span>
                  {total > 1 && <span className="slide-grip" title="拖动调整顺序 · Alt + ↑ / ↓">
                    <GripVertical size={15} aria-hidden="true" />
                  </span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {deck && !total && <p className="outline-empty">使用 ＋ 新建幻灯片</p>}
    </div>
  );
}
