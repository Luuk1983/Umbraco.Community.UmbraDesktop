import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbId } from '@umbraco-cms/backoffice/id';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { UMB_MEDIA_PROPERTY_VALUE_ENTITY_TYPE, UmbMediaDetailRepository } from '@umbraco-cms/backoffice/media';
import { UmbMediaTypeStructureRepository } from '@umbraco-cms/backoffice/media-type';
import { TemporaryFileStatus, UmbTemporaryFileManager } from '@umbraco-cms/backoffice/temporary-file';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import { AREA } from './area.js';

/** How a save to the media library went. */
export type MediaSaveResult =
  | {
      ok: true;
      /** The media item's key, which a later save of the same document overwrites. */
      unique: string;
      /**
       * When the item was last changed, now that this save has changed it: the version the next
       * save expects to find. Undefined when the backoffice did not say.
       */
      updateDate?: string | null;
    }
  | {
      ok: false;
      /**
       * Set when nothing was written because the item was changed in the media library since the
       * document last opened or saved it. The app asks, and saves again with `force` on a yes.
       */
      conflict?: true;
      /** Why, in the backoffice's own words where it gave any. */
      message?: string;
    };

/** What to save, and where. */
export interface MediaSaveRequest {
  /** The file, whose name carries the extension the media type is chosen by. */
  file: File;
  /** The media item's name: what the person called the document, which need not be the file name. */
  name: string;
  /** The folder a new item is created in, or null for the media library root. */
  folder: string | null;
  /**
   * The media item this document came from or was last saved as, to overwrite rather than
   * duplicate. The folder is ignored for it: an opened file is saved back where it lives.
   */
  existing?: string;
  /**
   * When `existing` was last changed as far as the document knows: its update date when it was
   * opened, or when this document last saved it. A save that finds it changed since, by somebody
   * else, answers with a conflict instead of overwriting their version. Undefined skips the check.
   */
  expectedUpdateDate?: string | null;
  /** Overwrite `existing` even if it changed since: the person was asked, and said yes. */
  force?: boolean;
}

/**
 * Whether a media item was changed since a document opened or last saved it, by its update date.
 *
 * Only a known date that differs counts. Either date missing is no conflict: a question asked over
 * every save of an item whose date was never known would have one answer, and train people to
 * click through it the one time it matters.
 * @param expected The update date the document last saw.
 * @param current The item's update date now.
 * @returns True when somebody else changed the item since.
 */
export function changedSince(expected: string | null | undefined, current: string | null | undefined): boolean {
  return typeof expected === 'string' && typeof current === 'string' && expected !== current;
}

/**
 * Ask whether to overwrite a media item somebody changed since the document opened it.
 * @param name The item's name, for the question.
 * @returns True to overwrite, false to save nothing.
 */
export type OverwriteQuestion = (name: string) => Promise<boolean>;

/**
 * The real question: Umbraco's own confirm dialog, as the discard question is Umbraco's own, so it
 * looks and behaves like every other question the backoffice asks. The dialog rejects on cancel,
 * which is the "no" here.
 * @param host The element asking, whose modal manager opens the dialog.
 * @returns An {@link OverwriteQuestion}.
 */
export function createOverwriteQuestion(host: UmbControllerHost): OverwriteQuestion {
  return async (name) => {
    const localize = new UmbLocalizationController(host);
    const term = (key: string, fallback: string) => localize.termOrDefault(`${AREA}_${key}`, fallback, name);
    try {
      await umbConfirmModal(host, {
        headline: term('overwriteHeadline', `Overwrite ${name}?`),
        content: term(
          'overwriteQuestion',
          `${name} was changed in the media library after you opened it. Overwrite it with your version?`,
        ),
        color: 'danger',
        confirmLabel: term('overwriteConfirm', 'Overwrite'),
      });
      return true;
    } catch {
      return false;
    }
  };
}

/**
 * A media item's update date. Media is invariant, so its one variant carries it, as it carries the
 * name.
 * @param item The item, as the detail repository returns it.
 * @returns The date, or undefined when it has none.
 */
export function updateDateOf(item: { variants: Array<{ updateDate: string | null }> }): string | null | undefined {
  return item.variants[0]?.updateDate;
}

/**
 * Save a file as a media item.
 * @param request What to save, and where.
 * @returns How it went.
 */
export type MediaSaver = (request: MediaSaveRequest) => Promise<MediaSaveResult>;

/**
 * The real media saver, working through the backoffice's own repositories rather than calling the
 * Management API by hand, so authentication, error notifications and permissions are the
 * backoffice's.
 *
 * **A new item is created the way the Media section's drag-and-drop creates one.** That code
 * (`UmbMediaDropzoneManager`) is not in the backoffice's public exports, so its steps are repeated
 * here with the public repositories it is built from: ask which media types accept the file's
 * extension, intersect that with what the folder allows, prefer a type that names the extension over
 * a catch-all, upload a temporary file, and create the item pointing at it. So a site that has
 * removed the File media type, or a folder that only allows images, refuses a save exactly as it
 * refuses a drag-and-drop, and says so in the same words.
 *
 * **A second save of the same document overwrites that item** instead of piling up copies, the way
 * Ctrl+S does everywhere: it reads the item, uploads the new file as a temporary file, points
 * `umbracoFile` at it and saves. If the item has gone (deleted, or in the recycle bin), the save
 * creates a new one instead, since the person asked for their work to be saved and not for that
 * particular item. **It never overwrites a version it has not seen**: if the item's update date is
 * not the one the document last saw, somebody replaced the file in the Media section meanwhile, and
 * the save writes nothing and answers with a conflict, unless the request says `force`. The check
 * and the write are two requests, so a change landing between them still wins last; the check is
 * for the far commoner case of a file changed while a window sat open on it.
 * @param host The element saving, whose contexts the backoffice classes consume.
 * @returns A {@link MediaSaver}.
 */
export function createMediaSaver(host: UmbControllerHost): MediaSaver {
  return async ({ file, name, folder, existing, expectedUpdateDate, force }) => {
    if (existing) {
      const replaced = await replaceFile(host, existing, file, name, force ? undefined : expectedUpdateDate);
      if (replaced) return replaced;
    }
    return createItem(host, file, name, folder);
  };
}

/**
 * Upload a file as a temporary file.
 * @param host The saving element.
 * @param file The file.
 * @returns The temporary file's key, or undefined if the upload failed.
 */
async function upload(host: UmbControllerHost, file: File): Promise<string | undefined> {
  const uploaded = await new UmbTemporaryFileManager(host).uploadOne({ temporaryUnique: UmbId.new(), file });
  return uploaded.status === TemporaryFileStatus.SUCCESS ? uploaded.temporaryUnique : undefined;
}

/**
 * Create a new media item from a file.
 * @param host The saving element.
 * @param file The file.
 * @param name The media item's name.
 * @param folder The parent folder, or null for the root.
 * @returns How it went.
 */
async function createItem(
  host: UmbControllerHost,
  file: File,
  name: string,
  folder: string | null,
): Promise<MediaSaveResult> {
  const localize = new UmbLocalizationController(host);
  const extension = /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? '';
  const structure = new UmbMediaTypeStructureRepository(host);
  const media = new UmbMediaDetailRepository(host);

  const available = extension ? await structure.requestMediaTypesOf({ fileExtension: extension }) : [];
  const parent = folder ? (await media.requestByUnique(folder)).data : undefined;
  const { data: allowed } = await structure.requestAllowedChildrenOf(parent?.mediaType.unique ?? null, folder);
  const options = available.filter((type) => allowed?.items.some((child) => child.unique === type.unique));
  if (!options.length) {
    const names = available.map((type) => type.name).join(', ');
    return {
      ok: false,
      message: available.length
        ? localize.term('media_disallowedMediaTypeNotAllowedHere', extension, names)
        : localize.term('media_disallowedFileExtension', extension),
    };
  }
  const mediaType = options.find((type) => type.matchedFileExtension) ?? options[0];

  const temporaryFileId = await upload(host, file);
  if (!temporaryFileId || !mediaType.unique) return { ok: false };

  const unique = UmbId.new();
  const { data: scaffold } = await media.createScaffold({
    unique,
    mediaType: { unique: mediaType.unique, collection: null },
    variants: [{ culture: null, segment: null, createDate: null, updateDate: null, flags: [], name }],
    values: [
      {
        editorAlias: '',
        alias: 'umbracoFile',
        value: { temporaryFileId },
        culture: null,
        segment: null,
        entityType: UMB_MEDIA_PROPERTY_VALUE_ENTITY_TYPE,
      },
    ],
  });
  if (!scaffold) return { ok: false };
  const { data, error } = await media.create(scaffold, folder);
  return data
    ? { ok: true, unique: data.unique, updateDate: updateDateOf(data) }
    : { ok: false, message: error?.message };
}

/**
 * Overwrite the file of an existing media item, and rename it if the document was renamed.
 * @param host The saving element.
 * @param unique The item to overwrite.
 * @param file The new file.
 * @param name The item's name now.
 * @param expectedUpdateDate The update date the document last saw, or undefined to overwrite
 *   whatever is there.
 * @returns How it went, or null when the item is gone and a new one should be created instead.
 */
async function replaceFile(
  host: UmbControllerHost,
  unique: string,
  file: File,
  name: string,
  expectedUpdateDate: string | null | undefined,
): Promise<MediaSaveResult | null> {
  const repository = new UmbMediaDetailRepository(host);
  const { data } = await repository.requestByUnique(unique);
  if (!data || data.isTrashed) return null;
  if (!data.values.some((value) => value.alias === 'umbracoFile')) return null;
  // Checked before the upload, so a save that is going to ask first leaves no temporary file behind.
  if (changedSince(expectedUpdateDate, updateDateOf(data))) return { ok: false, conflict: true };

  const temporaryFileId = await upload(host, file);
  if (!temporaryFileId) return { ok: false };

  // Keep whatever else the value holds (an image's crops and focal point), and point it at the new
  // file. The server's file-upload and image-cropper editors both take `temporaryFileId` to mean
  // "replace the file with this one", which is what the dropzone's own scaffold relies on too.
  const values = data.values.map((value) =>
    value.alias === 'umbracoFile'
      ? { ...value, value: { ...((value.value as object | null) ?? {}), temporaryFileId } }
      : value,
  );
  // Media is invariant, so the one variant carries the name.
  const variants = data.variants.map((variant) => ({ ...variant, name }));
  const { data: saved, error } = await repository.save({ ...data, values, variants });
  return error
    ? { ok: false, message: error.message }
    : { ok: true, unique, updateDate: saved ? updateDateOf(saved) : undefined };
}
