/**
 * Where a manager window is, as the one string the desktop stores for an app window.
 *
 * The desktop keeps an app's location and hands it back when the window reopens after a reload, or
 * when another feature opens the app there ("Open in new window"). It never reads it, so the format
 * is this package's own: `folder=<key>&view=<collection view alias>`, with `root` and `bin` for the
 * two places that are not folders. It outlives the code that wrote it, so everything read back is
 * checked and anything unusable reads as Media, which is where a fresh window starts.
 */

/** A place a manager window can show. */
export type UmbraDesktopMediaPlace =
  | { kind: 'root' }
  | { kind: 'folder'; unique: string }
  | { kind: 'bin' };

/** A window's place and, when it chose one, its collection view. */
export interface UmbraDesktopMediaLocation {
  /** The folder, Media itself, or the recycle bin. */
  place: UmbraDesktopMediaPlace;
  /** The collection view's alias; absent for core's default. */
  view?: string;
}

/** A media key as the management API writes it. */
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An extension alias: dotted words, nothing that could be markup. */
const ALIAS = /^[A-Za-z0-9_.-]{1,200}$/;

/**
 * Read a stored location.
 * @param value The string the desktop handed back, if any.
 * @returns The place and view, Media for anything unusable.
 */
export function parseLocation(value: string | undefined): UmbraDesktopMediaLocation {
  const params = new URLSearchParams(value ?? '');
  const folder = params.get('folder');
  const view = params.get('view');
  const place: UmbraDesktopMediaPlace =
    folder === 'bin' ? { kind: 'bin' } : folder && KEY.test(folder) ? { kind: 'folder', unique: folder } : { kind: 'root' };
  return view && ALIAS.test(view) ? { place, view } : { place };
}

/**
 * Write a location for the desktop to keep.
 * @param place The place the window shows.
 * @param view The collection view, when the window chose one.
 * @returns The location string.
 */
export function printLocation(place: UmbraDesktopMediaPlace, view?: string): string {
  const params = new URLSearchParams();
  params.set('folder', place.kind === 'folder' ? place.unique : place.kind);
  if (view) params.set('view', view);
  return params.toString();
}

/**
 * Whether two places are the same one.
 * @param a One place.
 * @param b The other.
 * @returns True when they are.
 */
export function samePlace(a: UmbraDesktopMediaPlace, b: UmbraDesktopMediaPlace): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'folder' || a.unique === (b as { unique: string }).unique;
}
