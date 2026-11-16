import type { Deck } from '../editorSession';
import type { RenderResult } from './pyodideEngine';
import { embedWorkspaceImages } from './workspaceImages';

async function request<T>(path: string, body: object): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    const detail = typeof problem?.detail === 'string' ? problem.detail : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function renderOnServer(content: string, theme?: string) {
  return request<RenderResult>('/api/render', { content, theme, standalone: true });
}

export async function parseOnServer(content: string) {
  const { ast } = await request<{ ast: Deck }>('/api/ast', { content });
  return ast;
}

export async function listServerThemes(): Promise<string[]> {
  const response = await fetch('/api/doctor');
  if (!response.ok) return [];
  const data = await response.json() as { themes?: string[] };
  return data.themes ?? [];
}

export async function exportServerDeck(content: string, assetBase = '/preview/') {
  const rendered = await renderOnServer(content);
  const root = assetBase.match(/^\/api\/decks\/\d+\/assets\//)?.[0] ?? '/preview/';
  const directory = decodeURIComponent(assetBase.slice(root.length));
  const embedded = await embedWorkspaceImages(rendered.html, {
    async read(path) {
      const url = root + path.split('/').map(encodeURIComponent).join('/');
      const response = await fetch(url);
      if (!response.ok) return;
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) return;
      return new File([blob], path, { type: blob.type });
    },
  }, directory + 'deck.md');
  return embedded.html;
}
