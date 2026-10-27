import type { UmbFileDropzoneDroppedItems } from '@umbraco-cms/backoffice/dropzone';

/**
 * Files and folders dropped from the OS, read into the shape core's media upload takes (design §6,
 * plan task 6.6): files at the top, and each folder with its own files and folders, so core creates
 * the folders first and what is in them keeps its place.
 *
 * For a drop the manager takes itself: onto a folder card or a tree folder, and, in a window that
 * checks its uploads against the media guidelines (#179), onto the window's own folder area too, which
 * core's dropzone would otherwise read itself.
 */

/** A dropped file or folder, as the browser's file system entry; a test hands in its own. */
export interface UmbraDesktopEntry {
  /** Its name. */
  name: string;
  /** Whether it is a file. */
  isFile: boolean;
  /** Whether it is a folder. */
  isDirectory: boolean;
  /**
   * A file's content.
   * @param resolve Called with the file.
   * @param reject Called when it cannot be read.
   */
  file?(resolve: (file: File) => void, reject?: (error: unknown) => void): void;
  /** A folder's reader. */
  createReader?(): {
    /**
     * The next batch of what is in the folder; an empty batch means there is no more.
     * @param resolve Called with the batch.
     * @param reject Called when it cannot be read.
     */
    readEntries(resolve: (batch: UmbraDesktopEntry[]) => void, reject?: (error: unknown) => void): void;
  };
}

/** A folder in core's upload shape. */
type UmbraDesktopDroppedFolder = UmbFileDropzoneDroppedItems['folders'][number];

/**
 * Take what a drop carries while the drop is being sent, since the browser empties it after, and read
 * it later.
 * @param data The drop's data.
 * @returns A function that reads it.
 */
export function takeDropped(data: DataTransfer): () => Promise<UmbFileDropzoneDroppedItems> {
  const entries = [...data.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.() as UmbraDesktopEntry | null | undefined)
    .filter((entry): entry is UmbraDesktopEntry => !!entry);
  if (entries.length) return () => readEntries(entries);
  // No entries (a drop made in a script, or a browser without them): the files themselves.
  const files = [...data.files];
  return async () => ({ files, folders: [] });
}

/**
 * Read dropped entries.
 * @param entries The entries.
 * @returns The files and folders, with their structure.
 */
export async function readEntries(entries: ReadonlyArray<UmbraDesktopEntry>): Promise<UmbFileDropzoneDroppedItems> {
  const files: File[] = [];
  const folders: UmbraDesktopDroppedFolder[] = [];
  for (const entry of entries) {
    if (entry.isFile && entry.file) files.push(await new Promise<File>((resolve, reject) => entry.file!(resolve, reject)));
    else if (entry.isDirectory) folders.push(await readFolder(entry));
  }
  return { files, folders };
}

/**
 * Read one dropped folder, and everything in it. The browser hands over what is in a folder in
 * batches (a hundred at a time in Chrome), so it is read until a batch comes back empty.
 * @param entry The folder.
 * @returns It, in core's shape.
 */
async function readFolder(entry: UmbraDesktopEntry): Promise<UmbraDesktopDroppedFolder> {
  const reader = entry.createReader?.();
  const children: UmbraDesktopEntry[] = [];
  for (let batch: UmbraDesktopEntry[] = []; reader; ) {
    batch = await new Promise<UmbraDesktopEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  const { files, folders } = await readEntries(children);
  return { folderName: entry.name, files, folders };
}
