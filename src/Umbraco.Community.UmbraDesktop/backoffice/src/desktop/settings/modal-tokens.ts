import type { UmbraDesktopWallpaperRef } from './types';
import { UmbModalToken } from '@umbraco-cms/backoffice/modal';

/** Aliases for this package's modals, shared by the tokens and their manifests. */
export const UMBRADESKTOP_SETTINGS_MODAL_ALIAS = 'Umbraco.Community.UmbraDesktop.Modal.Settings';

/** Alias of the built-in wallpaper picker modal. */
export const UMBRADESKTOP_WALLPAPER_PICKER_MODAL_ALIAS = 'Umbraco.Community.UmbraDesktop.Modal.WallpaperPicker';

/** Alias of the theme picker modal. */
export const UMBRADESKTOP_THEME_PICKER_MODAL_ALIAS = 'Umbraco.Community.UmbraDesktop.Modal.ThemePicker';

/**
 * The desktop settings panel. A sidebar from the right rather than a centered dialog: it reads as
 * native backoffice chrome, and it leaves the desktop in view behind it, so a theme or wallpaper
 * change can be seen as it is made.
 *
 * `small` deliberately, so as much of the desktop stays in view as possible while it is open.
 *
 * What happens when a picker opens on top was checked in a browser rather than reasoned about:
 * `uui-modal-container` shifts the sheet beneath left by setting `--uui-modal-offset` on it, so the
 * stack is not one sheet covering another. With this at 500px and the wallpaper pickers at `medium`
 * (800px), a sliver of this panel stays visible to the left of the picker and is not dimmed —
 * enough to show there is something behind, not enough to read. The theme picker is `small`
 * instead, for the reason given on its own token below.
 *
 * The desktop behind is visible but **not interactive**: `UUIModalElement` opens every modal with
 * `dialog.showModal()`, which puts it in the top layer and makes the rest of the document inert.
 * Unchanged from the centered dialog this replaced, and the reason it is a modal at all — a panel
 * that kept the desktop live would have to be our own element, hand-rolling the open, close, escape
 * and focus behaviour the modal system provides, and would still go inert whenever a picker opened
 * on top of it.
 *
 * Takes no data and returns no value — every setting applies immediately through the settings
 * context, so there is nothing to hand back on close.
 */
export const UMBRADESKTOP_SETTINGS_MODAL = new UmbModalToken<object, never>(UMBRADESKTOP_SETTINGS_MODAL_ALIAS, {
  modal: { type: 'sidebar', size: 'small' },
});

/** What the wallpaper picker needs to know: which entry to mark as selected. */
export interface UmbraDesktopWallpaperPickerModalData {
  /** The wallpaper currently in use. */
  current: UmbraDesktopWallpaperRef;
  /**
   * The thumbnail of the wallpaper in use, when it came from the Media Library.
   *
   * Passed in rather than resolved here: the panel has already resolved it for the row it is
   * showing, and asking the picker to resolve it again would mean a second round trip to render a
   * tile the caller is already looking at. `null` when that image cannot be rendered as one.
   */
  currentThumbUrl?: string | null;
}

/**
 * The wallpaper picker: every way into a wallpaper in one place, since the panel now has one row
 * per setting rather than a button per source.
 *
 * A sidebar, matching how the Media Library picker it can open behaves, so both surfaces are the
 * same kind of thing. Wider than the settings panel it opens from, so it covers it rather than
 * sitting half-visible beside it — a wallpaper is an image and wants the room, which is the
 * difference from the theme picker below.
 *
 * Returns nothing. Like the theme picker, it applies each choice through the settings context and
 * stays open, so there is no value to hand back: closing it is a decision of its own rather than
 * something the first click does for you.
 */
export const UMBRADESKTOP_WALLPAPER_PICKER_MODAL = new UmbModalToken<UmbraDesktopWallpaperPickerModalData, never>(
  UMBRADESKTOP_WALLPAPER_PICKER_MODAL_ALIAS,
  {
    modal: { type: 'sidebar', size: 'medium' },
  },
);

/** What the theme picker needs to know: which theme to mark as current on its first paint. */
export interface UmbraDesktopThemePickerModalData {
  /** Id of the theme in use when the picker opened. */
  current: string;
}

/**
 * The theme picker. `small`, matching the settings panel it opens from rather than the `medium` of
 * the wallpaper pickers beside it, and that is the point: a theme change repaints the taskbar, the
 * window chrome and the desktop itself, so the picker has to leave those in view while you click
 * through it. A `medium` sheet would cover the thing being previewed.
 *
 * Returns nothing. Picking applies immediately through the settings context and the picker stays
 * open, so there is no value to hand back — see the element for why that differs from the wallpaper
 * picker, which returns a choice and closes.
 */
export const UMBRADESKTOP_THEME_PICKER_MODAL = new UmbModalToken<UmbraDesktopThemePickerModalData, never>(
  UMBRADESKTOP_THEME_PICKER_MODAL_ALIAS,
  {
    modal: { type: 'sidebar', size: 'small' },
  },
);
