import type { UmbraDesktopWallpaperRef } from './types';
import type { UmbraDesktopBuiltInWallpaper } from './wallpapers.generated';

/**
 * What the Appearance panel's Wallpaper row says: the wallpaper itself on the first line, where it
 * came from on the second.
 *
 * A title is either a name or a key, never both, because only one of the four cases has a name to
 * show. A shipped image has one and it is a proper noun, so it is not localized — the same rule the
 * themes follow. The others have no name at all and say what they are instead.
 */
export interface UmbraDesktopWallpaperLabels {
  /** The wallpaper's own name, for a built-in this version still ships. */
  title?: string;
  /** Localization key for the title, when there is no name to show. */
  titleKey?: string;
  /** Localization key for the line under it, or undefined when the title says everything. */
  subKey?: string;
}

/**
 * Work out what the Wallpaper row should say.
 *
 * Pure, and separate from the element that renders it, because the interesting part is the fallback
 * matrix rather than the markup: a stored id can name a wallpaper that no longer ships, and a row
 * that went blank there would be the only place in the panel that ever shows nothing.
 * @param ref The user's stored wallpaper reference.
 * @param wallpapers The built-in catalogue to resolve a name against.
 * @returns The title and sub-line for the row.
 */
export function wallpaperLabels(
  ref: UmbraDesktopWallpaperRef | undefined,
  wallpapers: ReadonlyArray<UmbraDesktopBuiltInWallpaper>,
): UmbraDesktopWallpaperLabels {
  if (ref?.kind === 'none') return { titleKey: 'umbraDesktop_wallpaperNone' };
  if (ref?.kind === 'media') {
    return { titleKey: 'umbraDesktop_wallpaperOwnImage', subKey: 'umbraDesktop_wallpaperFromMedia' };
  }

  const name = ref?.kind === 'builtin' ? wallpapers.find((wallpaper) => wallpaper.id === ref.id)?.name : undefined;
  // No name means either a dropped id or a ref that has not resolved yet. Both say "a built-in
  // image", which is true in the first case and about to be true in the second.
  return name
    ? { title: name, subKey: 'umbraDesktop_wallpaperBuiltIn' }
    : { titleKey: 'umbraDesktop_wallpaperBuiltIn' };
}
