import type { UmbraDesktopTheme } from './types';
import type { UmbraDesktopResolvedWallpaper, UmbraDesktopWallpaperRef } from '../settings/types';
import { findBuiltInWallpaper, wallpaperThumbUrl } from '../settings/wallpaper';

/**
 * Which wallpaper goes with a theme.
 *
 * Pure, and taking the catalogue as a parameter rather than reaching for the module global, for the
 * same reason `resolveTheme` does: the interesting part is the three-way fallback, and a test that
 * has to reshape the five shipped themes to exercise it is testing the wrong thing.
 */

/**
 * The wallpaper a theme asks for, or `undefined` when the wallpaper should be left exactly as it is.
 *
 * Three outcomes, and the difference between the last two is the whole rule:
 *
 * - a theme naming an image gives back that `builtin` ref;
 * - a theme naming `none` gives back `{ kind: 'none' }`, which **clears** any image. That is a
 *   deliberate choice rather than an absence: Windows 98's flat teal is its authentic desktop, so
 *   its matching wallpaper is the theme's own ground and an image would be the wrong answer;
 * - a theme declaring nothing gives back `undefined`, and the caller changes nothing.
 *
 * An **unknown id** is treated as declaring nothing rather than falling back to the identity
 * theme's wallpaper the way `resolveTheme` falls back to its palette. The two are not the same
 * question: the desktop must paint *some* chrome, so a fallback palette is unavoidable, whereas the
 * wallpaper already on screen is a perfectly good answer and the user chose it. Losing your theme
 * in an upgrade is one surprise; losing the wallpaper too, on the strength of a guess about which
 * theme you meant, is a second one for the same cause.
 * @param themeId The theme id to look up, normally the user's stored choice.
 * @param catalogue The themes to look it up in.
 * @returns The wallpaper to apply, or `undefined` to leave the current one alone.
 */
export function themeWallpaper(
  themeId: string,
  catalogue: ReadonlyArray<UmbraDesktopTheme>,
): UmbraDesktopWallpaperRef | undefined {
  return catalogue.find((theme) => theme.id === themeId)?.wallpaper;
}

/**
 * What a theme's preview tile in the picker should have behind it.
 *
 * The tile answers "what will clicking this do", so the ground it paints has to be the ground you
 * would end up with — which is not the same question as {@link themeWallpaper} answers. Two of the
 * three cases fall back to the wallpaper already on screen, and they do so for different reasons:
 * with the toggle **off** a click changes no wallpaper at all, and with it on a theme that
 * **declares nothing** changes no wallpaper either. Both times the honest tile is the one showing
 * what you have.
 *
 * The third case is the one that carries the feature: toggle on and a theme that names something,
 * where the tile shows that theme's own wallpaper before a single click. That is also what lets
 * `setWallpaperFollowsTheme` change nothing on screen — the "what will this do" job moved here,
 * where it can be answered without applying anything.
 *
 * **Thumbnails, not full-size images.** Five tiles paint at once, each a few hundred pixels wide,
 * and the thumbnails are roughly a fifth of the bytes with nothing visible to lose at that size.
 * @param theme The theme whose tile is being painted.
 * @param current What the desktop is painting now, already resolved — a `media` wallpaper's URL
 * comes from the imaging repository, which only the settings context can ask.
 * @param followsTheme Whether the user has asked the wallpaper to follow the theme.
 * @returns The image URL and underlying colour for that tile.
 */
export function previewWallpaper(
  theme: UmbraDesktopTheme,
  current: UmbraDesktopResolvedWallpaper,
  followsTheme: boolean,
): UmbraDesktopResolvedWallpaper {
  const ref = followsTheme ? theme.wallpaper : undefined;
  if (!ref) return current;

  // `none` resolves to no image on purpose rather than falling through to `current`: a theme whose
  // match is its own ground has to preview as that ground, or the one theme whose wallpaper is
  // "nothing" becomes the one theme whose tile misrepresents it.
  if (ref.kind === 'none') return { url: null, averageColour: null };

  return {
    url: wallpaperThumbUrl(ref),
    averageColour: ref.kind === 'builtin' ? (findBuiltInWallpaper(ref.id)?.averageColour ?? null) : null,
  };
}
