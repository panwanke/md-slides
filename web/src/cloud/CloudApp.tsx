import { useEffect, useState } from 'react';
import Library from '../ui/Library';
import type { StudioUser } from '../ui/Login';
import CloudDeckView from './CloudDeckView';
import CloudLogin from './CloudLogin';
import { currentUser, restoreAuthFromCallback, signOutCloud } from './auth';
import type { CloudUser } from './client';

function toStudioUser(user: CloudUser): StudioUser {
  return {
    id: user.id,
    email: user.email || user.name || 'WorkBuddy 用户',
    displayName: user.displayName || user.name || null,
    createdAt: user.createdAt || new Date().toISOString(),
  };
}

function deckIdFromHash(hash: string): number | null {
  const match = /^#\/deck\/(\d+)$/.exec(hash);
  return match ? Number(match[1]) : null;
}

export default function CloudApp() {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [hash, setHash] = useState(() => location.hash);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const result = await restoreAuthFromCallback();
        if (!disposed) {
          setUser(result.user);
          setError(result.error || '');
        }
      } catch {
        const fallback = await currentUser();
        if (!disposed) setUser(fallback);
      } finally {
        if (!disposed) setChecking(false);
      }
    })();
    const onHash = () => setHash(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => {
      disposed = true;
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  async function signOut() {
    await signOutCloud();
    setUser(null);
    location.hash = '#/login';
  }

  if (checking) return <div className="boot-screen">正在连接 WorkBuddy 云服务…</div>;
  if (!user) return <CloudLogin onSignedIn={setUser} />;

  const deckId = deckIdFromHash(hash);
  if (deckId !== null) {
    return (
      <CloudDeckView
        deckId={deckId}
        userLabel={user.displayName || user.name || user.email || '用户'}
        onExit={() => { location.hash = '#/library'; }}
      />
    );
  }

  return (
    <>
      {error && <p className="export-error" role="alert">{error}</p>}
      <Library user={toStudioUser(user)} onSignOut={() => void signOut()} />
    </>
  );
}
