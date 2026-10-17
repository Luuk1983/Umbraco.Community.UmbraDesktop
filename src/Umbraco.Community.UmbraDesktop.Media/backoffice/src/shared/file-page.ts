/*
 * The Image Editor's line to Services.Media's File page, `<umbradesktop-media-file-page>`. The
 * types below are **copies** of the service's (`file-page/types.ts` there), as its developer page
 * publishes them, because nothing is imported from another package: the element is reached by its
 * tag, and these say what it takes and fires.
 */

/** The File page's tag. */
export const FILE_PAGE_TAG = 'umbradesktop-media-file-page';

/** The File page's pages. */
export type FilePageName = 'open' | 'save' | 'saveAs' | 'info';

/** A format the File page saves in. */
export type SaveFormat = 'jpeg' | 'png' | 'webp';

/** What the editor has open, as the File page shows and saves it. */
export interface FilePageDocument {
  /** The media item, or null when never saved. */
  unique: string | null;
  /** The name the person typed, which a save renames the item to. */
  name: string;
  /** Its folder, or null for the root. */
  folder: string | null;
  /** Its folder's name. */
  folderName?: string;
  /** When the item was last changed as far as the editor knows. */
  updateDate?: string | null;
  /** The item's file extension now. */
  extension: string;
  /** Width as it will be saved. */
  width: number;
  /** Height as it will be saved. */
  height: number;
  /** The item's file size now. */
  bytes: number;
  /** The file's own name, which a replace keeps. */
  fileName?: string;
}

/** Encode the editor's document in a format. */
export type FileEncoder = (format: SaveFormat, quality: number) => Promise<Blob>;

/** What a save wrote. */
export interface FileSavedDetail {
  /** The item written. */
  unique: string;
  /** Its update date now. */
  updateDate?: string | null;
  /** Its name. */
  name: string;
  /** Its extension now. */
  extension: string;
  /** Its folder. */
  folder: string | null;
  /** Its folder's name. */
  folderName?: string;
  /** Whether it is a copy, which the editor is now on. */
  copy: boolean;
  /** Its size now, in bytes. */
  bytes: number;
  /** Its file's name now. */
  fileName: string;
}

/** How `save()` went. */
export type FileSaveOutcome =
  | { status: 'saved'; saved: FileSavedDetail }
  | { status: 'needs-save-as' }
  | { status: 'cancelled' }
  | { status: 'failed'; message?: string };

/** The File page element, as far as the editor drives it. */
export interface FilePageElement extends HTMLElement {
  /** What is open. */
  document: FilePageDocument | null;
  /** Whether there is unsaved work. */
  dirty: boolean;
  /** The extensions the editor opens. */
  accept: string[];
  /** How the editor encodes its document. */
  encode?: FileEncoder;
  /** The picture as it will be saved. */
  preview?: string;
  /** Whether the next save resets the focal point and named crops. */
  resetFocalPoint: boolean;
  /** Whether it shows. */
  open: boolean;
  /** Show it on a page. */
  show(page: FilePageName, options?: { format?: SaveFormat }): void;
  /** Hide it. */
  hide(): void;
  /** Save as the Save button does. */
  save(): Promise<FileSaveOutcome>;
}

/**
 * How long the editor waits for the File page's tag to be defined: Services.Media's bundle defines
 * it with its context, which may load a moment after the editor does. Short, because without the
 * service the wait is all the person gets, the figure Accessories waits for the service itself.
 */
export const FILE_PAGE_WAIT_MS = 500;

/**
 * Whether the File page can be used: true once its tag is defined, false if it is not within the
 * wait. A broken install, or a Services.Media that failed to load, is said in words rather than
 * thrown.
 * @param waitMs How long to wait.
 * @returns True when the tag is defined.
 */
export async function whenFilePage(waitMs: number = FILE_PAGE_WAIT_MS): Promise<boolean> {
  if (customElements.get(FILE_PAGE_TAG)) return true;
  return Promise.race([
    customElements.whenDefined(FILE_PAGE_TAG).then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), waitMs)),
  ]);
}
