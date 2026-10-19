import { UmbEntityBulkActionBase } from '@umbraco-cms/backoffice/entity-bulk-action';
import { UMBRADESKTOP_MEDIA_MANAGER_CONTEXT } from '../../context/media-manager.context.js';
import { refsOf } from './held-items.js';

/** Cut in core's selection bar (design §5): holds the selection, to move on Paste. */
export class UmbraDesktopBulkCutAction extends UmbEntityBulkActionBase<never> {
  /** Hold the selection as a cut. */
  override async execute(): Promise<void> {
    const context = await this.getContext(UMBRADESKTOP_MEDIA_MANAGER_CONTEXT);
    if (!context || !this.selection.length) return;
    context.hold('cut', await refsOf(context.api, this.selection));
  }
}

export { UmbraDesktopBulkCutAction as api };
