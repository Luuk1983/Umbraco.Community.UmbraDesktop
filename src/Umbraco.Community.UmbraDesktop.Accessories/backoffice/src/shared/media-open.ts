import { extensionOf } from './media-files.js';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_MEDIA_PICKER_MODAL, UmbMediaDetailRepository } from '@umbraco-cms/backoffice/media';
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
export type MediaOpener = () => Promise<MediaOpenResult>;

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
  return async () => {
    const picked = await umbOpenModal(host, UMB_MEDIA_PICKER_MODAL, {
      data: { multiple: false, pickableFilter: (item) => !item.isFolder && !item.noAccess },
    }).catch(() => undefined);
    const unique = picked?.selection?.[0];
    if (!unique) return { status: 'cancelled' };

    const { data } = await new UmbMediaDetailRepository(host).requestByUnique(unique);
    const name = data?.variants[0]?.name;
    const value = data?.values.find((candidate) => candidate.alias === 'umbracoFile')?.value as
      | { src?: string }
      | undefined;
    if (!data || !value?.src) return { status: 'failed', name };

    try {
      const response = await fetch(value.src, { credentials: 'same-origin' });
      if (!response.ok) return { status: 'failed', name };
      return { status: 'opened', unique, name: name ?? '', blob: await response.blob(), extension: extensionOf(value.src) };
    } catch {
      return { status: 'failed', name };
    }
  };
}
