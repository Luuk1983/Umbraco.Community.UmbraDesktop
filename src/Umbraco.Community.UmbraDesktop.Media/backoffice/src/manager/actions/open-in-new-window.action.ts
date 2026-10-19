import { UmbEntityActionBase } from '@umbraco-cms/backoffice/entity-action';
import { UMBRADESKTOP_MEDIA_MANAGER_WINDOW_CONTEXT } from '../manager-window.context.js';

/**
 * "Open in new window" on a folder's menu, on its card and in the tree: the folder in a manager window
 * of its own, as an OS file manager opens a folder in a new window (design §2). Shown only inside a
 * manager window and only for folders, by its condition.
 */
export class UmbraDesktopOpenInNewWindowAction extends UmbEntityActionBase<never> {
  /** Ask the window the menu is in to open the folder, or Media for the root, in a new window. */
  override async execute(): Promise<void> {
    const window = await this.getContext(UMBRADESKTOP_MEDIA_MANAGER_WINDOW_CONTEXT);
    const unique = this.args.unique;
    window?.openInNewWindow(this.args.entityType === 'media' && unique ? { kind: 'folder', unique } : { kind: 'root' });
  }
}

export { UmbraDesktopOpenInNewWindowAction as api };
