import { UmbEntityBulkActionBase } from '@umbraco-cms/backoffice/entity-bulk-action';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_TREE_PICKER_MODAL } from '@umbraco-cms/backoffice/tree';
import { UMBRADESKTOP_MEDIA_MANAGER_CONTEXT } from '../../context/media-manager.context.js';
import { refsOf } from './held-items.js';

/** Core's media tree, which core's own Move to picks a folder from. */
const MEDIA_TREE = 'Umb.Tree.Media';

/**
 * Copy to in core's selection bar, beside core's Move to (design §5): pick a folder in core's own
 * folder picker, the one Move to uses, and copy the selection there, so copying never needs a key.
 */
export class UmbraDesktopCopyToAction extends UmbEntityBulkActionBase<never> {
  /** Pick a folder and copy the selection into it. */
  override async execute(): Promise<void> {
    if (!this.selection.length) return;
    const target = await this._pickFolder();
    if (target === undefined) return;
    const context = await this.getContext(UMBRADESKTOP_MEDIA_MANAGER_CONTEXT);
    if (!context) return;
    await context.copyTo(await refsOf(context.api, this.selection), target);
  }

  /**
   * Ask for a folder in core's picker, as core's Move to does. A seam, so a test answers without a
   * modal manager.
   * @returns The folder's key, null for the root, undefined when the picker was closed.
   */
  protected async _pickFolder(): Promise<string | null | undefined> {
    try {
      const value = await umbOpenModal(this, UMB_TREE_PICKER_MODAL, { data: { foldersOnly: true, hideTreeRoot: false, treeAlias: MEDIA_TREE } });
      const picked = value?.selection;
      return picked?.length ? (picked[0] ?? null) : undefined;
    } catch {
      return undefined;
    }
  }
}

export { UmbraDesktopCopyToAction as api };
