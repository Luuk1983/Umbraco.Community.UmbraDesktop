import type { OpenedMedia } from '../files/media-open.js';

/*
 * The File page's published types: what an app gives the `<umbradesktop-media-file-page>` element
 * and what it hears back. Plain data, copied verbatim onto the developer page
 * (`docs/developer/opening-and-saving-media.md`), so an app in another package declares them and
 * imports nothing. Each only ever gains optional fields. Issue #136, design §5.1.
 */

/** The File page's pages, by name: what `show()` takes. Close is a command, not a page. */
export type FilePageName = 'open' | 'save' | 'saveAs' | 'info';

/** A format a canvas can write, which is what the File page offers to save in. */
export type SaveFormat = 'jpeg' | 'png' | 'webp';

/** What the app has open, as the File page shows and saves it. */
export interface FilePageDocument {
  /** The media item it came from or was last saved as, or null when it was never saved. */
  unique: string | null;
  /** Its name as the person typed it, which a save renames the item to. */
  name: string;
  /** The folder it is in, or null for the media library root. */
  folder: string | null;
  /** The folder's name, for Info and Save as. */
  folderName?: string;
  /** When the item was last changed as far as the app knows, which a save checks. */
  updateDate?: string | null;
  /** The item's file extension now, without the dot. */
  extension: string;
  /** The picture's width as it will be saved, in pixels. */
  width: number;
  /** The picture's height as it will be saved, in pixels. */
  height: number;
  /** The item's file size now, in bytes. */
  bytes: number;
  /**
   * The file's own name in the media library, with its extension. A replace keeps it, changing only
   * the extension for a new format, so the file's address stays the same; without it the file is
   * named after the item.
   */
  fileName?: string;
}

/**
 * Encode the app's document in a format, for Save as's After size and for every save.
 * @param format The format.
 * @param quality 1 to 100, for JPEG and WebP; PNG ignores it.
 * @returns The encoded file.
 */
export type FileEncoder = (format: SaveFormat, quality: number) => Promise<Blob>;

/** What a save wrote, for the app to take as its document's new facts. */
export interface FileSavedDetail {
  /** The media item written: the same one for a replace, a new one for a copy. */
  unique: string;
  /** Its update date now, for the next save's check. */
  updateDate?: string | null;
  /** Its name. */
  name: string;
  /** Its file extension now, which a format change changes. */
  extension: string;
  /** Its folder. */
  folder: string | null;
  /** Its folder's name, when known. */
  folderName?: string;
  /** Whether it is a copy: the app is now editing the copy, and the next save writes to it. */
  copy: boolean;
  /** The saved file's size, in bytes: the item's size now. */
  bytes: number;
  /** The saved file's name, for the next save to keep. */
  fileName: string;
}

/** How `save()` went. */
export type FileSaveOutcome =
  | { status: 'saved'; saved: FileSavedDetail }
  /** The item's format cannot be kept, so Save as was shown with PNG chosen instead. */
  | { status: 'needs-save-as' }
  | { status: 'cancelled' }
  | { status: 'failed'; message?: string };

/** The event a File page fires when the person chose a file to open, with the file. */
export type FileOpenEvent = CustomEvent<OpenedMedia>;
