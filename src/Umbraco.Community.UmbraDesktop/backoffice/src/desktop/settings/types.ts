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
  /** Id of the user's chosen chrome theme. */
  theme: string;
  /** Aliases of the apps pinned to Favourites, in pin order. */
  pinned: string[];
  /**
   * Whether landing on the backoffice root should open the desktop instead of the section the
   * backoffice would otherwise pick.
   *
   * Lives here beside the other per-user preferences, even though it is read at a very different
   * moment: everything else is read once the desktop mounts, while this is read during boot, before
   * anything has been painted. One payload keeps a user's desktop in one place; the boot path pays
   * for that by reading the payload itself rather than going through the settings context, which is
   * provided by the desktop element and so does not exist yet at that point.
   */
  bootIntoDesktop: boolean;
}

/** What the desktop element needs in order to paint a wallpaper. */
export interface UmbraDesktopResolvedWallpaper {
  /** URL of the image to paint, or `null` to fall back to the gradient. */
  url: string | null;
  /** Colour painted underneath the image while it decodes, or `null` when there is no image. */
  averageColour: string | null;
}
