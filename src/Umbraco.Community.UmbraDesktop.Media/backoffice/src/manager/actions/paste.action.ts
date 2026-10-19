import { UmbEntityActionBase } from '@umbraco-cms/backoffice/entity-action';
import { UMBRADESKTOP_MEDIA_MANAGER_CONTEXT } from '../../context/media-manager.context.js';

/**
 * Paste on a folder's menu, its card, its tree item and the Media root's (design §5): what is held goes
 * into the folder, moved for a cut, copied for a copy. Shown only while something is held.
 */
export class UmbraDesktopPasteAction extends UmbEntityActionBase<never> {
  /** Paste into the folder, or the root. */
  override async execute(): Promise<void> {
    const context = await this.getContext(UMBRADESKTOP_MEDIA_MANAGER_CONTEXT);
    await context?.paste(this.args.entityType === 'media' ? this.args.unique ?? null : null);
  }
}

export { UmbraDesktopPasteAction as api };
