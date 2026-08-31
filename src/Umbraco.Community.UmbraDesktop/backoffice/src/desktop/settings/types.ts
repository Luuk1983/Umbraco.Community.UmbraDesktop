/** Types for the desktop settings feature. */

/**
 * Where a wallpaper comes from. `none` keeps the gradient the desktop has always shipped, so
 * turning wallpapers on never takes an option away.
 */
export type UmbraDesktopWallpaperRef =
  | { kind: 'none' }
  | { kind: 'builtin'; id: string }
  | { kind: 'media'; unique: string };

/**
 * One user's desktop settings, as persisted. Versioned from the start so a future shape change
 * has somewhere to hang a migration rather than silently discarding preferences.
 */
export interface UmbraDesktopSettings {
  /** Payload version. Anything unrecognised is treated as unreadable and reset. */
  v: 1;
  /** The user's chosen wallpaper. */
  wallpaper: UmbraDesktopWallpaperRef;
}

/** What the desktop element needs in order to paint a wallpaper. */
export interface UmbraDesktopResolvedWallpaper {
  /** URL of the image to paint, or `null` to fall back to the gradient. */
  url: string | null;
  /** Colour painted underneath the image while it decodes, or `null` when there is no image. */
  averageColour: string | null;
}
