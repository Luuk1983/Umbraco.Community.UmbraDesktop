import type { UmbraDesktopWallpaperRef } from './types';
import { UmbModalToken } from '@umbraco-cms/backoffice/modal';

/** Aliases for this package's modals, shared by the tokens and their manifests. */
export const UMBRADESKTOP_SETTINGS_MODAL_ALIAS = 'Umbraco.Community.UmbraDesktop.Modal.Settings';

/** Alias of the built-in wallpaper picker modal. */
export const UMBRADESKTOP_WALLPAPER_PICKER_MODAL_ALIAS = 'Umbraco.Community.UmbraDesktop.Modal.WallpaperPicker';

/**
 * The desktop settings panel. A sidebar from the right rather than a centered dialog: it reads as
 * native backoffice chrome, and it leaves the desktop in view behind it, so a theme or wallpaper
 * change can be seen as it is made.
 *
 * `small` deliberately, so as much of the desktop stays in view as possible while it is open.
 *
 * What happens when a picker opens on top was checked in a browser rather than reasoned about:
 * `uui-modal-container` shifts the sheet beneath left by setting `--uui-modal-offset` on it, so the
 * stack is not one sheet covering another. With this at 500px and the pickers at `medium` (800px),
 * a sliver of this panel stays visible to the left of the picker and is not dimmed — enough to show
 * there is something behind, not enough to read.
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
}

/** What the wallpaper picker returns: the chosen wallpaper. */
export interface UmbraDesktopWallpaperPickerModalValue {
  /** The wallpaper the user picked. */
  wallpaper: UmbraDesktopWallpaperRef;
}

/**
 * The built-in wallpaper picker. A sidebar, matching how the Media Library picker beside it
 * behaves, so the two buttons in the settings panel open the same kind of surface. Wider than the
 * settings panel it opens from, so it covers it rather than sitting half-visible beside it.
 */
export const UMBRADESKTOP_WALLPAPER_PICKER_MODAL = new UmbModalToken<
  UmbraDesktopWallpaperPickerModalData,
  UmbraDesktopWallpaperPickerModalValue
>(UMBRADESKTOP_WALLPAPER_PICKER_MODAL_ALIAS, {
  modal: { type: 'sidebar', size: 'medium' },
});
