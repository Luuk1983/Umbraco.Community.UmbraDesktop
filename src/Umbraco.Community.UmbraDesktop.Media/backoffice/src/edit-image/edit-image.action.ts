import { UmbEntityActionBase } from '@umbraco-cms/backoffice/entity-action';
import { UMBRADESKTOP_IMAGE_EDITOR_APP } from '../image-editor/constants.js';
import { findDesktopWindows } from './desktop-windows.js';

/**
 * Edit image on an image media item (#137): the Image Editor in its own desktop window with that
 * image open, or the editor window already showing it brought forward (design §4). The editor's
 * location is the item's key, which it opens on connect and reports back while it shows it.
 *
 * Its conditions show it only on the desktop, for an image, not in the bin; see the manifest.
 */
export class UmbraDesktopEditImageAction extends UmbEntityActionBase<never> {
  /** Open the editor at the item, through the desktop's window manager wherever the action runs. */
  override async execute(): Promise<void> {
    const unique = this.args.unique;
    if (!unique) return;
    findDesktopWindows(this.getHostElement())?.openApp(UMBRADESKTOP_IMAGE_EDITOR_APP, { location: unique, reuse: true });
  }
}

export { UmbraDesktopEditImageAction as api };
