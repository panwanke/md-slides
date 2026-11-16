import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Github, Settings2, X } from 'lucide-react';
import {
  defaultShortcuts, shortcutActions, shortcutFromEvent, shortcutLabels, shortcutText, useShortcuts,
} from '../shortcuts';
import type { ShortcutAction } from '../shortcuts';

export default function ProjectControls() {
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
