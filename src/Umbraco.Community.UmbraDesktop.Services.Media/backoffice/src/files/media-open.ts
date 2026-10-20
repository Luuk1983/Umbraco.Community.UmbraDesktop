import { extensionOf } from './extension.js';
import { updateDateOf } from './media-save.js';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_MEDIA_PICKER_MODAL, UmbMediaDetailRepository, UmbMediaItemRepository } from '@umbraco-cms/backoffice/media';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';

/** A media file, read and ready to edit. */
export interface OpenedMedia {
  /** The media item, which a save overwrites. */
  unique: string;
  /** The media item's name, which becomes the document's. */
  name: string;
  /** The file's contents. */
  blob: Blob;
  /** The file's extension, without the dot, kept so a save writes the same kind of file. */
  extension: string;
  /**
   * When the media item was last changed, as it was opened. A save hands it back, so a file
   * somebody replaced in the Media section meanwhile is asked about rather than overwritten.
   * Undefined when the backoffice did not say.
   */
  updateDate?: string | null;
  /**
   * The folder the item is in: its key, or null for the media library root. For an app that saves
   * a copy next to the original, or says where the file lives. Undefined from a version of this
   * service that did not say. Issue #136.
   */
  folder?: string | null;
  /** The folder's name, for saying where the file lives. Undefined at the root, which has none. */
  folderName?: string;
  /**
   * The image's focal point as fractions of its width and height, or null when it has none (or is
   * not an image). For an editor that shows it before a crop resets it. Issue #136.
   */
  focalPoint?: { left: number; top: number } | null;
  /**
   * The file's own name in the media library, with its extension, as its address ends. The file
   * menu's save over the item writes it again with a hash of the new contents (#137). Issue #136.
   */
  fileName?: string;
  /**
   * Whether the item is in the recycle bin. Opening by key reads it wherever it is, so an app that
   * opens an item it was handed, as the Image Editor does from Edit image and when its window reopens,
   * can refuse one binned since. Undefined from a version of this service that did not say. Issue #137.
   */
  isTrashed?: boolean;
}

/** What to open. */
export interface MediaOpenOptions {
  /**
   * The media item to open, by key, without showing the picker: for an app's own list of recent
   * files. Undefined shows the picker, as an open always did.
   */
  unique?: string;
}

/** A media item's detail model, as far as {@link openedFrom} reads it. */
export interface OpenableDetail {
  /** The item's key. */
  unique: string;
  /** Its one variant (media is invariant), which carries the name and the update date. */
  variants: Array<{ name: string; updateDate: string | null }>;
  /** Its property values; `umbracoFile` holds the file's address and, for an image, the focal point. */
  values: Array<{ alias: string; value?: unknown }>;
  /** Whether it is in the recycle bin. */
  isTrashed?: boolean;
}

/**
 * The focal point an `umbracoFile` value holds, read defensively: the image cropper stores
 * `{ left, top }` as fractions, and anything else is no focal point at all.
 * @param value The `umbracoFile` value.
 * @returns The focal point, or null.
 */
function focalPointOf(value: { focalPoint?: unknown }): { left: number; top: number } | null {
  const point = value.focalPoint as { left?: unknown; top?: unknown } | null | undefined;
  return point && typeof point.left === 'number' && typeof point.top === 'number'
    ? { left: point.left, top: point.top }
    : null;
}

/**
 * The file's name from its address: the last part of the path, without a query, decoded.
 * @param src The file's address.
 * @returns The name.
 */
function fileNameOf(src: string): string {
  const last = src.split(/[?#]/)[0].split('/').pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * What an open hands an app, mapped from the item the backoffice returned and its file. Pure, so
 * the mapping is tested without a server; {@link createMediaOpener} fetches what it maps.
 * @param detail The media item's detail.
 * @param blob The file's contents.
 * @param folder The folder the item is in: its key (null for the root) and its name, when known.
 * @returns The opened file, or null when the item has no file to open.
 */
export function openedFrom(
  detail: OpenableDetail,
  blob: Blob,
  folder: { unique: string | null; name?: string },
): OpenedMedia | null {
  const value = detail.values.find((candidate) => candidate.alias === 'umbracoFile')?.value as
    | { src?: string; focalPoint?: unknown }
    | null
    | undefined;
  if (!value?.src) return null;
  return {
    unique: detail.unique,
    name: detail.variants[0]?.name ?? '',
    blob,
    extension: extensionOf(value.src),
    updateDate: updateDateOf(detail),
    focalPoint: focalPointOf(value),
    fileName: fileNameOf(value.src),
    folder: folder.unique,
    ...(folder.name !== undefined ? { folderName: folder.name } : {}),
    isTrashed: detail.isTrashed === true,
  };
}

/** How opening went. */
export type MediaOpenResult =
  | ({ status: 'opened' } & OpenedMedia)
  | { status: 'cancelled' }
  | {
      status: 'failed';
      /** What was picked, for saying which file could not be read. */
      name?: string;
    };

/**
 * Let the person pick a file from the media library, and read it.
 *
 * An interface over one function, so an element can be handed a fake in a test: the real one needs
 * a booted backoffice for the picker and a server for the file.
 */
export type MediaOpener = (options?: MediaOpenOptions) => Promise<MediaOpenResult>;

/**
 * The real opener: Umbraco's own media picker, then the item's file, fetched from its URL.
 *
 * The picker is `UMB_MEDIA_PICKER_MODAL`, the one a media picker property opens, so it browses
 * folders, searches, and hides what the person cannot see, exactly as the rest of the backoffice
 * does. Folders are not pickable. Whether the file suits the app that asked (text for Notepad, a
 * raster image for Paint) is the app's to decide once it has the file, so each can say so in its
 * own words.
 * @param host The element opening, whose contexts the backoffice classes consume.
 * @returns A {@link MediaOpener}.
 */
export function createMediaOpener(host: UmbControllerHost): MediaOpener {
  return async (options) => {
    const unique = options?.unique ?? (await pick(host));
    if (!unique) return { status: 'cancelled' };

    const { data } = await new UmbMediaDetailRepository(host).requestByUnique(unique);
    const name = data?.variants[0]?.name;
    const value = data?.values.find((candidate) => candidate.alias === 'umbracoFile')?.value as
      | { src?: string }
      | undefined;
    if (!data || !value?.src) return { status: 'failed', name };

    try {
      const blob = await fetchFile(value.src);
      if (!blob) return { status: 'failed', name };
      const opened = openedFrom(data, blob, await folderOf(host, unique));
      return opened ? { status: 'opened', ...opened } : { status: 'failed', name };
    } catch {
      return { status: 'failed', name };
    }
  };
}

/**
 * Read a media file's contents, past the browser's cache.
 *
 * `no-cache` has the browser ask the server whether its copy is still current rather than use it
 * unasked. A save over an item under the same file name keeps its address, so a copy cached before
 * the save is a copy of the old file: found in a real backoffice, where a picture saved turned
 * reopened upright. The file menu now gives a changed file a new name (#137), but an app saving
 * through the context directly, and a person uploading a file of the same name, still keep it. The
 * server answers 304 when nothing changed, so an unchanged file costs no download.
 * @param src The file's address.
 * @returns The contents, or undefined when the server would not give them.
 */
export async function fetchFile(src: string): Promise<Blob | undefined> {
  const response = await fetch(src, { credentials: 'same-origin', cache: 'no-cache' });
  return response.ok ? response.blob() : undefined;
}

/**
 * Umbraco's media picker, for one file.
 * @param host The element opening.
 * @returns The picked item's key, or undefined when nothing was picked.
 */
async function pick(host: UmbControllerHost): Promise<string | undefined> {
  const picked = await umbOpenModal(host, UMB_MEDIA_PICKER_MODAL, {
    data: { multiple: false, pickableFilter: (item) => !item.isFolder && !item.noAccess },
  }).catch(() => undefined);
  return picked?.selection?.[0] ?? undefined;
}

/**
 * The folder an item is in, with its name.
 *
 * From the item repository, because the detail model carries no parent and the item model does
 * (checked in the 17.5 typings). One more item request names the folder; the root has no name. A
 * failure of either is no folder known, never a failed open: where the file lives is a nicety, the
 * file itself is the point.
 * @param host The element opening.
 * @param unique The item.
 * @returns Its folder's key (null at the root) and name.
 */
async function folderOf(host: UmbControllerHost, unique: string): Promise<{ unique: string | null; name?: string }> {
  try {
    const items = new UmbMediaItemRepository(host);
    const { data } = await items.requestItems([unique]);
    const parent = data?.[0]?.parent?.unique ?? null;
    if (!parent) return { unique: null };
    const { data: folders } = await items.requestItems([parent]);
    return { unique: parent, name: folders?.[0]?.name };
  } catch {
    return { unique: null };
  }
}
