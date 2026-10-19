import { UmbEntityBulkActionBase } from '@umbraco-cms/backoffice/entity-bulk-action';
import { UMBRADESKTOP_MEDIA_MANAGER_CONTEXT } from '../../context/media-manager.context.js';
import { refsOf } from './held-items.js';

/** Copy in core's selection bar (design §5): holds the selection, to copy on Paste. */
export class UmbraDesktopBulkCopyAction extends UmbEntityBulkActionBase<never> {
  /** Hold the selection as a copy. */
  override async execute(): Promise<void> {
    const context = await this.getContext(UMBRADESKTOP_MEDIA_MANAGER_CONTEXT);
    if (!context || !this.selection.length) return;
    context.hold('copy', await refsOf(context.api, this.selection));
  }
}

export { UmbraDesktopBulkCopyAction as api };
