import type { OpenedMedia } from '../files/media-open.js';

/*
 * The file menu's published types: what an app gives the `<umbradesktop-media-file-menu>` element
 * (and the `<umbradesktop-media-open-view>` beside it) and what it hears back. Plain data, copied verbatim onto the developer page
 * (`docs/developer/opening-and-saving-media.md`), so an app in another package declares them and
 * imports nothing. Each only ever gains optional fields. Issue #136, design §5.1 and §14.
 */

/**
 * What `show()` takes: the menu itself, or one of the panels that slide in over it. Save and Close
 * are commands, not panels.
 */
export type FileMenuPanel = 'menu' | 'open' | 'saveAs' | 'info';

/** A format a canvas can write, which is what the file menu offers to save in. */
export type SaveFormat = 'jpeg' | 'png' | 'webp';

/** What the app has open, as the file menu shows and saves it. */
export interface FileMenuDocument {
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
   * The file's own name in the media library, with its extension. A replace writes it again with a
   * hash of the new contents, so a changed file gets a new address (#137); without it the file is
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
  /**
   * For a copy: true when it kept the original's media type and properties, false when the original
   * was gone and it is a plain new item, so an app drops what that item does not have. Issue #137.
   */
  fullCopy?: boolean;
  /** Something the person should know, shown where you would say "Saved"; see `MediaSaveResult`. */
  notice?: string;
  /** The saved file's size, in bytes: the item's size now. */
  bytes: number;
  /** The saved file's name, for the next save to keep. */
  fileName: string;
}

/** How `save()` went. */
export type FileSaveOutcome =
  | { status: 'saved'; saved: FileSavedDetail }
  /** The item's format cannot be kept, so the menu was shown on Save as with PNG chosen instead. */
  | { status: 'needs-save-as' }
  | { status: 'cancelled' }
  | { status: 'failed'; message?: string };

/** The event the file menu or the open view fires when the person chose a file to open, with the file. */
export type FileOpenEvent = CustomEvent<OpenedMedia>;
