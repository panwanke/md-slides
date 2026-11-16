import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, LockKeyhole, Mail, Presentation, Smartphone, QrCode } from 'lucide-react';
import ProjectControls from '../ui/ProjectControls';
import { sendEmailCode, sendPhoneCode, startWechatLogin, submitEmailCode, submitPhoneCode } from './auth';
import type { CloudUser } from './client';

type Tab = 'email' | 'phone';

export default function CloudLogin({ onSignedIn }: { onSignedIn: (user: CloudUser) => void }) {
  const [tab, setTab] = useState<Tab>('email');
  const [recipient, setRecipient] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendCode() {
    setBusy(true);
    setError('');
    try {
      const result = tab === 'email'
        ? await sendEmailCode(recipient.trim())
        : await sendPhoneCode(recipient.trim());
      if (result.error) {
        setError(result.error);
        return;
      }
      setCodeSent(true);
      setCountdown(60);
      const timer = window.setInterval(() => {
        setCountdown((value) => {
          if (value <= 1) {
            window.clearInterval(timer);
            return 0;
          }
          return value - 1;
        });
      }, 1000);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = tab === 'email'
        ? await submitEmailCode(recipient.trim(), code.trim())
        : await submitPhoneCode(recipient.trim(), code.trim());
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.user) onSignedIn(result.user);
      else setError('登录未完成，请重新获取验证码');
    } finally {
      setBusy(false);
    }
  }

  async function wechat() {
    setBusy(true);
    setError('');
    try {
      const result = await startWechatLogin();
      if (result.error) setError(result.error);
    } finally {
      setBusy(false);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    setRecipient('');
    setCode('');
    setCodeSent(false);
    setError('');
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark"><Presentation size={20} strokeWidth={1.8} /></span>
          <div>
            <h1>Slide Studio</h1>
            <p>登录后，演示稿保存在 WorkBuddy 云端，换设备也能继续编辑。</p>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="登录方式">
          <button type="button" role="tab" aria-selected={tab === 'email'} onClick={() => switchTab('email')}>
            邮箱验证码
          </button>
          <button type="button" role="tab" aria-selected={tab === 'phone'} onClick={() => switchTab('phone')}>
            手机验证码
          </button>
        </div>

        <form onSubmit={(event) => void submit(event)}>
          <label className="auth-field">
            <span>{tab === 'email' ? '邮箱' : '手机号'}</span>
            <div className="auth-input">
              {tab === 'email' ? <Mail size={16} /> : <Smartphone size={16} />}
              <input
                type={tab === 'email' ? 'email' : 'tel'}
                autoComplete={tab === 'email' ? 'email' : 'tel'}
                required
                value={recipient}
                placeholder={tab === 'email' ? 'you@example.com' : '11 位手机号'}
                onChange={(event) => {
                  setRecipient(event.target.value);
                  setCodeSent(false);
                  setError('');
                }}
              />
            </div>
          </label>

          <label className="auth-field">
            <span>验证码</span>
            <div className="auth-input"><LockKeyhole size={16} />
              <input
                type="text"
                inputMode="numeric"
                required
                minLength={6}
                maxLength={6}
                value={code}
                placeholder="6 位验证码"
                onChange={(event) => setCode(event.target.value)}
              />
              <button type="button" className="auth-code-button" disabled={busy || countdown > 0}
                onClick={() => void sendCode()}>
                {countdown > 0 ? `${countdown}s` : codeSent ? '重新发送' : '获取验证码'}
              </button>
            </div>
          </label>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button type="submit" className="auth-submit" disabled={busy || !codeSent}>
            {busy ? '请稍候…' : '登录 / 注册'}<ArrowRight size={16} />
          </button>
        </form>

        <button type="button" className="auth-submit auth-oauth" disabled={busy} onClick={() => void wechat()}>
          <QrCode size={16} /> 微信扫码登录
        </button>

        <ProjectControls />
        <p className="auth-footnote">由 WorkBuddy 云服务提供身份认证，无需在本应用保存密码。</p>
      </div>
    </div>
  );
}
