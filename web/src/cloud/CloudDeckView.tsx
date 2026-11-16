import { useEffect, useMemo, useRef, useState } from 'react';
import Workbench from '../App';
import { renderMarkdown } from '../render/pyodideEngine';
import { CloudDeckStore, resolveCloudImages } from './store';

interface Props {
  deckId: number;
  userLabel: string;
  onExit: () => void;
}

function detectTheme(content: string): string {
  const match = /theme:\s*["']?([^\s"']+)/.exec(content);
  return match?.[1] || '';
}

export default function CloudDeckView({ deckId, userLabel, onExit }: Props) {
  const store = useMemo(() => new CloudDeckStore(deckId), [deckId]);
  const [content, setContent] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string>();
  const [renderError, setRenderError] = useState('');
  const blobUrl = useRef<string>();

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (!content) return;
      try {
        const resolved = await resolveCloudImages(content, deckId);
        const result = await renderMarkdown(resolved, detectTheme(content));
        if (!cancelled) {
          setPreviewHtml(result.html);
          setRenderError('');
        }
      } catch (error) {
        if (!cancelled) setRenderError(error instanceof Error ? error.message : '预览失败');
      }
    }, content ? 260 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [content, deckId]);

  useEffect(() => () => {
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
  }, []);

  function present() {
    if (!previewHtml) return;
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = URL.createObjectURL(new Blob([previewHtml], { type: 'text/html;charset=utf-8' }));
    window.open(blobUrl.current, '_blank', 'noopener,noreferrer');
  }

  return (
    <>
      {renderError && <p className="export-error" role="alert">预览失败：{renderError}</p>}
      <Workbench
        key={deckId}
        store={store}
        deckId={deckId}
        clientRender
        previewSrcDoc={previewHtml}
        standaloneHtml={previewHtml}
        onDocChange={setContent}
        onPresent={present}
        onExit={onExit}
        userLabel={userLabel}
      />
    </>
  );
}
