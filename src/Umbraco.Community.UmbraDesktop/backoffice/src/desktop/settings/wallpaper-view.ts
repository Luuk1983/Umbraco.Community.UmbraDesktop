import type { UmbraDesktopResolvedWallpaper, UmbraDesktopWallpaperRef } from './types';

/**
 * The current wallpaper, resolved into everything the UI needs to paint it. Both the desktop
 * (which wants the full-size image) and the settings dialog (which wants the thumbnail) read
 * this single value, so they can never disagree about what is selected.
 */
export interface UmbraDesktopWallpaperView {
  /** The stored reference this view was resolved from. */
  ref: UmbraDesktopWallpaperRef;
  /** The full-size image and its backing colour. */
  background: UmbraDesktopResolvedWallpaper;
  /** The preview image, or `null` when the caller should show a gradient swatch. */
  thumbUrl: string | null;
}
