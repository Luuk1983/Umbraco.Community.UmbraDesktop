import type { UmbraDesktopResolvedWallpaper, UmbraDesktopWallpaperRef } from './types';
import type { UmbraDesktopBuiltInWallpaper } from './wallpapers.generated';
import { UMBRADESKTOP_BUILTIN_WALLPAPERS, UMBRADESKTOP_DEFAULT_WALLPAPER_ID } from './wallpapers.generated';

/**
 * Turning a stored wallpaper reference into something paintable. Pure: this module knows the
 * shipped catalogue but nothing about storage, the DOM, or the Media Library — a media item's
 * URL is resolved by the settings context and handed in.
 */

/**
 * Look up a shipped wallpaper.
 * @param id A wallpaper slug.
 * @returns The catalogue entry, or `undefined` when no image has that id.
 */
export function findBuiltInWallpaper(id: string): UmbraDesktopBuiltInWallpaper | undefined {
  return UMBRADESKTOP_BUILTIN_WALLPAPERS.find((wallpaper) => wallpaper.id === id);
}

/**
 * The default wallpaper. The build guarantees it exists, but the non-null assertion is avoided
 * so a hand-edited catalogue degrades to the gradient rather than throwing at start-up.
 * @returns The default catalogue entry, or `undefined` if the catalogue is empty.
 */
function defaultWallpaper(): UmbraDesktopBuiltInWallpaper | undefined {
  return findBuiltInWallpaper(UMBRADESKTOP_DEFAULT_WALLPAPER_ID);
}

/**
 * What the desktop should paint for a stored reference.
 *
 * Anything that cannot be honoured — a built-in dropped in an upgrade, a media item deleted or
 * not yet resolved — falls back to the default image rather than leaving the desktop blank.
 * @param ref The user's stored wallpaper reference.
 * @param mediaUrl For a `media` ref, the URL the imaging repository returned; `null` or omitted when it could not be resolved.
 * @returns The image URL and the colour to paint underneath it.
 */
export function resolveWallpaper(
  ref: UmbraDesktopWallpaperRef,
  mediaUrl?: string | null,
): UmbraDesktopResolvedWallpaper {
  const fallback = (): UmbraDesktopResolvedWallpaper => {
    const wallpaper = defaultWallpaper();
    return wallpaper
      ? { url: wallpaper.url, averageColour: wallpaper.averageColour }
      : { url: null, averageColour: null };
  };

  switch (ref.kind) {
    case 'none':
      return { url: null, averageColour: null };
    case 'builtin': {
      const wallpaper = findBuiltInWallpaper(ref.id);
      return wallpaper ? { url: wallpaper.url, averageColour: wallpaper.averageColour } : fallback();
    }
    case 'media':
      // No average colour: the image is the user's own, so there is nothing precomputed to
      // paint underneath. Umbraco serves it resized, so the gap before it decodes is short.
      return mediaUrl ? { url: mediaUrl, averageColour: null } : fallback();
  }
}

/**
 * The small image to show in the settings dialog and the picker grid.
 * @param ref The wallpaper reference to preview.
 * @param mediaThumbUrl For a `media` ref, the thumbnail URL the imaging repository returned.
 * @returns A thumbnail URL, or `null` when the caller should render a gradient swatch instead.
 */
export function wallpaperThumbUrl(ref: UmbraDesktopWallpaperRef, mediaThumbUrl?: string | null): string | null {
  switch (ref.kind) {
    case 'none':
      return null;
    case 'builtin':
      return findBuiltInWallpaper(ref.id)?.thumbUrl ?? defaultWallpaper()?.thumbUrl ?? null;
    case 'media':
      return mediaThumbUrl ?? null;
  }
}
