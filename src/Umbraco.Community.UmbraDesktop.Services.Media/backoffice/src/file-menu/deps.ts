import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { UmbImagingRepository } from '@umbraco-cms/backoffice/imaging';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import {
  UMB_MEDIA_ITEM_REPOSITORY_ALIAS,
  UMB_MEDIA_REFERENCE_REPOSITORY_ALIAS,
  UmbMediaItemRepository,
  UmbMediaReferenceRepository,
} from '@umbraco-cms/backoffice/media';
import { html } from '@umbraco-cms/backoffice/external/lit';
import type { UmbraDesktopMediaContext } from '../context/media.context.js';
import { wordsOf } from '../shared/words.js';

/**
 * What the file menu needs from outside itself: the media context's operations, thumbnails for the
 * recent list, and the discard question. Injectable, so a test needs no backoffice; the element
 * builds the real ones when it is given none.
 */
export interface FileMenuDeps {
  /** The media context's operations. */
  context: Pick<UmbraDesktopMediaContext, 'open' | 'recent' | 'forgetRecent' | 'save' | 'pickSaveFolder' | 'confirmOverwrite'>;
  /**
   * Thumbnail URLs for media items, by key, for Open's tiles. Only pictures: an item it
   * does not answer for is shown without one, because Umbraco's imaging endpoint answers nothing on a
   * failure as well as for a missing item, so its silence says nothing about the item.
   * @param uniques The items.
   * @returns Each item's thumbnail URL, by key.
   */
  thumbnails(uniques: string[]): Promise<Map<string, string>>;
  /**
   * Whether media items still exist, and whether they are in the recycle bin, for Open to
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
   * without it Save as names the folder it was given and nothing more.
   * @param unique The folder.
   * @returns Its name, or undefined when it cannot be read.
   */
  folderName?(unique: string): Promise<string | undefined>;
  /**
   * How many places use a media item: pages, members and other media that point at it (#137). Read
   * when a file is opened, for the used-elsewhere question and Info's Used in. Optional; without it,
   * or when it throws, a save asks nothing and Info leaves the row out.
   * @param unique The item.
   * @returns The count, or undefined when it cannot be read.
   */
  references?(unique: string): Promise<number | undefined>;
  /**
   * Ask whether to save over an item used elsewhere (#137). Optional; without it a save asks nothing.
   * @param name The item's name.
   * @param count How many places use it.
   * @param unique The item, so the question can list where it is used.
   * @returns True to save.
   */
  confirmUsedElsewhere?(name: string, count: number, unique: string): Promise<boolean>;
}

/** The size Open asks thumbnails at: twice the tile, so they are sharp on a high-density screen. */
export const THUMBNAIL_PX = 320;

/**
 * Thumbnails through Umbraco's imaging repository, which caches them and batches the request.
 * `requestResizedItems` rather than `requestThumbnailUrls`, which the 17.5 typings mark deprecated
 * for removal in 18. The server answers only for the items this user can see, and leaves out the
 * deleted and trashed, which is what lets Open drop them.
 * @param host The element asking.
 * @returns The thumbnail resolver.
 */
export function createThumbnails(host: UmbControllerHost): FileMenuDeps['thumbnails'] {
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
export function createDiscardQuestion(host: UmbControllerHost): FileMenuDeps['confirmDiscard'] {
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
export function createItemCheck(host: UmbControllerHost): NonNullable<FileMenuDeps['items']> {
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
 * How many places use an item, through Umbraco's media reference repository: the total of its
 * "referenced by" list, asked for one entry so only the count comes back. It counts every kind of
 * reference (pages, members, other media), which is why the words say "places" and not "pages".
 * @param host The element asking.
 * @returns The count; undefined for a response with an error.
 */
export function createReferenceCount(host: UmbControllerHost): NonNullable<FileMenuDeps['references']> {
  return async (unique) => {
    const repository = new UmbMediaReferenceRepository(host);
    try {
      const { data, error } = await repository.requestReferencedBy(unique, 0, 1);
      return error || !data ? undefined : data.total;
    } finally {
      repository.destroy();
    }
  };
}

/**
 * The used-elsewhere question in Umbraco's own confirm dialog, which rejects on cancel: two buttons,
 * Save and Cancel, as the overwrite question has (#137). No Save as copy button, since Save as cannot be
 * opened on a copy from here; the question names Save as instead.
 *
 * Under the sentence, the places themselves, with core's own references list
 * (`umb-confirm-action-modal-entity-references`), the one core's trash and delete questions show, so
 * the person sees which pages they are about to change rather than only how many (found by the
 * reviewer of #137).
 * @param host The element asking.
 * @returns The question.
 */
export function createUsedElsewhereQuestion(host: UmbControllerHost): NonNullable<FileMenuDeps['confirmUsedElsewhere']> {
  return async (name, count, unique) => {
    const localize = new UmbLocalizationController(host);
    const words = wordsOf(localize);
    const sentence = count === 1 ? words('usedQuestionOne', name) : words('usedQuestionMany', name, count);
    const references = { unique, itemRepositoryAlias: UMB_MEDIA_ITEM_REPOSITORY_ALIAS, referenceRepositoryAlias: UMB_MEDIA_REFERENCE_REPOSITORY_ALIAS };
    try {
      await umbConfirmModal(host, {
        headline: words('usedHeadline', name),
        content: html`<p>${sentence}</p>
          <umb-confirm-action-modal-entity-references .config=${references}></umb-confirm-action-modal-entity-references>`,
        color: 'danger',
        confirmLabel: words('usedConfirm'),
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
 * A folder's name through the media item repository, as an open names the folder it found.
 * @param host The element asking.
 * @returns The lookup; it answers undefined for anything it cannot read.
 */
export function createFolderName(host: UmbControllerHost): NonNullable<FileMenuDeps['folderName']> {
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
