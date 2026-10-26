import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbDataTypeDetailRepository } from '@umbraco-cms/backoffice/data-type';
import { UmbMediaItemRepository } from '@umbraco-cms/backoffice/media';
import { UmbMediaTypeDetailRepository } from '@umbraco-cms/backoffice/media-type';

/** The property editor Umbraco's own Image type stores its file with. */
const IMAGE_CROPPER = 'Umbraco.ImageCropper';

/** The property every media type that carries a file stores it in. */
const FILE_PROPERTY = 'umbracoFile';

/**
 * What the is-image condition asks of the backoffice. An interface, so its tests answer from tables
 * rather than a server; {@link backofficeLookups} is the real one.
 */
export interface ImageLookups {
  /**
   * A media type's properties, as far as the file property's data type.
   * @param unique The media type.
   * @returns Its properties, or undefined when it cannot be read.
   */
  mediaType(unique: string): Promise<{ properties: Array<{ alias: string; dataType: { unique: string } }> } | undefined>;
  /**
   * A data type's property editor.
   * @param unique The data type.
   * @returns Its editor alias, or undefined when it cannot be read.
   */
  dataType(unique: string): Promise<{ editorAlias?: string } | undefined>;
  /**
   * A media item's media type, for where core gives no content-type context (its table view).
   * @param unique The media item.
   * @returns The media type's key, or undefined when the item cannot be read.
   */
  itemMediaType(unique: string): Promise<string | undefined>;
}

/**
 * Whether a media type is an image type: its `umbracoFile` uses the Image Cropper (design §3,
 * condition 4). That is how Umbraco itself tells them apart: the built-in Image type uses the cropper,
 * File and Vector Graphics use the upload field, and a site's own image types copy the Image type. A
 * folder has no file property at all.
 *
 * Two lookups per media type, never per item: core's detail repositories keep what they read while the
 * server-event connection is up, and join requests already in flight, so a grid of fifty photos asks
 * about the Image type once.
 * @param lookups How to read the backoffice.
 * @param mediaType The media type's key.
 * @returns True for an image type; false for anything else, and when either lookup fails.
 */
export async function isImageMediaType(lookups: ImageLookups, mediaType: string): Promise<boolean> {
  return (await readMediaFileKind(lookups, mediaType)) === 'image';
}

/**
 * What kind of file a media type holds (#176): `image` when its `umbracoFile` uses the Image Cropper,
 * `file` when it uses anything else (the Upload field of File, Vector Graphics, a video type), `none`
 * when it has no `umbracoFile`, as a folder has none.
 */
export type MediaFileKind = 'image' | 'file' | 'none';

/**
 * What kind of file a media type holds, or undefined when that could not be read: the media type or
 * its file property's data type did not answer, or a lookup failed.
 * @param lookups How to read the backoffice.
 * @param mediaType The media type's key.
 * @returns The kind, or undefined when unknown.
 */
async function readMediaFileKind(lookups: ImageLookups, mediaType: string): Promise<MediaFileKind | undefined> {
  try {
    const type = await lookups.mediaType(mediaType);
    if (!type) return undefined;
    const file = type.properties.find((each) => each.alias === FILE_PROPERTY);
    if (!file) return 'none';
    const dataType = await lookups.dataType(file.dataType.unique);
    if (!dataType) return undefined;
    return dataType.editorAlias === IMAGE_CROPPER ? 'image' : 'file';
  } catch {
    return undefined;
  }
}

/** What each media type was found to be, for this page: the answer, or the lookup still on its way. */
const fileKinds = new Map<string, Promise<MediaFileKind | undefined>>();

/**
 * The kind of file a media type holds, read once per media type for the page rather than once per
 * item (found by the reviewer of #137). Core keeps what its repositories read only while the
 * server-event connection is up; without it a grid of a hundred photos read the Image type a hundred
 * times. An answer that could not be read is not kept, so the next item asks again. A media type whose
 * file editor changes while a page is open keeps its old answer until the page loads again, which is
 * the rare case.
 * @param lookups How to read the backoffice.
 * @param mediaType The media type's key.
 * @returns The kind; `none` when it could not be read.
 */
export async function mediaFileKindCached(lookups: ImageLookups, mediaType: string): Promise<MediaFileKind> {
  let answer = fileKinds.get(mediaType);
  if (!answer) {
    answer = readMediaFileKind(lookups, mediaType);
    fileKinds.set(mediaType, answer);
  }
  const known = await answer;
  if (known === undefined && fileKinds.get(mediaType) === answer) fileKinds.delete(mediaType);
  return known ?? 'none';
}

/**
 * {@link isImageMediaType}, read once per media type for the page: {@link mediaFileKindCached} is
 * `image`.
 * @param lookups How to read the backoffice.
 * @param mediaType The media type's key.
 * @returns True for an image type; false for anything else, and when it could not be read.
 */
export async function isImageMediaTypeCached(lookups: ImageLookups, mediaType: string): Promise<boolean> {
  return (await mediaFileKindCached(lookups, mediaType)) === 'image';
}

/** Forget every media type's answer. For tests, which each bring their own media types. */
export function clearImageTypeCache(): void {
  fileKinds.clear();
}

/**
 * The real lookups: core's media type and data type detail repositories, and its media item
 * repository for the item's type. Each repository is made the first time it is needed, on the
 * condition, so it goes when the condition does and a card that never needs the item asks nothing.
 * @param host The condition, whose host the repositories are created on.
 * @returns The lookups.
 */
export function backofficeLookups(host: UmbControllerHost): ImageLookups {
  let mediaTypes: UmbMediaTypeDetailRepository | undefined;
  let dataTypes: UmbDataTypeDetailRepository | undefined;
  let items: UmbMediaItemRepository | undefined;
  return {
    mediaType: async (unique) => (await (mediaTypes ??= new UmbMediaTypeDetailRepository(host)).requestByUnique(unique)).data,
    dataType: async (unique) => {
      const { data } = await (dataTypes ??= new UmbDataTypeDetailRepository(host)).requestByUnique(unique);
      return data ? { editorAlias: data.editorAlias ?? undefined } : undefined;
    },
    itemMediaType: async (unique) => (await (items ??= new UmbMediaItemRepository(host)).requestItems([unique])).data?.[0]?.mediaType.unique,
  };
}
