import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Check, Github, Settings2, X } from 'lucide-react';
import {
  defaultShortcuts, shortcutActions, shortcutFromEvent, shortcutLabels, shortcutText, useShortcuts,
} from '../shortcuts';
import type { ShortcutAction } from '../shortcuts';

function formatJoined(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN');
}

/** Minimal account shape; `id` is not needed for display or rename. */
export interface AccountView {
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface AccountSettingsProps {
  user: AccountView;
  /** When omitted, the account section is read-only (cloud / static mode). */
  onUpdate?: (displayName: string) => Promise<void>;
}

function AccountSettings({ user, onUpdate }: AccountSettingsProps) {
  const [name, setName] = useState(user.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setName(user.displayName ?? '');
    setMessage('');
  }, [user.displayName]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!onUpdate) return;
    const next = name.trim();
    if (next === (user.displayName ?? '')) return;
    setSaving(true);
    setMessage('');
    try {
      await onUpdate(next);
      setMessage('已保存');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h3>账户信息</h3>
      <dl className="account-info">
        <div><dt>邮箱</dt><dd>{user.email}</dd></div>
        <div><dt>用户名</dt><dd>{user.displayName || '未设置'}</dd></div>
        <div><dt>注册时间</dt><dd>{formatJoined(user.createdAt)}</dd></div>
      </dl>
      {onUpdate && (
        <form className="account-name-form" onSubmit={(event) => void save(event)}>
          <label htmlFor="displayNameInput">修改用户名</label>
          <div className="account-name-row">
            <input id="displayNameInput" type="text" maxLength={40} value={name}
              placeholder="输入昵称" onChange={(event) => setName(event.target.value)} />
            <button type="submit" className="button" disabled={saving || name.trim() === (user.displayName ?? '')}>
              <Check size={14} />{saving ? '保存中…' : '保存'}
            </button>
          </div>
          {message && <p className="account-message" role="status">{message}</p>}
        </form>
      )}
    </>
  );
}

interface ProjectControlsProps {
  account?: AccountSettingsProps;
}

export default function ProjectControls({ account }: ProjectControlsProps = {}) {
  const { shortcuts, updateShortcuts } = useShortcuts();
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  function stopRecording() {
    setRecording(null);
    setError('');
  }

  function recordShortcut(event: KeyboardEvent<HTMLButtonElement>, action: ShortcutAction) {
    if (recording !== action || event.key === 'Tab' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (event.key === 'Escape') {
      stopRecording();
      return;
    }
    if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return;
    const binding = shortcutFromEvent(event);
    if (!binding) {
      setError('请同时按 Ctrl 或 ⌘ 和一个字母或数字。');
      return;
    }
    const conflict = shortcutActions.find((other) => other !== action && shortcuts[other] === binding);
    if (conflict) {
      setError(`此快捷键已用于「${shortcutLabels[conflict]}」。`);
      return;
    }
    updateShortcuts({ ...shortcuts, [action]: binding });
    stopRecording();
  }

  return (
    <div className="project-controls">
      <a className="button" href="https://github.com/panwanke/md-slides" target="_blank" rel="noopener noreferrer"
        aria-label="GitHub · Star" title="在 GitHub 查看项目并 Star">
        <Github size={16} /><span>GitHub · Star</span>
      </a>
      <button type="button" className="button" aria-label="设置" aria-haspopup="dialog" title="设置"
        onClick={() => dialog.current?.showModal()}>
        <Settings2 size={16} /><span>设置</span>
      </button>
      <dialog ref={dialog} className="shortcut-dialog" aria-labelledby={titleId} onClose={stopRecording}>
        <header className="shortcut-dialog-header">
          <h2 id={titleId}>设置</h2>
          <button type="button" className="icon-button" aria-label="关闭设置" onClick={() => dialog.current?.close()} autoFocus>
            <X size={18} />
          </button>
        </header>
        <section className="shortcut-dialog-body">
          {account && <AccountSettings {...account} />}
          <h3>快捷键</h3>
          <p>点击组合键后按下新键位，设置会保存在当前浏览器。</p>
          <dl className="shortcut-list">
            {shortcutActions.map((action) => (
              <div key={action} className="shortcut-row">
                <dt>{shortcutLabels[action]}</dt>
                <dd>
                  <button type="button" className="button shortcut-key" data-recording={recording === action}
                    aria-label={`${shortcutLabels[action]}快捷键，${shortcutText(shortcuts[action])}`}
                    onClick={() => {
                      setRecording(action);
                      setError('');
                    }}
                    onKeyDown={(event) => recordShortcut(event, action)}
                    onBlur={stopRecording}>
                    {recording === action ? '请按组合键' : <kbd>{shortcutText(shortcuts[action])}</kbd>}
                  </button>
                </dd>
              </div>
            ))}
          </dl>
          {error && <p className="shortcut-error" role="alert">{error}</p>}
        </section>
        <footer className="shortcut-dialog-footer">
          <button type="button" className="button" onClick={() => {
            updateShortcuts(defaultShortcuts);
            stopRecording();
          }}>恢复默认快捷键</button>
          <button type="button" className="button shortcut-done" onClick={() => dialog.current?.close()}>完成</button>
        </footer>
      </dialog>
    </div>
  );
}
