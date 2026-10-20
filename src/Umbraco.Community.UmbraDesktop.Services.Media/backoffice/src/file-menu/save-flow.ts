import type { MediaSaveRequest } from '../files/media-save.js';
import type { FileMenuDeps } from './deps.js';
import { DEFAULT_QUALITY, contentHash, copyNameFor, extensionFor, keepFormatFor, mimeFor, versionedFileName } from './formats.js';
import type { FileEncoder, FileMenuDocument, FileSaveOutcome, SaveFormat } from './types.js';

/** Every choice a save makes: what Save as edits, and what Save takes as given. */
export interface SaveChoice {
  /** Write over the item, or save a new one beside it. */
  mode: 'replace' | 'copy';
  /** A copy's name. A replace saves under the document's own name. */
  name: string;
  /** A copy's folder, or null for the root. A replace stays where it is. */
  folder: string | null;
  /** That folder's name, for saying where. */
  folderName?: string;
  /** The format to write. */
  format: SaveFormat;
  /** 1 to 100, for JPEG and WebP. */
  quality: number;
}

/**
 * The choices Save as starts on, and the ones Save takes: replace, in the item's own format when it
 * can be kept and PNG when it cannot, at the default quality, with a copy named from the dictionary's
 * pattern going into the original's folder.
 * @param document What is open.
 * @param copyPattern The dictionary's copy name pattern, `%0% (copy)` in English.
 * @param format A format to start on instead, as Save asks for an item it cannot keep.
 * @returns The choices.
 */
export function saveAsDefaults(document: FileMenuDocument, copyPattern: string, format?: SaveFormat): SaveChoice {
  return {
    mode: 'replace',
    name: copyNameFor(document.name, copyPattern),
    folder: document.folder,
    ...(document.folderName !== undefined ? { folderName: document.folderName } : {}),
    format: format ?? keepFormatFor(document.extension) ?? 'png',
    quality: DEFAULT_QUALITY,
  };
}

/**
 * Save the document as chosen, through the media context.
 *
 * Encodes the picture, names the file from the name it saves under and the format's extension, and
 * saves. **A replace** names the item and the update date the document last saw, so a file somebody
 * changed in the Media section meanwhile is asked about (and saved again with `force` on a yes), and
 * it carries the focal-point reset. **A copy** names neither, so it is always a new item in its
 * folder, but it names the item the document came from as `copyOf`, so the new item is a full copy
 * of it (its media type and every property) holding the new file, and it carries the focal-point
 * reset too, since the focal point it copies was set on the picture before any reframe (edit-image
 * design §11.6). A document that was never saved is created, as a plain new item, in its own folder.
 *
 * **Before a replace**, `usedElsewhere` is asked whether to go on (#137, edit-image design §5): the
 * item may be used on pages, members or other media, and a save over it changes it in every one. The
 * file menu answers it, asking the person the first time for the open file when the item is used
 * anywhere. Every way of saving over an item comes through here, which is why the question is here.
 * Asked before anything is encoded, so a no costs nothing.
 * @param context The media context's save and its overwrite question.
 * @param document What is open.
 * @param choice How to save it.
 * @param encode How the app encodes its document.
 * @param resetFocalPoint Whether the picture was reframed since it was last saved (design D8).
 * @param usedElsewhere Whether to go on with a save over the item; without it, always.
 * @returns How it went, with what was written when it was.
 */
export async function runSave(
  context: Pick<FileMenuDeps['context'], 'save' | 'confirmOverwrite'>,
  document: FileMenuDocument,
  choice: SaveChoice,
  encode: FileEncoder,
  resetFocalPoint: boolean,
  usedElsewhere?: () => Promise<boolean>,
): Promise<FileSaveOutcome> {
  const replacing = choice.mode === 'replace' && document.unique !== null;
  if (replacing && usedElsewhere && !(await usedElsewhere())) return { status: 'cancelled' };
  const copy = choice.mode === 'copy';
  const name = copy ? choice.name : document.name;
  const folder = copy ? choice.folder : document.folder;
  const folderName = copy ? choice.folderName : document.folderName;
  const extension = extensionFor(choice.format, document.extension);
  const blob = await encode(choice.format, choice.quality);
  // A replace keeps the file's own name with a hash of the new contents, so a changed picture gets a
  // new address and no cache shows the old one (`versionedFileName`); a copy, or a first save, is a
  // new item at a new address anyway and is named after itself.
  const base = replacing && document.fileName ? document.fileName.replace(/\.[^.]*$/, '') : name;
  const fileName = replacing
    ? versionedFileName(base, contentHash(new Uint8Array(await blob.arrayBuffer())), extension)
    : `${base}.${extension}`;
  const file = new File([blob], fileName, { type: mimeFor(choice.format) });
  const request: MediaSaveRequest = { file, name, folder };
  if (replacing) {
    request.existing = document.unique as string;
    request.expectedUpdateDate = document.updateDate;
    request.resetFocalPoint = resetFocalPoint;
  } else if (copy && document.unique !== null) {
    request.copyOf = document.unique;
    request.resetFocalPoint = resetFocalPoint;
  }

  let result = await context.save(request);
  if (!result.ok && result.conflict) {
    if (!(await context.confirmOverwrite(document.name))) return { status: 'cancelled' };
    result = await context.save({ ...request, force: true });
  }
  if (!result.ok) return { status: 'failed', ...(result.message ? { message: result.message } : {}) };
  return {
    status: 'saved',
    saved: {
      unique: result.unique,
      updateDate: result.updateDate,
      name,
      extension,
      folder,
      ...(folderName !== undefined ? { folderName } : {}),
      copy: copy && !!document.unique,
      ...(result.copied ? { fullCopy: result.copied === 'full' } : {}),
      ...(result.notice ? { notice: result.notice } : {}),
      bytes: file.size,
      fileName,
    },
  };
}
