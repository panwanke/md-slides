import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MutableRefObject, ReactNode } from 'react';
import { ChevronDown, ChevronRight, FileText, FolderOpen, History, X } from 'lucide-react';
import { shortcutText, useShortcuts } from '../shortcuts';
import type { RecentHistory, RecentVisit } from '../store/recent';

export function FileMenu({ busy, children, onMarkdown, onWorkspace, history, onRecent }: {
  busy: boolean;
  children: ReactNode;
  onMarkdown: () => void;
  onWorkspace: () => void;
  history: RecentHistory;
  onRecent: (visit: RecentVisit, project: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<keyof RecentHistory>();
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { shortcuts } = useShortcuts();

  function close() {
    setOpen(false);
    setSection(undefined);
  }

  useEffect(() => {
    if (!open) return;
    function dismiss(event: Event) {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) close();
    }
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('focusin', dismiss);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('focusin', dismiss);
    };
  }, [open]);

  function choose(action: () => void) {
    close();
    trigger.current?.focus();
    action();
  }

  return (
    <div className="file-menu" ref={menu} onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        event.stopPropagation();
        close();
        trigger.current?.focus();
      }
    }}>
      <button type="button" className="button" ref={trigger} aria-expanded={open}
        aria-controls="workspace-file-menu" onClick={() => open ? close() : setOpen(true)}>
        文件 <ChevronDown size={13} aria-hidden="true" />
      </button>
      <div id="workspace-file-menu" className="file-menu-popover" role="group" aria-label="打开本地文件" hidden={!open}>
        <button type="button" disabled={busy} onClick={() => choose(onMarkdown)}>
          <FileText size={16} aria-hidden="true" /><span>打开 Markdown</span>
          <kbd aria-hidden="true">{shortcutText(shortcuts.openMarkdown)}</kbd>
        </button>
        <button type="button" disabled={busy} onClick={() => choose(onWorkspace)}>
          <FolderOpen size={16} aria-hidden="true" /><span>打开工作文件夹</span>
          <kbd aria-hidden="true">{shortcutText(shortcuts.openWorkspace)}</kbd>
        </button>
        <div className="file-menu-divider" />
        {([
          { id: 'markdown', label: '最近 Markdown', icon: History },
          { id: 'projects', label: '最近项目', icon: FolderOpen },
        ] as const).map(({ id, label, icon: Icon }) => (
          <div key={id} className="recent-menu-section">
            <button type="button" aria-expanded={section === id} aria-controls={`recent-${id}`}
              onClick={() => setSection(section === id ? undefined : id)}>
              <Icon size={16} aria-hidden="true" /><span>{label}</span>
              <ChevronRight className="recent-menu-chevron" size={14} aria-hidden="true" />
            </button>
            <div id={`recent-${id}`} role="group" aria-label={label} hidden={section !== id}>
              {history[id].length === 0 && <p>暂无记录</p>}
              {history[id].map((visit) => {
                const project = id === 'projects';
                const { source, path } = visit;
                const name = project ? source.name : path.split('/').pop();
                const location = source.kind === 'project' ? `${source.name}/${path}` : source.name;
                const detail = !project && source.kind === 'project' ? location.slice(0, location.lastIndexOf('/')) : '';
                const EntryIcon = project ? FolderOpen : FileText;
                return (
                  <button type="button" key={`${source.id}:${path}`} disabled={busy}
                    title={source.handle ? location : `${location} · 可能需要重新选择`}
                    onClick={() => choose(() => onRecent(visit, project))}>
                    <EntryIcon size={14} aria-hidden="true" />
                    <span className="recent-menu-name">{name}</span>
                    {detail && <span className="recent-menu-detail">{detail}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

interface Tab {
  id: number;
  label: string;
  hint?: string;
  folder: boolean;
  dirty: boolean;
  closable: boolean;
}

export function WorkspaceTabs({ tabs, activeId, busy, focusTab, onSelect, onClose }: {
  tabs: Tab[];
  activeId: number;
  busy: boolean;
  focusTab: MutableRefObject<boolean>;
  onSelect: (id: number, restoreFocus?: boolean) => void;
  onClose: (id: number) => void;
}) {
  const selected = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusTab.current) {
      selected.current?.focus({ preventScroll: true });
      focusTab.current = false;
    }
    selected.current?.parentElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId, focusTab]);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const tab = tabs[index];
    if (event.key === 'Delete' && tab.closable) {
      event.preventDefault();
      onClose(tab.id);
      return;
    }
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = (index + tabs.length - 1) % tabs.length; break;
      case 'ArrowRight': next = (index + 1) % tabs.length; break;
      case 'Home': next = 0; break;
      case 'End': next = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    onSelect(tabs[next].id, true);
  }

  return (
    <div className="workspace-tabs" role="tablist" aria-label="打开的文件和文件夹" aria-busy={busy}>
      {tabs.map((tab, index) => {
        const active = tab.id === activeId;
        const Icon = tab.folder ? FolderOpen : FileText;
        return (
          <div key={tab.id} className="workspace-tab" role="presentation" data-active={active} data-dirty={tab.dirty}>
            <button ref={active ? selected : undefined} type="button" className="workspace-tab-select"
              role="tab" id={`workspace-tab-${tab.id}`} aria-controls="workbench" aria-selected={active}
              aria-description={tab.dirty ? '未保存' : undefined}
              tabIndex={active ? 0 : -1} disabled={busy} title={tab.hint ?? tab.label}
              onClick={() => onSelect(tab.id, true)} onKeyDown={(event) => navigate(event, index)}>
              <Icon size={15} aria-hidden="true" />
              <span className="workspace-tab-label">{tab.label}</span>
              {tab.dirty && <span className="workspace-tab-dirty" aria-hidden="true" title="未保存" />}
            </button>
            {tab.closable && (
              <button type="button" className="workspace-tab-close" tabIndex={active ? 0 : -1} disabled={busy}
                aria-label={`关闭 ${tab.label}`} title={`关闭 ${tab.label}`} onClick={() => onClose(tab.id)}>
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
