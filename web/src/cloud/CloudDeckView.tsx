import { useEffect, useMemo, useRef, useState } from 'react';
import Workbench from '../App';
import { renderMarkdown } from '../render/pyodideEngine';
import { buildStandaloneHtml, CloudDeckStore, resolveCloudImages } from './store';

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
  const [missingAssets, setMissingAssets] = useState<string[]>([]);
  const blobUrl = useRef<string>();

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (!content) return;
      try {
        const { content: resolved, missing } = await resolveCloudImages(content, deckId);
        const result = await renderMarkdown(resolved, detectTheme(content));
        if (!cancelled) {
          setPreviewHtml(result.html);
          setMissingAssets(missing);
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

  async function present() {
    try {
      const html = await buildStandaloneHtml(content, deckId);
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      window.open(blobUrl.current, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : '演示文稿生成失败');
    }
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
        missingAssets={missingAssets.length ? missingAssets : undefined}
        renderStandalone={() => buildStandaloneHtml(content, deckId)}
        onDocChange={setContent}
        onPresent={() => void present()}
        onExit={onExit}
        userLabel={userLabel}
      />
    </>
  );
}
