import type { UmbraDesktopWallpaperRef } from './types';
import { UmbModalToken } from '@umbraco-cms/backoffice/modal';

/** Aliases for this package's modals, shared by the tokens and their manifests. */
export const UMBRADESKTOP_SETTINGS_MODAL_ALIAS = 'Umbraco.Community.UmbraDesktop.Modal.Settings';

/** Alias of the built-in wallpaper picker modal. */
export const UMBRADESKTOP_WALLPAPER_PICKER_MODAL_ALIAS = 'Umbraco.Community.UmbraDesktop.Modal.WallpaperPicker';

/**
 * The desktop settings dialog. Centered rather than a sidebar: you configure in the middle and
 * pick from the side, which is the convention the rest of the backoffice follows.
 *
 * Takes no data and returns no value — every setting applies immediately through the settings
 * context, so there is nothing to hand back on close.
 */
export const UMBRADESKTOP_SETTINGS_MODAL = new UmbModalToken<object, never>(UMBRADESKTOP_SETTINGS_MODAL_ALIAS, {
  modal: { type: 'dialog', size: 'medium' },
});

/** What the wallpaper picker needs to know: which entry to mark as selected. */
export interface UmbraDesktopWallpaperPickerModalData {
  /** The wallpaper currently in use. */
  current: UmbraDesktopWallpaperRef;
}

/** What the wallpaper picker returns: the chosen wallpaper. */
export interface UmbraDesktopWallpaperPickerModalValue {
  /** The wallpaper the user picked. */
  wallpaper: UmbraDesktopWallpaperRef;
}

/**
 * The built-in wallpaper picker. A sidebar, matching how the Media Library picker beside it
 * behaves, so the two buttons in the settings dialog open the same kind of surface.
 */
export const UMBRADESKTOP_WALLPAPER_PICKER_MODAL = new UmbModalToken<
  UmbraDesktopWallpaperPickerModalData,
  UmbraDesktopWallpaperPickerModalValue
>(UMBRADESKTOP_WALLPAPER_PICKER_MODAL_ALIAS, {
  modal: { type: 'sidebar', size: 'medium' },
});
