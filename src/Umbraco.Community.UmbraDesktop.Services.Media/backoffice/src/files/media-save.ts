import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbId } from '@umbraco-cms/backoffice/id';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { UmbMediaDetailRepository } from '@umbraco-cms/backoffice/media';
import { UmbMediaTypeDetailRepository, UmbMediaTypeStructureRepository } from '@umbraco-cms/backoffice/media-type';
import { TemporaryFileStatus, UmbTemporaryFileManager } from '@umbraco-cms/backoffice/temporary-file';
import { umbConfirmModal } from '@umbraco-cms/backoffice/modal';
import { AREA } from '../shared/area.js';
import { FILE_PROPERTY } from './copy-values.js';
import { copyMedia } from './copy-media.js';
import type { CopyDeps } from './copy-media.js';
import { extensionOf } from './extension.js';
import { fileValueFor } from './file-value.js';
import { wordsOf } from '../shared/words.js';
import { contentHash, unversionedBase, versionedFileName } from '../file-menu/formats.js';

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
      /**
       * For a save with `copyOf`: `full` when the new item is a copy with the original's media type and
       * properties, `plain` when the original was gone and a plain new item was made instead. An app
       * drops what a plain item does not have (the Image Editor its focal point). Issue #137.
       */
      copied?: 'full' | 'plain';
      /**
       * Something the person should know about a save that worked, in this package's words: a copy
       * made without a property whose file could not be copied, or a plain copy. Show it where you
       * would say "Saved". Issue #137.
       */
      notice?: string;
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
  /**
   * The media item a new item is a full copy of: it takes that item's media type and every property
   * value (the focal point and crops, alt text, a custom type's own properties), with this file in
   * place of the old one. Read only when `existing` is not set. If that item's media type does not
   * take this file's format, or `folder` does not allow it, nothing is saved and the answer says why.
   * If the item is gone or in the recycle bin, the save makes a plain new item instead, as a save over
   * a gone item does, and says so (`copied: 'plain'`). Undefined is a plain new item, as every save
   * was before this field. Issue #137, edit-image design §11.6 and §11.7.
   */
  copyOf?: string;
  /**
   * Whether the picture was cropped, rotated or flipped since it was last saved, so the overwritten
   * item's (or the copied item's) focal point and every named crop's coordinates are reset rather than
   * kept pointing at other pixels. Only an overwrite and a `copyOf` copy read it: a plain new item has
   * neither. Undefined is false, which keeps them, as every save did before this field. Issue #136,
   * design D8.
   */
  resetFocalPoint?: boolean;
  /**
   * Write the file as `<base>-ud<8 hex>.<ext>`, the hash of its contents, in place of a marker an
   * earlier save left, the name every save over an item in the file menu writes: a picture that
   * changed gets a new address, so no cache goes on showing the old one, and the same bytes keep the
   * same name. Undefined is false, which saves the file under the name it has. Issue #176, for the
   * Media add-on's Replace file; edit-image design §11.4.
   */
  versioned?: boolean;
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

/** The ways a save can go, which {@link routeSave} chooses between. Injectable, so the choice is tested. */
export interface SaveSteps {
  /** Overwrite `existing`; null when it is gone and a new item should be made instead. */
  replace(request: MediaSaveRequest & { existing: string }): Promise<MediaSaveResult | null>;
  /** Copy `copyOf`; null when it is gone and a plain new item should be made instead. */
  copy(request: MediaSaveRequest & { copyOf: string }): Promise<MediaSaveResult | null>;
  /** Make a plain new item. */
  createNew(request: MediaSaveRequest): Promise<MediaSaveResult>;
  /** What the person is told when a copy had to be a plain new item. */
  plainCopyNotice(): string;
}

/**
 * Choose how a save goes: over `existing`, as a copy of `copyOf`, or as a plain new item, each falling
 * back to a plain new item when the item it names is gone. A refused copy is passed on rather than
 * made plain behind the person's back. A `versioned` request is renamed first (#176).
 * @param steps The ways it can go.
 * @param original What to save.
 * @returns How it went.
 */
export async function routeSave(steps: SaveSteps, original: MediaSaveRequest): Promise<MediaSaveResult> {
  const request = original.versioned ? { ...original, file: await versionedFile(original.file) } : original;
  const { existing, copyOf } = request;
  if (existing) {
    const replaced = await steps.replace({ ...request, existing });
    if (replaced) return replaced;
  } else if (copyOf) {
    const copied = await steps.copy({ ...request, copyOf });
    if (copied) return copied;
    const plain = await steps.createNew(request);
    return plain.ok ? { ...plain, copied: 'plain', notice: steps.plainCopyNotice() } : plain;
  }
  return steps.createNew(request);
}

/**
 * A file renamed after its contents, as `versioned` asks (#176): the name it has, without an earlier
 * save's marker, with the hash of these bytes, and its own extension. A name with no extension keeps
 * none.
 * @param file The file.
 * @returns The same contents and type under the new name.
 */
async function versionedFile(file: File): Promise<File> {
  const dot = file.name.lastIndexOf('.');
  const base = dot > 0 ? file.name.slice(0, dot) : file.name;
  const extension = dot > 0 ? file.name.slice(dot + 1) : '';
  const hash = contentHash(new Uint8Array(await file.arrayBuffer()));
  const name = extension ? versionedFileName(base, hash, extension) : `${unversionedBase(base)}-ud${hash}`;
  return new File([file], name, { type: file.type, lastModified: file.lastModified });
}

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
 *
 * **A save with `copyOf` is a full copy** of that item: a new item of its media type with all its
 * values and the new file (see `copy-media.ts`). A copy that cannot be full is refused with the
 * reason; a copy of an item that is gone is a plain new item, made as above, and says so.
 * @param host The element saving, whose contexts the backoffice classes consume.
 * @returns A {@link MediaSaver}.
 */
export function createMediaSaver(host: UmbControllerHost): MediaSaver {
  return (request) =>
    routeSave(
      {
        replace: ({ existing, file, name, expectedUpdateDate, force, resetFocalPoint }) =>
          replaceFile(host, existing, file, name, force ? undefined : expectedUpdateDate, resetFocalPoint === true),
        copy: ({ copyOf, file, name, folder, resetFocalPoint }) =>
          copyMedia(copyDeps(host), { copyOf, file, name, folder, resetFocalPoint: resetFocalPoint === true }),
        createNew: ({ file, name, folder }) => createItem(host, file, name, folder),
        plainCopyNotice: () => wordsOf(new UmbLocalizationController(host))('copyPlain'),
      },
      request,
    );
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
 * Upload a copy of a file the site serves, as a temporary file named after the file. Read past the
 * browser's cache, as an open is (`media-open.ts`, `fetchFile`): a file replaced under the same name
 * would otherwise be copied as it was.
 * @param host The saving element.
 * @param src The file's address on this site.
 * @returns The temporary file's key, or undefined if it could not be read or sent.
 */
async function reupload(host: UmbControllerHost, src: string): Promise<string | undefined> {
  try {
    const response = await fetch(src, { credentials: 'same-origin', cache: 'no-cache' });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    const name = decodeURIComponent(src.split('?')[0].split('/').pop() || 'file');
    return await upload(host, new File([blob], name, { type: blob.type }));
  } catch {
    return undefined;
  }
}

/**
 * The backoffice operations a full copy needs (see `copy-media.ts`), through the backoffice's own
 * repositories, as every other save here.
 * @param host The saving element.
 * @returns The operations.
 */
function copyDeps(host: UmbControllerHost): CopyDeps {
  const media = new UmbMediaDetailRepository(host);
  const structure = new UmbMediaTypeStructureRepository(host);
  const words = wordsOf(new UmbLocalizationController(host));
  return {
    read: async (unique) => {
      const { data } = await media.requestByUnique(unique);
      return data ? { name: data.variants[0]?.name ?? '', isTrashed: data.isTrashed, mediaType: data.mediaType, values: data.values } : undefined;
    },
    typesAccepting: async (extension) =>
      (await structure.requestMediaTypesOf({ fileExtension: extension })).flatMap((type) => (type.unique ? [type.unique] : [])),
    allowedIn: async (folder) => {
      const parent = folder ? (await media.requestByUnique(folder)).data : undefined;
      const { data } = await structure.requestAllowedChildrenOf(parent?.mediaType.unique ?? null, folder);
      return data?.items.flatMap((type) => (type.unique ? [type.unique] : [])) ?? [];
    },
    upload: (file) => upload(host, file),
    reupload: (src) => reupload(host, src),
    propertyNames: async (mediaType) => {
      const { data } = await new UmbMediaTypeDetailRepository(host).requestByUnique(mediaType);
      return new Map((data?.properties ?? []).map((property) => [property.alias, property.name]));
    },
    create: async (item, folder) => {
      const { data: scaffold } = await media.createScaffold({
        unique: UmbId.new(),
        mediaType: item.mediaType,
        variants: [{ culture: null, segment: null, createDate: null, updateDate: null, flags: [], name: item.name }],
        values: item.values as never,
      });
      if (!scaffold) return { ok: false };
      const { data, error } = await media.create(scaffold, folder);
      return data ? { ok: true, unique: data.unique, updateDate: updateDateOf(data) } : { ok: false, message: error?.message };
    },
    words: {
      formatRefused: (name, format) => words('copyFormatRefused', name, format),
      folderRefused: (name) => words('copyFolderRefused', name),
      leftOut: (names) => words('copyLeftOut', names),
    },
  };
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
  const extension = extensionOf(file.name);
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
        alias: FILE_PROPERTY,
        value: { temporaryFileId },
        culture: null,
        segment: null,
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
 * @param resetFocalPoint Whether to reset the focal point and the named crops (see {@link fileValueFor}).
 * @returns How it went, or null when the item is gone and a new one should be created instead.
 */
async function replaceFile(
  host: UmbControllerHost,
  unique: string,
  file: File,
  name: string,
  expectedUpdateDate: string | null | undefined,
  resetFocalPoint: boolean,
): Promise<MediaSaveResult | null> {
  const repository = new UmbMediaDetailRepository(host);
  const { data } = await repository.requestByUnique(unique);
  if (!data || data.isTrashed) return null;
  if (!data.values.some((value) => value.alias === FILE_PROPERTY)) return null;
  // Checked before the upload, so a save that is going to ask first leaves no temporary file behind.
  if (changedSince(expectedUpdateDate, updateDateOf(data))) return { ok: false, conflict: true };

  const temporaryFileId = await upload(host, file);
  if (!temporaryFileId) return { ok: false };

  // Point the value at the new file, keeping the rest of it unless the picture was reframed.
  const values = data.values.map((value) =>
    value.alias === FILE_PROPERTY
      ? { ...value, value: fileValueFor(value.value, temporaryFileId, resetFocalPoint) }
      : value,
  );
  // Media is invariant, so the one variant carries the name.
  const variants = data.variants.map((variant) => ({ ...variant, name }));
  const { data: saved, error } = await repository.save({ ...data, values, variants });
  return error
    ? { ok: false, message: error.message }
    : { ok: true, unique, updateDate: saved ? updateDateOf(saved) : undefined };
}
