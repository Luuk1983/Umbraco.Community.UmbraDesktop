import { UmbEntityActionBase } from '@umbraco-cms/backoffice/entity-action';
import { UMBRADESKTOP_MEDIA_MANAGER_CONTEXT } from '../../context/media-manager.context.js';
import { itemsFor, refsOf } from './held-items.js';

/**
 * Cut on an item's menu (design §5): holds the item, or the whole selection when the item is part of
 * it, to move on Paste. The items stay where they are, faded, until then.
 */
export class UmbraDesktopCutAction extends UmbEntityActionBase<never> {
  /** Hold the items as a cut. */
  override async execute(): Promise<void> {
    const context = await this.getContext(UMBRADESKTOP_MEDIA_MANAGER_CONTEXT);
    if (!context || !this.args.unique) return;
    context.hold('cut', await refsOf(context.api, await itemsFor(this, this.args.unique)));
  }
}

export { UmbraDesktopCutAction as api };
