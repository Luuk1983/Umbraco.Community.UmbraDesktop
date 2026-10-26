import type { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { UMB_MEDIA_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/media';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import { UMBRADESKTOP_IMAGE_EDITOR_APP } from '../image-editor/constants.js';
import { findDesktopWindows, findOnDesktop } from '../edit-image/desktop-windows.js';
import { wordsOf } from '../shared/words.js';
import type { UmbraDesktopFileTool } from './constants.js';
import { itemOf } from './item.js';
import { backofficeUrlOf, downloadFile } from './download.js';
import { optimizeOne } from './optimize-one.js';
import { pickFile, replaceFromWorkspace } from './replace-file.js';

/**
 * Running one of the file's tools (#176) for whichever manifest reached it: the footer button, its
 * fold-out or the file property's menu. All three sit inside core's media workspace, which says which
 * item it is; the desktop is found from there, on the desktop page or through the window's frame.
 */

/** The part of the add-on's desktop context Replace file reaches for, by its alias. */
interface UmbraDesktopReplacer extends UmbContextMinimal {
  /**
   * Put a new file into an item, as an operation the Transfers window follows.
   * @param unique The item.
   * @param file The new file.
   */
  replaceFile(unique: string, file: File): Promise<unknown>;
}

/** The add-on's desktop context, by its alias. */
const UMBRADESKTOP_MEDIA_MANAGER = new UmbContextToken<UmbraDesktopReplacer>('UmbraDesktopMediaManagerContext');

/** The part of core's media workspace context the tools use beyond naming the item. */
interface MediaWorkspace {
  /** The item's key. */
  getUnique(): string | null | undefined;
  /** The item's name. */
  getName(): string | undefined;
  /** Whether the item's page holds unsaved changes. */
  getHasUnpersistedChanges(): boolean;
  /** Save the item's page, as its Save button does. */
  requestSubmit(): Promise<void>;
}

/**
 * Run a file tool on the item of the media workspace around `host`. Does nothing outside one, and for
 * an item not saved yet, which has no file on the server.
 * @param host The action, inside the media workspace.
 * @param tool Which tool.
 */
export async function runFileTool(host: UmbControllerBase, tool: UmbraDesktopFileTool): Promise<void> {
  const workspace = (await host.getContext(UMB_MEDIA_WORKSPACE_CONTEXT).catch(() => undefined)) as MediaWorkspace | undefined;
  const item = workspace ? itemOf(workspace) : undefined;
  if (!workspace || !item) return;
  const element = host.getHostElement();
  const words = wordsOf(new UmbLocalizationController(host));
  switch (tool) {
    case 'editImage':
      findDesktopWindows(element)?.openApp(UMBRADESKTOP_IMAGE_EDITOR_APP, { location: item.unique, reuse: true });
      return;
    case 'optimize':
      optimizeOne(element, item);
      return;
    case 'download':
      await downloadFile(element.ownerDocument, item, {
        urlOf: backofficeUrlOf(host),
        notify: (name) => void warn(host, words('noFileToDownload', name)),
      });
      return;
    case 'replaceFile':
      await replaceFromWorkspace(item, {
        hasUnsavedChanges: () => workspace.getHasUnpersistedChanges(),
        askToSaveFirst: (name) =>
          umbConfirmModal(host, {
            headline: words('replaceSaveFirstHeadline'),
            content: words('replaceSaveFirst', name),
            confirmLabel: words('replaceSaveFirstConfirm'),
          }).then(
            () => true,
            () => false,
          ),
        // A refused save (a validation error) rejects; the page then still holds its changes, which
        // is what stops the replace.
        save: () => workspace.requestSubmit().catch(() => undefined),
        pick: () => pickFile(element.ownerDocument),
        replace: async (each, file) => findOnDesktop(element, UMBRADESKTOP_MEDIA_MANAGER)?.replaceFile(each.unique, file),
      });
      return;
  }
}

/**
 * Raise a warning in the backoffice the action is in.
 * @param host The action.
 * @param message The text.
 */
async function warn(host: UmbControllerBase, message: string): Promise<void> {
  const notifications = await host.getContext(UMB_NOTIFICATION_CONTEXT).catch(() => undefined);
  notifications?.peek('warning', { data: { message } });
}
