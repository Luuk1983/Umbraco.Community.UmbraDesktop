import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbId } from '@umbraco-cms/backoffice/id';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { UMB_MEDIA_PROPERTY_VALUE_ENTITY_TYPE, UmbMediaDetailRepository } from '@umbraco-cms/backoffice/media';
import { UmbMediaTypeStructureRepository } from '@umbraco-cms/backoffice/media-type';
import { TemporaryFileStatus, UmbTemporaryFileManager } from '@umbraco-cms/backoffice/temporary-file';

/** How a save to the media library went. */
export type MediaSaveResult =
  | {
      ok: true;
      /** The media item's key, which a later save of the same document overwrites. */
      unique: string;
    }
  | {
      ok: false;
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
 * particular item.
 * @param host The element saving, whose contexts the backoffice classes consume.
 * @returns A {@link MediaSaver}.
 */
export function createMediaSaver(host: UmbControllerHost): MediaSaver {
  return async ({ file, name, folder, existing }) => {
    if (existing) {
      const replaced = await replaceFile(host, existing, file, name);
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
  return data ? { ok: true, unique: data.unique } : { ok: false, message: error?.message };
}

/**
 * Overwrite the file of an existing media item, and rename it if the document was renamed.
 * @param host The saving element.
 * @param unique The item to overwrite.
 * @param file The new file.
 * @param name The item's name now.
 * @returns How it went, or null when the item is gone and a new one should be created instead.
 */
async function replaceFile(
  host: UmbControllerHost,
  unique: string,
  file: File,
  name: string,
): Promise<MediaSaveResult | null> {
  const repository = new UmbMediaDetailRepository(host);
  const { data } = await repository.requestByUnique(unique);
  if (!data || data.isTrashed) return null;
  if (!data.values.some((value) => value.alias === 'umbracoFile')) return null;

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
  const { error } = await repository.save({ ...data, values, variants });
  return error ? { ok: false, message: error.message } : { ok: true, unique };
}
