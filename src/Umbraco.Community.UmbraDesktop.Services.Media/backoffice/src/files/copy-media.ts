import { copiedValues } from './copy-values.js';
import type { CopiedValue, FileReupload } from './copy-values.js';
import { FILE_PROPERTY } from './copy-values.js';
import { extensionOf } from './extension.js';
import type { MediaSaveResult } from './media-save.js';

/*
 * A full copy of a media item, holding a new file: what Save as copy makes (#137, edit-image design
 * §11.6 and §11.7). The decision is here, behind the backoffice operations it needs (`CopyDeps`), so
 * every branch is tested against fakes; `media-save.ts` builds the real operations.
 */

/** The item a copy is made of, as far as a copy reads it. */
export interface CopyableItem {
  /** Its name, for what the person is told. */
  name: string;
  /** Whether it is in the recycle bin. */
  isTrashed: boolean;
  /** Its media type, which the copy takes. */
  mediaType: { unique: string; collection: { unique: string } | null };
  /** Its property values, which the copy takes (see {@link copiedValues}). */
  values: ReadonlyArray<CopiedValue>;
}

/** What a copy is created as. */
export interface CopyCreate {
  /** The copy's media type: the original's. */
  mediaType: CopyableItem['mediaType'];
  /** The copy's name. */
  name: string;
  /** The copy's values. */
  values: CopiedValue[];
}

/** What a copy needs from the backoffice. */
export interface CopyDeps {
  /** The item to copy, or undefined when it cannot be read (gone, or not this user's to read). */
  read(unique: string): Promise<CopyableItem | undefined>;
  /** The keys of the media types that take files with an extension. */
  typesAccepting(extension: string): Promise<string[]>;
  /** The keys of the media types a folder allows, or the media library root's for null. */
  allowedIn(folder: string | null): Promise<string[]>;
  /** Upload the new file; its temporary file's key, or undefined when the upload failed. */
  upload(file: File): Promise<string | undefined>;
  /** Upload a copy of another file the original holds. */
  reupload: FileReupload;
  /** The names of a media type's properties, by alias, for saying which one a copy is without. */
  propertyNames(mediaType: string): Promise<Map<string, string>>;
  /** Create the copy in a folder; how it went, in the backoffice's words where it gave any. */
  create(item: CopyCreate, folder: string | null): Promise<MediaSaveResult>;
  /** What the person is told. */
  words: {
    /** The original's media type does not take the new file's format. */
    formatRefused(name: string, format: string): string;
    /** The folder does not allow the original's media type. */
    folderRefused(name: string): string;
    /** The copy was made without these properties, whose files could not be copied. */
    leftOut(names: string): string;
  };
}

/** A copy to make. */
export interface CopyRequest {
  /** The item to copy. */
  copyOf: string;
  /** The new file. */
  file: File;
  /** The copy's name. */
  name: string;
  /** The folder it goes in, or null for the root. */
  folder: string | null;
  /** Whether the picture was reframed, so the copied focal point and crops are reset. */
  resetFocalPoint: boolean;
}

/**
 * Make a full copy of a media item: a new item of its media type with all its values and the new file,
 * created in one request.
 *
 * Umbraco has no copy for media, so it is made the way the Media Manager copies an item: read the item
 * and create one of its media type with its values (see {@link copiedValues}).
 *
 * **When there is no item to copy** (gone, in the recycle bin, or holding no file), the answer is null
 * and the caller makes a plain new item, as a save over a gone item does: the person asked for their
 * work to be saved.
 *
 * **When a full copy cannot be made** (the original's media type does not take the new file's format,
 * or the folder does not allow that type) nothing is saved and the person is told why, so they can
 * choose another format or folder. Owner's choice, 2026-10-20: a copy that silently lost its type and
 * properties was the alternative. Both are checked before anything is uploaded.
 *
 * **Another file the original holds that cannot be copied** (missing on disk, too big to upload
 * again, on another host) is left out of the copy, and the answer says which, by property name.
 * Owner's choice, 2026-10-20.
 * @param deps What it needs from the backoffice.
 * @param request The copy to make.
 * @returns How it went, or null when a plain new item should be made instead.
 */
export async function copyMedia(deps: CopyDeps, request: CopyRequest): Promise<MediaSaveResult | null> {
  const original = await deps.read(request.copyOf);
  if (!original || original.isTrashed) return null;
  if (!original.values.some((value) => value.alias === FILE_PROPERTY)) return null;
  const mediaType = original.mediaType.unique;

  const extension = extensionOf(request.file.name);
  if (!extension || !(await deps.typesAccepting(extension)).includes(mediaType)) {
    return { ok: false, message: deps.words.formatRefused(original.name, extension.toUpperCase()) };
  }
  if (!(await deps.allowedIn(request.folder)).includes(mediaType)) {
    return { ok: false, message: deps.words.folderRefused(original.name) };
  }

  const temporaryFileId = await deps.upload(request.file);
  if (!temporaryFileId) return { ok: false };
  const { values, leftOut } = await copiedValues(original.values, temporaryFileId, request.resetFocalPoint, deps.reupload);

  const created = await deps.create({ mediaType: original.mediaType, name: request.name, values }, request.folder);
  if (!created.ok) return created;
  if (!leftOut.length) return { ...created, copied: 'full' };
  const names = await deps.propertyNames(mediaType).catch(() => new Map<string, string>());
  return { ...created, copied: 'full', notice: deps.words.leftOut(leftOut.map((alias) => names.get(alias) ?? alias).join(', ')) };
}
