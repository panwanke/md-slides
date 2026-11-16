import { useEffect, useRef } from 'react';

type ObserverRecord = { type?: string };
type ObserverCallback = (records: ObserverRecord[]) => void;

interface FileSystemObserverLike {
  observe(handle: FileSystemHandle, options?: { recursive?: boolean }): Promise<void>;
  disconnect(): void;
}

type ObserverConstructor = new (callback: ObserverCallback) => FileSystemObserverLike;

function observerConstructor(): ObserverConstructor | undefined {
  return (globalThis as unknown as { FileSystemObserver?: ObserverConstructor }).FileSystemObserver;
}

/**
 * Notifies when a file changes outside the editor. Uses FileSystemObserver where available
 * (Chromium), falling back to polling the already-granted handle's metadata.
 * No-op when no handle is supplied (file-input / static mode).
 */
export function useFileWatcher(
  handle: FileSystemFileHandle | undefined,
  onChange: () => void,
) {
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    if (!handle) return;
    let disposed = false;
    let observer: FileSystemObserverLike | undefined;
    let timer: number | undefined;
    let lastModified = 0;
    let lastSize = 0;

    void handle.getFile().then((file) => {
      lastModified = file.lastModified;
      lastSize = file.size;
    }).catch(() => undefined);

    function startPolling() {
      if (disposed || timer !== undefined) return;
      timer = window.setInterval(async () => {
        if (disposed) return;
        try {
          const file = await handle!.getFile();
          if (file.lastModified === lastModified && file.size === lastSize) return;
          lastModified = file.lastModified;
          lastSize = file.size;
          callback.current();
        } catch {
          // Handle revoked or file removed; keep polling in case it comes back.
        }
      }, 1500);
    }

    const Observer = observerConstructor();
    if (Observer) {
      try {
        observer = new Observer((records) => {
          if (!disposed && records.some((record) => record.type === 'modified')) callback.current();
        });
        void observer.observe(handle, { recursive: false }).catch(() => {
          observer?.disconnect();
          observer = undefined;
          startPolling();
        });
      } catch {
        observer = undefined;
      }
    }
    if (!observer) startPolling();

    return () => {
      disposed = true;
      if (timer !== undefined) window.clearInterval(timer);
      observer?.disconnect();
    };
  }, [handle]);
}
