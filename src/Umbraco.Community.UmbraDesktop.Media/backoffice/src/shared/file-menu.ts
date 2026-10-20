/*
 * The Image Editor's line to Services.Media's file menu, `<umbradesktop-media-file-menu>`, and the
 * open view beside it, `<umbradesktop-media-open-view>`. The types below are **copies** of the
 * service's (`file-menu/types.ts` there), as its developer page publishes them, because nothing is
 * imported from another package: the elements are reached by their tags, and these say what they
 * take and fire.
 */

/** The file menu's tag. */
export const FILE_MENU_TAG = 'umbradesktop-media-file-menu';

/** The open view's tag. */
export const OPEN_VIEW_TAG = 'umbradesktop-media-open-view';

/** What `show()` takes: the menu itself, or a panel over it. */
export type FileMenuPanel = 'menu' | 'open' | 'saveAs' | 'info';

/** A format the file menu saves in. */
export type SaveFormat = 'jpeg' | 'png' | 'webp';

/** What the editor has open, as the file menu shows and saves it. */
export interface FileMenuDocument {
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
  /** For a copy: false when it is a plain new item without the original's properties (#137). */
  fullCopy?: boolean;
  /** Something to tell the person instead of "Saved", in the service's words (#137). */
  notice?: string;
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

/** The file menu element, as far as the editor drives it. */
export interface FileMenuElement extends HTMLElement {
  /** What is open. */
  document: FileMenuDocument | null;
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
  /** The editor's name: the menu's title, and what Close says it closes. */
  label?: string;
  /** Whether it shows. */
  open: boolean;
  /** Show the menu, or a panel over it. */
  show(panel?: FileMenuPanel, options?: { format?: SaveFormat }): void;
  /** Put it away. */
  hide(): void;
  /** Save as the Save button does. */
  save(): Promise<FileSaveOutcome>;
}

/** The open view element, as far as the editor drives it. */
export interface OpenViewElement extends HTMLElement {
  /** Whether there is unsaved work. */
  dirty: boolean;
  /** The extensions the editor opens. */
  accept: string[];
  /** The heading over it. */
  heading?: string;
}

/**
 * How long the editor waits for the file menu's tag to be defined: Services.Media's bundle defines
 * it with its context, which may load a moment after the editor does. Short, because without the
 * service the wait is all the person gets, the figure Accessories waits for the service itself.
 */
export const FILE_MENU_WAIT_MS = 500;

/**
 * Whether the file menu can be used: true once its tag is defined, false if it is not within the
 * wait. The open view is defined in the same module load, so one answers for both. A broken install,
 * or a Services.Media that failed to load, is said in words rather than thrown.
 * @param waitMs How long to wait.
 * @returns True when the tag is defined.
 */
export async function whenFileMenu(waitMs: number = FILE_MENU_WAIT_MS): Promise<boolean> {
  if (customElements.get(FILE_MENU_TAG)) return true;
  return Promise.race([
    customElements.whenDefined(FILE_MENU_TAG).then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), waitMs)),
  ]);
}
