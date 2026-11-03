import { MEDIA_KEY } from '../manager/location.js';

/**
 * Where the Media Cleanup window opens when another app sends it somewhere (design §16.20): the list
 * for one folder and everything under it, or for the whole library. The Media Manager's cleanup line
 * is the one sender.
 *
 * The format is this package's own, as the Manager's location is: `folder=<key>`, or `folder=root`
 * for the library. The window reads it once and then clears it, since a list is somewhere it was sent,
 * not where it lives: after a reload it opens on the overview again.
 */

/**
 * The event an open Media Cleanup window listens for on the document, with `{ location }`. The window
 * allows one instance, so the desktop only brings an open one forward and never hands it a new
 * location; both live in the same page, which is what makes a document event enough.
 */
export const UMBRADESKTOP_MEDIA_CLEANUP_SHOW_EVENT = 'umbradesktop-media-cleanup-show';

/** Which list to open: a folder's, or the whole library's (null). */
export interface HealthLocation {
  /** The folder's key, or null for the library. */
  folderKey: string | null;
}

/**
 * Read a location.
 * @param value The string the desktop or the event handed over, if any.
 * @returns The list to open, or undefined for none.
 */
export function parseHealthLocation(value: string | undefined): HealthLocation | undefined {
  const folder = new URLSearchParams(value ?? '').get('folder');
  if (folder === 'root') return { folderKey: null };
  return folder && MEDIA_KEY.test(folder) ? { folderKey: folder } : undefined;
}

/**
 * Write a location.
 * @param folderKey The folder's key, or null for the library.
 * @returns The location string.
 */
export function printHealthLocation(folderKey: string | null): string {
  return new URLSearchParams({ folder: folderKey ?? 'root' }).toString();
}

/**
 * Tell an open Media Cleanup window to show a folder's list. Harmless when none is open: the caller
 * opens the app with the same location as well, which a new window reads.
 * @param folderKey The folder's key, or null for the library.
 */
export function showInMediaCleanup(folderKey: string | null): void {
  document.dispatchEvent(new CustomEvent(UMBRADESKTOP_MEDIA_CLEANUP_SHOW_EVENT, { detail: { location: printHealthLocation(folderKey) } }));
}
