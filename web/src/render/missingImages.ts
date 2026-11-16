/**
 * Mode-independent helpers for reporting images that failed to load.
 *
 * Three workbench modes render Markdown into a preview DOM, each with a
 * different image resolver:
 *   - local workspace: `workspaceImages.embedWorkspaceImages()` reads files
 *     from disk and already emits `missing`;
 *   - self-hosted: the server serves `/api/decks/{id}/preview` in an iframe,
 *     with a `<base href=".../assets/">` for relative paths;
 *   - cloud: `resolveCloudImages()` swaps paths for short-lived signed URLs.
 *
 * The badge in the workbench only needs a `string[]` of the paths the author
 * wrote. This module gives the DOM-rendered modes one shared way to discover
 * broken images after render, so we don't grow three separate detectors.
 */

/** Sources that are not document-relative asset paths (skip them entirely). */
export function isExternalImageSource(source: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|[/\\]|#)/i.test(source);
}

/** Strip query/hash and a leading `./` so paths match the Markdown authoring form. */
export function normalizeImagePath(source: string): string {
  return source.trim().replace(/^<|>$/g, '').replace(/^\.\//, '').split(/[?#]/, 1)[0];
}

/**
 * Scan a rendered preview document for `<img>` elements that finished loading
 * with no usable bitmap (`complete && naturalWidth === 0`).
 *
 * Only document-relative sources are considered: remote/absolute/data URLs are
 * outside the deck's asset store and should not be reported as missing assets.
 *
 * @param root The preview `<iframe>` document (works for both server modes).
 * @param toAuthored Optional mapper from a resolved `src` back to the path the
 *   author wrote (cloud signed URLs need this; self-hosted relative paths do not).
 */
export function scanBrokenImages(root: Document, toAuthored?: (src: string) => string): string[] {
  const missing = new Set<string>();
  for (const img of Array.from(root.querySelectorAll('img'))) {
    // complete=true with no intrinsic size at all means the browser gave up
    // on the URL. Requiring both axes to be empty avoids false positives on
    // sizeless-but-valid SVGs that still rendered.
    if (!img.complete || img.naturalWidth > 0 || img.naturalHeight > 0) continue;
    const raw = img.getAttribute('src') || '';
    if (!raw) continue;
    const source = toAuthored ? toAuthored(raw) : raw;
    if (!source || isExternalImageSource(source)) continue;
    missing.add(normalizeImagePath(source));
  }
  return [...missing];
}

/** Merge several missing-path lists into a stable, de-duplicated array. */
export function mergeMissingPaths(...lists: (string[] | undefined)[]): string[] {
  const merged = new Set<string>();
  for (const list of lists) {
    for (const path of list ?? []) {
      const normalized = normalizeImagePath(path);
      if (normalized) merged.add(normalized);
    }
  }
  return [...merged];
}
