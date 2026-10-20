import { fileValueFor } from './file-value.js';

/**
 * The values a full copy of a media item is created with: Save as copy (#137, edit-image design
 * §11.6). Umbraco has no copy for media, so this is how the Media add-on's Media Manager copies an
 * item, repeated here because the packages never import from each other: read the item, leave out
 * what the server works out from the file, keep the rest, and give every file the copy holds a file of
 * its own. The difference is the one file the save brings: `umbracoFile` takes the new file instead
 * of a copy of the old one.
 */

/** The editor whose values the server works out for itself from the file, so a copy leaves them out. */
const DERIVED_EDITOR = 'Umbraco.Label';

/** The property a media item keeps its file in, as the dropzone's scaffold and every save name it. */
export const FILE_PROPERTY = 'umbracoFile';

/** The part of a property value a copy reads; the rest of it is carried over as it is. */
export interface CopiedValue {
  /** The property's alias. */
  alias: string;
  /** The property editor's alias, which says whether the server derives the value. */
  editorAlias: string;
  /** The value, missing for an empty property. */
  value?: unknown;
}

/**
 * Upload a copy of a file the site serves, for the new item to hold.
 * @param src The file's address on this site.
 * @returns The temporary file's key, or undefined when it could not be read or sent.
 */
export type FileReupload = (src: string) => Promise<string | undefined>;

/**
 * Whether a value holds a file: an image cropper's or upload field's value, with the file's address.
 * @param value The value.
 * @returns True for a file.
 */
function holdsFile(value: unknown): value is { src: string } & Record<string, unknown> {
  return !!value && typeof value === 'object' && typeof (value as { src?: unknown }).src === 'string' && !!(value as { src: string }).src;
}

/**
 * A file value without its address: what is left points at no file until a temporary file is added.
 * Pointing a new item at the original's address would share that file, and deleting the original
 * deletes it.
 * @param value The value.
 * @returns The value's other fields, or the value itself when it is not an object.
 */
function withoutSrc(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const { src: _src, ...rest } = value as Record<string, unknown>;
  return rest;
}

/**
 * The values of a full copy of a media item.
 *
 * The file property takes the new file, with the original's focal point and crops unless the picture
 * was reframed (see {@link fileValueFor}). The caller makes sure the original has one, as an
 * overwrite does: a copy of an item with no file is no copy of a picture. Every other file is
 * uploaded again, so the copy owns it; one that cannot be (missing on disk, too big to upload again,
 * on another host) is left out of the copy and named, so the copy is still made and the person can
 * be told (owner, 2026-10-20). The derived labels (width, height, size, extension) are left out for
 * the server to work out from the new file, and everything else is kept as it is.
 * @param values The original's values, as the media detail repository returns them.
 * @param temporaryFileId The uploaded file the copy holds.
 * @param resetFocalPoint Whether the picture was cropped, rotated or flipped since it was last saved.
 * @param reupload How another file gets a copy of its own.
 * @returns The copy's values, and the aliases of the properties left out because their file could not
 *   be copied. `values` is never changed.
 */
export async function copiedValues<T extends CopiedValue>(
  values: ReadonlyArray<T>,
  temporaryFileId: string,
  resetFocalPoint: boolean,
  reupload: FileReupload,
): Promise<{ values: T[]; leftOut: string[] }> {
  const copied: T[] = [];
  const leftOut: string[] = [];
  for (const value of values) {
    if (value.editorAlias === DERIVED_EDITOR) continue;
    if (value.alias === FILE_PROPERTY) {
      copied.push({ ...value, value: fileValueFor(withoutSrc(value.value), temporaryFileId, resetFocalPoint) });
    } else if (holdsFile(value.value)) {
      const copy = await reupload(value.value.src);
      if (copy) copied.push({ ...value, value: { ...(withoutSrc(value.value) as object), temporaryFileId: copy } });
      else leftOut.push(value.alias);
    } else {
      copied.push(value);
    }
  }
  return { values: copied, leftOut };
}
