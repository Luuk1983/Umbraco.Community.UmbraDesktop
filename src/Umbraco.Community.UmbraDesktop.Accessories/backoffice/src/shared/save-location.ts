import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_MEDIA_TREE_PICKER_MODAL } from '@umbraco-cms/backoffice/media';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';

/**
 * Save As for Notepad and Paint: where in the media library a new file goes, asked the first time it
 * is saved, as Windows' Notepad and Paint asked.
 *
 * Asking replaced a "save new files to" folder in Desktop settings. A setting had to exist for the
 * editors a media start node keeps out of the root, who could not save anywhere without one, and it
 * was a setting almost nobody would find before their first save failed. Umbraco's own folder picker
 * shows each person exactly the folders they may use, so asking covers them with no setting at all.
 */

/** Where Save As was told to put a new file. */
export type SaveFolderChoice =
  | {
      status: 'chosen';
      /** The folder's key, or null for the media library root. */
      folder: string | null;
    }
  | { status: 'cancelled' };

/** Asks where a new file goes. */
export type SaveFolderPicker = () => Promise<SaveFolderChoice>;

/** The folder chosen last, so the next Save As opens on it. Undefined until something is chosen. */
export interface SaveFolderMemory {
  /** The folder's key, or null for the root. */
  last?: string | null;
}

/**
 * Remembered for the backoffice session and shared by every Notepad and Paint window, as Windows
 * remembered the last folder a Save As used. Not stored: a folder remembered across sessions can
 * have been deleted or moved in between, and the root is a fine place to start.
 */
const SESSION_MEMORY: SaveFolderMemory = {};

/** What the picker needs beyond its host. Injected, so a test can answer the dialog. */
export interface SaveFolderPickerOptions {
  /** Where the last choice is kept. The session's own unless a test says otherwise. */
  memory?: SaveFolderMemory;
  /**
   * Show the dialog, opened on `preselected`, and resolve to what was chosen, or undefined if it
   * was closed. Umbraco's media tree picker unless a test says otherwise.
   */
  open?: (preselected: Array<string | null>) => Promise<Array<string | null> | undefined>;
}

/** A media tree item, as far as {@link isSaveFolder} reads it. */
export interface SaveFolderCandidate {
  /** The item's key; null for the tree's root. */
  unique: string | null;
  /** Whether it already has children. */
  hasChildren?: boolean;
  /** Its media type, whose collection marks a container. */
  mediaType?: { collection?: unknown };
}

/**
 * Whether a file can be saved into this item of the media tree: the root, or a folder.
 *
 * **The picker lists files as well, whatever `foldersOnly` says, and Umbraco sets `isFolder` on no
 * media item**, the built-in Folder included; both found by running it. What does mark a container
 * is a media type with a collection, which the built-in Folder and every list-view type have, or
 * children already under it. A custom container type with neither is not offered, which is the safe
 * way round: offering a file would only have the save refused.
 * @param item The tree item.
 * @returns True if it may be picked.
 */
export function isSaveFolder(item: SaveFolderCandidate): boolean {
  return item.unique === null || item.hasChildren === true || !!item.mediaType?.collection;
}

/**
 * Save As over Umbraco's media tree picker.
 *
 * One folder, **with the root showing and selectable**, and only folders pickable ({@link isSaveFolder}): the tree's root is an entry of
 * its own whose key is null, and it is selected when the dialog opens on a first save, so choosing at
 * once saves to the root, which is where a new file went before anyone was asked. An editor with a
 * media start node sees their own folders rather than the root, and picks one of those.
 *
 * Closing the dialog, or choosing nothing, cancels: the save does not happen and the work stays
 * unsaved, as cancelling Save As always did.
 * @param host The element asking, which the dialog belongs to.
 * @param options What a test injects.
 * @returns The picker.
 */
export function createSaveFolderPicker(host: UmbControllerHost, options: SaveFolderPickerOptions = {}): SaveFolderPicker {
  const memory = options.memory ?? SESSION_MEMORY;
  const open =
    options.open ??
    (async (preselected: Array<string | null>) => {
      const value = await umbOpenModal(host, UMB_MEDIA_TREE_PICKER_MODAL, {
        data: {
          multiple: false,
          foldersOnly: true,
          hideTreeRoot: false,
          expandTreeRoot: true,
          pickableFilter: (item) => isSaveFolder(item as SaveFolderCandidate),
        },
        value: { selection: preselected },
      }).catch(() => undefined);
      return value?.selection;
    });
  return async () => {
    const selection = await open([memory.last === undefined ? null : memory.last]);
    if (!selection?.length) return { status: 'cancelled' };
    memory.last = selection[0];
    return { status: 'chosen', folder: selection[0] };
  };
}
