import type { EditorSelection, Mode } from '../editorSession';

export type Pane = 'outline' | 'editor' | 'preview';

interface ViewState {
  page: number;
  mode: Mode;
  pane: Pane;
  selection?: EditorSelection;
  closed: string[];
  stepped: boolean;
  step: number;
}

const keyPrefix = 'md-slide-studio-view:';

export function readWorkbenchView(key: string): ViewState | undefined {
  try {
    const raw = localStorage.getItem(keyPrefix + key);
    if (!raw) return;
    const value = JSON.parse(raw) as Partial<ViewState>;
    const selection = value.selection;
    return {
      page: Number.isSafeInteger(value.page) ? value.page! : 1,
      mode: value.mode === 'source' ? 'source' : 'live',
      pane: value.pane === 'outline' || value.pane === 'preview' ? value.pane : 'editor',
      selection: Number.isSafeInteger(selection?.anchor) && Number.isSafeInteger(selection?.head) ? selection : undefined,
      closed: Array.isArray(value.closed) ? value.closed.filter((id) => typeof id === 'string') : [],
      stepped: value.stepped === true,
      step: Number.isSafeInteger(value.step) && value.step! >= 0 ? value.step! : 0,
    };
  } catch { /* Invalid or unavailable browser storage. */ }
}

export function writeWorkbenchView(key: string, state: ViewState) {
  try {
    localStorage.setItem(keyPrefix + key, JSON.stringify(state));
  } catch { /* Continue without browser storage. */ }
}
