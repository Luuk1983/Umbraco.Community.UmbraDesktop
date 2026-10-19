import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbDropzoneMediaElement } from '@umbraco-cms/backoffice/media';
import { UmbFileDropzoneItemStatus } from '@umbraco-cms/backoffice/dropzone';
import type { UmbDropzoneManager, UmbFileDropzoneDroppedItems, UmbUploadableItem } from '@umbraco-cms/backoffice/dropzone';
import { uploadBatch } from './upload-watch.js';
import type { UmbraDesktopUploadBatch, UmbraDesktopUploadItem } from './upload-watch.js';

/**
 * Uploading files and folders into a folder through core's own media upload (design §6), so core picks
 * each file's media type from its extension, asks when one file could be several, creates dropped
 * folders before what is in them, and refuses what the folder does not allow, as its dropzone does.
 *
 * For an upload into a folder a window does not show (a folder card or tree folder dropped on), where
 * core's dropzone in the window would upload into the wrong folder. Into the folder a window shows,
 * the window hands the files to core's dropzone itself, which also draws its placeholders.
 */

/** Core's media upload manager, as far as this file uses it. */
interface UmbraDesktopMediaUploadManager extends UmbDropzoneManager {
  /**
   * Upload files and folders and create their media items.
   * @param items The files and folders.
   * @param parent The folder, null for the root.
   * @returns The items about to be uploaded.
   */
  createMediaItems(items: UmbFileDropzoneDroppedItems, parent?: string | null): UmbUploadableItem[];
}

/** The upload manager's list, as a batch reads it. */
type UmbraDesktopUploadBatchSource = Parameters<typeof uploadBatch>[0]['progressItems'];

/** Core's media upload manager class. */
type UmbraDesktopMediaUploadManagerClass = (new (host: UmbControllerHost) => UmbraDesktopMediaUploadManager) & {
  prototype: UmbraDesktopMediaUploadManager;
};

/** The class, once found. */
let managerClass: UmbraDesktopMediaUploadManagerClass | undefined;

/**
 * Core's media upload manager class. The media package exports its dropzone element but not the
 * manager the element uploads with (`UmbMediaDropzoneManager`, 17.5 to 17.7), so it is read off one
 * element made for the purpose and taken down at once: the element adds listeners at the document as
 * it is made, and its disconnect removes them and ends its manager.
 * @returns The class.
 */
export function mediaUploadManagerClass(): UmbraDesktopMediaUploadManagerClass {
  if (managerClass) return managerClass;
  const probe = new UmbDropzoneMediaElement() as unknown as { _manager: UmbraDesktopMediaUploadManager; disconnectedCallback(): void };
  managerClass = probe._manager.constructor as UmbraDesktopMediaUploadManagerClass;
  probe.disconnectedCallback();
  return managerClass;
}

/**
 * Upload into a folder and wait until every item is done, whether it went or not.
 * @param host What the upload belongs to; core's type dialog opens from it.
 * @param items The files and folders.
 * @param parent The folder, null for the root.
 * @param onBatch Told about the upload as it starts, before anything has gone, for the Transfers window.
 * @returns How many items went in.
 */
export async function uploadInto(
  host: UmbControllerHost,
  items: UmbFileDropzoneDroppedItems,
  parent: string | null,
  onBatch?: (batch: UmbraDesktopUploadBatch) => void,
): Promise<number> {
  const Manager = mediaUploadManagerClass();
  const manager = new Manager(host);
  onBatch?.(
    uploadBatch(
      {
        progressItems: manager.progressItems as unknown as UmbraDesktopUploadBatchSource,
        remove: (waiting: UmbraDesktopUploadItem[]) => manager.remove(waiting as unknown as UmbUploadableItem[]),
      },
      parent,
    ),
  );
  try {
    if (!manager.createMediaItems(items, parent).length) return 0;
    return await new Promise<number>((resolve) => {
      let done = false;
      const subscription = manager.progressItems.subscribe((list: UmbUploadableItem[]) => {
        if (done || !list.length || list.some((item) => item.status === UmbFileDropzoneItemStatus.WAITING)) return;
        done = true;
        queueMicrotask(() => subscription.unsubscribe());
        resolve(list.filter((item) => item.status === UmbFileDropzoneItemStatus.COMPLETE).length);
      });
    });
  } finally {
    manager.destroy();
  }
}
