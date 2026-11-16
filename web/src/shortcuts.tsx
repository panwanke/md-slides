import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export const shortcutLabels = {
  openMarkdown: '打开 Markdown',
  openWorkspace: '打开工作文件夹',
  save: '保存 Markdown',
};

export type ShortcutAction = keyof typeof shortcutLabels;
type Shortcuts = Record<ShortcutAction, string>;
export const shortcutActions = Object.keys(shortcutLabels) as ShortcutAction[];
export const defaultShortcuts: Shortcuts = {
  openMarkdown: 'Mod+O',
  openWorkspace: 'Mod+Alt+O',
  save: 'Mod+S',
};

const storageKey = 'md-slide-studio-shortcuts';
const shortcutPattern = /^Mod(?:\+Alt)?(?:\+Shift)?\+[A-Z0-9]$/;

function readShortcuts(): Shortcuts {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const saved = JSON.parse(raw) as Shortcuts;
      const bindings = shortcutActions.map((action) => saved[action]);
      if (bindings.every((binding) => typeof binding === 'string' && shortcutPattern.test(binding))
          && new Set(bindings).size === shortcutActions.length) return saved;
    }
  } catch { /* Use defaults if storage is unavailable or malformed. */ }
  return defaultShortcuts;
}

const ShortcutContext = createContext<{
  shortcuts: Shortcuts;
  updateShortcuts: (shortcuts: Shortcuts) => void;
} | null>(null);

export function ShortcutProvider({ children }: { children: ReactNode }) {
  const [shortcuts, setShortcuts] = useState(readShortcuts);

  function updateShortcuts(next: Shortcuts) {
    setShortcuts(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep session settings. */ }
  }

  return <ShortcutContext.Provider value={{ shortcuts, updateShortcuts }}>{children}</ShortcutContext.Provider>;
}

export function useShortcuts() {
  const settings = useContext(ShortcutContext);
  if (!settings) throw new Error('ShortcutProvider is required');
  return settings;
}

export function shortcutFromEvent(event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'getModifierState'>) {
  if (event.ctrlKey === event.metaKey || event.getModifierState('AltGraph')) return;
  const key = /^Digit[0-9]$/.test(event.code) ? event.code.slice(-1) : event.key.toUpperCase();
  if (!/^[A-Z0-9]$/.test(key)) return;
  return ['Mod', ...(event.altKey ? ['Alt'] : []), ...(event.shiftKey ? ['Shift'] : []), key].join('+');
}

export function shortcutText(binding: string) {
  return binding.replace('Mod', 'Ctrl/⌘').split('+').join(' + ');
}

export function useShortcut(action: ShortcutAction, enabled: boolean, run: () => void) {
  const binding = useShortcuts().shortcuts[action];
  useEffect(() => {
    if (!enabled) return;
    function handleKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || shortcutFromEvent(event) !== binding) return;
      if (document.querySelector('dialog[open]')) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) run();
    }
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [binding, enabled, run]);
}
