import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, LockKeyhole, Mail, Presentation } from 'lucide-react';
import ProjectControls from './ProjectControls';

export interface StudioUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export default function Login({ onSignedIn }: { onSignedIn: (user: StudioUser) => void }) {
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/auth/${registering ? 'signup' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.detail || '操作失败，请稍后重试');
        return;
      }
      onSignedIn(data.user as StudioUser);
    } catch {
      setError('无法连接服务器，请确认服务已启动');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark"><Presentation size={20} strokeWidth={1.8} /></span>
          <div>
            <h1>Slide Studio</h1>
            <p>登录后，演示稿保存在服务端，换设备也能继续编辑。</p>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="账号操作">
          <button type="button" role="tab" aria-selected={!registering}
            onClick={() => { setRegistering(false); setError(''); }}>登录</button>
          <button type="button" role="tab" aria-selected={registering}
            onClick={() => { setRegistering(true); setError(''); }}>注册</button>
        </div>

        <form onSubmit={(event) => void submit(event)}>
          <label className="auth-field">
            <span>邮箱</span>
            <div className="auth-input"><Mail size={16} />
              <input type="email" autoComplete="email" required value={email}
                placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} /></div>
          </label>
          <label className="auth-field">
            <span>密码</span>
            <div className="auth-input"><LockKeyhole size={16} />
              <input type="password" autoComplete={registering ? 'new-password' : 'current-password'}
                required minLength={8} value={password} placeholder="至少 8 位"
                onChange={(e) => setPassword(e.target.value)} /></div>
          </label>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? '请稍候…' : registering ? '创建账号' : '登录'}
            {!busy && <ArrowRight size={16} />}
          </button>
        </form>

        <ProjectControls />
        <p className="auth-footnote">
          账号与数据存于本机服务端数据库（可用 <code>JC_STUDIO_DB</code> 指定位置）。
        </p>
      </div>
    </div>
  );
}
