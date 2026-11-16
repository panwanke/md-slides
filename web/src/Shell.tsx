import { useEffect, useMemo, useState } from 'react';
import Workbench from './App';
import { RemoteDeckStore } from './store/remote';
import Login from './ui/Login';
import type { StudioUser } from './ui/Login';
import Library from './ui/Library';
import './ui/shell.css';

type Mode = 'checking' | 'local' | 'library';

function deckIdFromHash(hash: string): number | null {
  const match = /^#\/deck\/(\d+)$/.exec(hash);
  return match ? Number(match[1]) : null;
}

/**
 * Chooses the run mode from the server itself:
 * - ``edit <file.md>``  -> /api/doctor reports a bound source -> local-file mode
 * - ``serve``           -> no bound source -> login + deck library
 *
 * Hash routing avoids adding server-side catch-all routes to the FastAPI app.
 */
export default function Shell() {
  const [mode, setMode] = useState<Mode>('checking');
  const [user, setUser] = useState<StudioUser | null>(null);
  const [hash, setHash] = useState(() => location.hash);

  useEffect(() => {
    const onChange = () => setHash(location.hash);
    const onUnauthorized = () => setUser(null);
    window.addEventListener('hashchange', onChange);
    window.addEventListener('md-slide-studio-unauthorized', onUnauthorized);
    window.addEventListener('jc-studio-unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('md-slide-studio-unauthorized', onUnauthorized);
      window.removeEventListener('jc-studio-unauthorized', onUnauthorized);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const doctor = await fetch('/api/doctor').then((response) => response.json());
        if (doctor.source) {
          if (!disposed) setMode('local');
          return;
        }
      } catch { /* no local file bound -> library mode */ }

      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const data = await response.json();
          if (!disposed) setUser(data.user as StudioUser);
        }
      } catch { /* offline: fall through to the login view */ }

      if (!disposed) setMode('library');
    })();
    return () => { disposed = true; };
  }, []);

  const deckId = deckIdFromHash(hash);
  const store = useMemo(
    () => (deckId === null ? undefined : new RemoteDeckStore(deckId)),
    [deckId],
  );

  async function signOut() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    setUser(null);
    location.hash = '#/login';
    setHash(location.hash);
  }

  function signedIn(next: StudioUser) {
    setUser(next);
    location.hash = '#/library';
    setHash(location.hash);
  }

  if (mode === 'checking') return <div className="boot-screen">正在检查运行模式…</div>;
  if (mode === 'local') return <Workbench />;
  if (!user) return <Login onSignedIn={signedIn} />;

  if (deckId !== null && store) {
    return (
      <Workbench
        key={deckId}
        deckId={deckId}
        store={store}
        previewUrl={`/api/decks/${deckId}/preview`}
        presentUrl={`/api/decks/${deckId}/preview?embedded=0`}
        onExit={() => { location.hash = '#/library'; }}
        userLabel={user.displayName || user.email}
      />
    );
  }

  return <Library user={user} onSignOut={() => void signOut()} />;
}
