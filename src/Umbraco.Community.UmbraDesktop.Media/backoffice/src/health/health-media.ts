import { IMAGE_EXTENSIONS } from './health-model.js';

/**
 * The sizes Media Health asks Umbraco's image resizer for (design §16.7): few, so the resizer's cache
 * answers the next window that asks. The URLs themselves are not built here: a site with an HMAC
 * secret, which Umbraco writes at install, refuses an unsigned resizer URL with 400 (found on the
 * first real run, §16.10), so they are signed on the server: an item's by core's own imaging route,
 * an orphaned file's by the add-on's `orphans/thumbnails` (§16.7).
 */

/**
 * A thumbnail's edge in CSS pixels: the cells and strips that show thumbnails are sized from it, and
 * the resizer is asked for it, so the two can never disagree.
 */
export const THUMB_EDGE = 120;

/**
 * The step the preview's width is rounded up to. Every window asks for one of a few widths rather
 * than its own, so a second look at the same picture, from any window, comes from the cache.
 */
export const PREVIEW_STEP = 400;

/**
 * The extension at the end of a name or URL, lower case, with any query left off.
 * @param nameOrUrl A file name or URL.
 * @returns The extension without the dot, or an empty string.
 */
function extensionOf(nameOrUrl: string): string {
  const path = nameOrUrl.split(/[?#]/)[0];
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * Whether the resizer can draw a file: a raster image by its extension. Never an SVG, which the
 * resizer does not touch, never a file without an extension, which it cannot tell, and nothing for
 * an item without a file, which shows an icon.
 * @param nameOrUrl A file name or URL, or null when there is none.
 * @returns True when a thumbnail or the preview can show it as a picture.
 */
export function isPreviewable(nameOrUrl: string | null): boolean {
  return !!nameOrUrl && IMAGE_EXTENSIONS.has(extensionOf(nameOrUrl));
}

/**
 * The edge to ask the resizer for, at the device's pixel ratio so a thumbnail stays sharp.
 * @param dpr The device pixel ratio.
 * @returns The edge in device pixels.
 */
export function thumbEdge(dpr: number): number {
  return Math.round(THUMB_EDGE * dpr);
}

/**
 * The preview's width to ask the resizer for: as wide as the window draws it, at the device's pixel
 * ratio, rounded up to {@link PREVIEW_STEP}, so a 14 MB original arrives as a few hundred KB.
 * @param cssWidth How wide the preview draws, in CSS pixels.
 * @param dpr The device pixel ratio.
 * @returns The width in device pixels.
 */
export function previewWidth(cssWidth: number, dpr: number): number {
  return Math.max(PREVIEW_STEP, Math.ceil((cssWidth * dpr) / PREVIEW_STEP) * PREVIEW_STEP);
}
