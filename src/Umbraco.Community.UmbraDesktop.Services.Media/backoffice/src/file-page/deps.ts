import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { UmbImagingRepository } from '@umbraco-cms/backoffice/imaging';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import { UmbMediaItemRepository } from '@umbraco-cms/backoffice/media';
import type { UmbraDesktopMediaContext } from '../context/media.context.js';
import { wordsOf } from '../shared/words.js';

/**
 * What the File page needs from outside itself: the media context's operations, thumbnails for the
 * recent list, and the discard question. Injectable, so a test needs no backoffice; the element
 * builds the real ones when it is given none.
 */
export interface FilePageDeps {
  /** The media context's operations. */
  context: Pick<UmbraDesktopMediaContext, 'open' | 'recent' | 'forgetRecent' | 'save' | 'pickSaveFolder' | 'confirmOverwrite'>;
  /**
   * Thumbnail URLs for media items, by key, for the Open page's tiles. Only pictures: an item it
   * does not answer for is shown without one, because Umbraco's imaging endpoint answers nothing on a
   * failure as well as for a missing item, so its silence says nothing about the item.
   * @param uniques The items.
   * @returns Each item's thumbnail URL, by key.
   */
  thumbnails(uniques: string[]): Promise<Map<string, string>>;
  /**
   * Whether media items still exist, and whether they are in the recycle bin, for the Open page to
   * leave out and forget the ones that are gone. Optional; without it every entry is kept.
   * @param uniques The items.
   * @returns Each item that exists, by key; or undefined when the media library could not be asked,
   *   which keeps every entry, since a failed check says nothing about the items.
   */
  items?(uniques: string[]): Promise<Map<string, { trashed: boolean }> | undefined>;
  /**
   * Ask whether to throw away unsaved work, before opening another file over it.
   * @returns True to throw it away.
   */
  confirmDiscard(): Promise<boolean>;
  /**
   * A folder's name, for Save as to say where a copy goes once another folder was chosen. Optional:
   * without it the page names the folder it was given and nothing more.
   * @param unique The folder.
   * @returns Its name, or undefined when it cannot be read.
   */
  folderName?(unique: string): Promise<string | undefined>;
}

/** The size Open asks thumbnails at: twice the tile, so they are sharp on a high-density screen. */
export const THUMBNAIL_PX = 320;

/**
 * Thumbnails through Umbraco's imaging repository, which caches them and batches the request.
 * `requestResizedItems` rather than `requestThumbnailUrls`, which the 17.5 typings mark deprecated
 * for removal in 18. The server answers only for the items this user can see, and leaves out the
 * deleted and trashed, which is what lets the Open page drop them.
 * @param host The element asking.
 * @returns The thumbnail resolver.
 */
export function createThumbnails(host: UmbControllerHost): FilePageDeps['thumbnails'] {
  return async (uniques) => {
    if (!uniques.length) return new Map();
    const repository = new UmbImagingRepository(host);
    try {
      const { data } = await repository.requestResizedItems(uniques, { width: THUMBNAIL_PX, height: THUMBNAIL_PX });
      return new Map(data.filter((item) => item.url).map((item) => [item.unique, item.url as string]));
    } finally {
      repository.destroy();
    }
  };
}

/**
 * The discard question in Umbraco's own confirm dialog, which rejects on cancel.
 * @param host The element asking.
 * @returns The question.
 */
export function createDiscardQuestion(host: UmbControllerHost): FilePageDeps['confirmDiscard'] {
  return async () => {
    const localize = new UmbLocalizationController(host);
    const words = wordsOf(localize);
    try {
      await umbConfirmModal(host, {
        headline: words('discardHeadline'),
        content: words('discardQuestion'),
        color: 'danger',
        confirmLabel: words('discardConfirm'),
      });
      return true;
    } catch {
      return false;
    } finally {
      localize.destroy();
    }
  };
}

/**
 * The item check through Umbraco's media item repository: an item it returns exists, with its
 * recycle bin flag; one it leaves out is gone. A response with an error is no answer.
 * @param host The element asking.
 * @returns The check.
 */
export function createItemCheck(host: UmbControllerHost): NonNullable<FilePageDeps['items']> {
  return async (uniques) => {
    if (!uniques.length) return new Map();
    const repository = new UmbMediaItemRepository(host);
    try {
      const { data, error } = await repository.requestItems(uniques);
      if (error || !data) return undefined;
      return new Map(data.map((item) => [item.unique, { trashed: item.isTrashed }]));
    } catch {
      return undefined;
    } finally {
      repository.destroy();
    }
  };
}

/**
 * A folder's name through the media item repository, as an open names the folder it found.
 * @param host The element asking.
 * @returns The lookup; it answers undefined for anything it cannot read.
 */
export function createFolderName(host: UmbControllerHost): NonNullable<FilePageDeps['folderName']> {
  return async (unique) => {
    const repository = new UmbMediaItemRepository(host);
    try {
      const { data } = await repository.requestItems([unique]);
      return data?.[0]?.name;
    } catch {
      return undefined;
    } finally {
      repository.destroy();
    }
  };
}
