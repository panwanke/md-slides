import { useEffect, useRef, useState } from 'react';
import type { WorkspaceDirectoryHandle } from './workspace';

type SourceDetails =
  | { kind: 'markdown'; name: string; handle?: FileSystemFileHandle }
  | { kind: 'project'; name: string; handle?: WorkspaceDirectoryHandle };

export type RecentSource = SourceDetails & { id: string };

export interface RecentVisit {
  source: RecentSource;
  path: string;
}

export interface RecentHistory {
  markdown: RecentVisit[];
  projects: RecentVisit[];
}

const emptyHistory: RecentHistory = { markdown: [], projects: [] };
const storeName = 'recent';
const historyKey = 'history';
const sessionStoreName = 'session';
const sessionKey = 'current';
const limit = 8;

export interface SessionTab {
  sourceId: string;
  path: string;
  label: string;
}

export interface SessionState {
  tabs: SessionTab[];
  activeSourceId?: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('md-slide-studio-workspace', 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName);
      if (!database.objectStoreNames.contains(sessionStoreName)) database.createObjectStore(sessionStoreName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readHistory(): Promise<RecentHistory> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(storeName).objectStore(storeName).get(historyKey);
      request.onsuccess = () => resolve(request.result ?? emptyHistory);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

function withVisits(history: RecentHistory, visits: RecentVisit[]) {
  let { markdown, projects } = history;
  for (const visit of visits) {
    const sameSource = (item: RecentVisit) => item.source.id === visit.source.id;
    markdown = [visit, ...markdown.filter((item) => !sameSource(item) || item.path !== visit.path)].slice(0, limit);
    if (visit.source.kind === 'project') {
      projects = [visit, ...projects.filter((item) => !sameSource(item))].slice(0, limit);
    }
  }
  return { markdown, projects };
}

async function writeVisits(visits: RecentVisit[], fallback: RecentHistory): Promise<RecentHistory> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.get(historyKey);
      let next = fallback;
      request.onsuccess = () => {
        next = withVisits(request.result ?? fallback, visits);
        store.put(next, historyKey);
      };
      transaction.oncomplete = () => resolve(next);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function identifySource(details: SourceDetails, known: RecentSource[], expected?: RecentSource) {
  let previous = expected;
  if (!previous && details.handle) {
    for (const candidate of known) {
      if (candidate.kind === details.kind && candidate.name === details.name && candidate.handle
          && await details.handle.isSameEntry(candidate.handle).catch(() => false)) {
        previous = candidate;
        break;
      }
    }
  }
  const id = previous?.id ?? (crypto.randomUUID?.() || Math.random().toString(36).slice(2));
  return { ...details, id };
}

export async function requestAccess(handle: FileSystemHandle, mode: 'read' | 'readwrite') {
  const accessible = handle as FileSystemHandle & {
    requestPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  };
  // Request permission before any other asynchronous work can consume user activation.
  return !accessible.requestPermission || await accessible.requestPermission({ mode }) === 'granted';
}

export async function hasAccess(handle: FileSystemHandle | undefined, mode: 'read' | 'readwrite') {
  if (!handle) return false;
  const accessible = handle as FileSystemHandle & {
    queryPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  };
  return !accessible.queryPermission || await accessible.queryPermission({ mode }) === 'granted';
}

export async function readSession(): Promise<SessionState | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(sessionStoreName).objectStore(sessionStoreName).get(sessionKey);
      request.onsuccess = () => resolve(request.result ?? undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function writeSession(session: SessionState): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(sessionStoreName, 'readwrite');
      transaction.objectStore(sessionStoreName).put(session, sessionKey);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export function useRecentHistory() {
  const [history, setHistory] = useState(emptyHistory);
  const pending = useRef<Promise<RecentHistory>>();

  function getHistory() {
    return pending.current ??= readHistory().catch(() => emptyHistory);
  }

  useEffect(() => {
    void getHistory().then(setHistory);
  }, []);

  function remember(visits: RecentVisit[]) {
    const update = getHistory().then((current) =>
      writeVisits(visits, current).catch(() => withVisits(current, visits)));
    pending.current = update;
    void update.then(setHistory);
  }

  return { history, getHistory, remember };
}
