import type { Workspace } from '../store/workspace';

const imageTypes: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff',
};

function localPath(source: string, documentPath: string) {
  const parts = documentPath.split('/').slice(0, -1);
  const pathname = source.split(/[?#]/, 1)[0].replace(/\\/g, '/');
  try {
    for (const encoded of pathname.split('/')) {
      const part = decodeURIComponent(encoded);
      if (!part || part === '.') continue;
      if (part === '..') {
        if (!parts.length) return;
        parts.pop();
      } else {
        if (/[/\\\0]/.test(part)) return;
        parts.push(part);
      }
    }
    return parts.join('/');
  } catch {
    return undefined;
  }
}

function imageData(file: File, mime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file.slice(0, file.size, mime));
  });
}

export async function embedWorkspaceImages(html: string, workspace?: Pick<Workspace, 'read'>, documentPath = '') {
  // The renderer emits src first. Skip inline scripts, which can contain image markup as strings.
  const imageSource = /<script\b[^>]*>[\s\S]*?<\/script\s*>|<img src="([^"]+)"/gi;
  const sources = new Set(Array.from(html.matchAll(imageSource), (match) => match[1]).filter(Boolean));
  const attribute = document.createElement('textarea');
  const replacements = new Map<string, string>();
  const assets = new Map<string, Promise<string | undefined>>();
  const missing = new Map<string, string>();

  for (const encoded of sources) {
    attribute.innerHTML = encoded;
    const source = attribute.value.trim();
    if (/^(?:[a-z][a-z\d+.-]*:|[/\\]|#)/i.test(source)) continue;

    const path = localPath(source, documentPath);
    if (workspace && path) {
      const mime = imageTypes[path.slice(path.lastIndexOf('.') + 1).toLowerCase()];
      if (!assets.has(path)) {
        assets.set(path, workspace.read(path).then((file) => {
          if (!file) return;
          const type = mime || (file.type.startsWith('image/') ? file.type : '');
          if (type) return imageData(file, type);
        }).catch(() => undefined));
      }
      const data = await assets.get(path);
      if (data) {
        const fragment = encoded.indexOf('#');
        replacements.set(encoded, data + (fragment >= 0 ? encoded.slice(fragment) : ''));
        continue;
      }
    }
    missing.set(encoded, source);
  }

  const embedded = html.replace(imageSource, (tag, source: string) => {
    const data = replacements.get(source);
    return data ? '<img src="' + data + '"' : tag;
  });
  return {
    html: embedded,
    previewHtml: missing.size
      ? embedded.replace(imageSource, (tag, source: string) => missing.has(source) ? '<img' : tag)
      : embedded,
    missing: [...new Set(missing.values())],
  };
}
