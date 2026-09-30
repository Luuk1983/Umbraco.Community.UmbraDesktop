import type { Rect, UmbraDesktopApp, UmbraDesktopWindow, UmbraDesktopWindowState } from '../types';

/**
 * The window layout a desktop reopens with: what is kept of each open window, and how a stored
 * copy is read back. Pure, so the whole round trip is tested without a desktop.
 *
 * Kept in the browser's localStorage (see `layout-persistence.ts`), which means it outlives the code
 * that wrote it and can be edited by hand in the browser's tools. So nothing read back is trusted:
 * every field is checked, and an entry that fails is dropped rather than half-used. A layout that cannot be read
 * at all is an empty one, which is the same desktop the user had before this feature existed.
 */

/** One window as it is kept between visits. */
export interface UmbraDesktopSavedWindow {
  /** The app's alias, resolved against the apps this user may open when the layout is restored. */
  app: string;
  /** Its rectangle when in the normal state. */
  rect: Rect;
  /** Normal, minimized or maximized. */
  state: UmbraDesktopWindowState;
  /** Its stacking order; only the order between windows matters, not the numbers. */
  z: number;
  /** Whether it was the active window. */
  active: boolean;
  /** The half of the desktop it was snapped to, if any. */
  snapped?: 'left' | 'right';
  /** The rectangle a snapped window goes back to when it is dragged off. */
  restoreRect?: Rect;
  /**
   * The page a backoffice window was showing, as a path on this site with its query and hash, so it
   * reopens where the editor was rather than at the section's start page. Absent for an app.
   */
  location?: string;
}

/** A whole layout. Versioned, so a later shape can be told apart and read as empty. */
export interface UmbraDesktopWindowLayout {
  version: 1;
  windows: UmbraDesktopSavedWindow[];
}

/** The layout of a desktop with nothing open, and of anything that cannot be read. */
const EMPTY: UmbraDesktopWindowLayout = { version: 1, windows: [] };

/**
 * What to keep of the windows open now.
 *
 * Floating attached windows are left out, and so are the panes attached inside a window: both
 * belong to an owner by its window id, which is minted fresh when a window opens and so does not
 * survive a reload. Restoring them means mapping owners across, which a later version can add.
 * @param windows The open windows.
 * @returns The layout to store.
 */
export function snapshotLayout(windows: ReadonlyArray<UmbraDesktopWindow>): UmbraDesktopWindowLayout {
  return {
    version: 1,
    windows: windows
      .filter((w) => !w.owner)
      .map((w) => {
        const saved: UmbraDesktopSavedWindow = {
          app: w.app.alias,
          rect: { ...w.rect },
          state: w.state,
          z: w.z,
          active: w.active,
        };
        if (w.snapped) saved.snapped = w.snapped;
        if (w.restoreRect) saved.restoreRect = { ...w.restoreRect };
        if (w.app.content.kind === 'iframe' && w.location) saved.location = w.location;
        return saved;
      }),
  };
}

/**
 * The layout as it is stored.
 * @param layout The layout.
 * @returns Its JSON.
 */
export function serialiseLayout(layout: UmbraDesktopWindowLayout): string {
  return JSON.stringify(layout);
}

/**
 * A stored layout, read defensively. Nothing, junk, or a version this code does not know reads as
 * an empty layout; an entry that fails any check is dropped and the rest are kept.
 * @param raw The stored value.
 * @returns The layout.
 */
export function parseLayout(raw: string | null | undefined): UmbraDesktopWindowLayout {
  if (!raw) return { ...EMPTY, windows: [] };
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ...EMPTY, windows: [] };
  }
  if (!isRecord(payload) || payload.version !== 1 || !Array.isArray(payload.windows)) return { ...EMPTY, windows: [] };
  return { version: 1, windows: payload.windows.map(savedWindow).filter((w): w is UmbraDesktopSavedWindow => !!w) };
}

/**
 * The address a restored window's frame opens at: the page it was showing, when that page is still
 * inside the backoffice, or the app's own address otherwise.
 *
 * Checked again here, beside the check on reading, because this is the one value that decides where
 * a frame navigates: the stored page must be a path on this site whose first segment is the app's
 * own (`/umbraco/...`), so a stored value can never point a window at another site or outside the
 * backoffice.
 * @param app The app being restored.
 * @param location The page it was showing, if one was stored.
 * @returns The address for its frame, or undefined for an app, which has no address.
 */
export function restoredUrl(app: UmbraDesktopApp, location: string | undefined): string | undefined {
  if (app.content.kind !== 'iframe') return undefined;
  const own = app.content.url;
  if (!location || !isSitePath(location)) return own;
  const root = (path: string) => path.split(/[/?#]/).filter(Boolean)[0];
  return root(location) === root(own) ? location : own;
}

/**
 * One stored window, or undefined when any part of it cannot be trusted.
 * @param value A stored entry.
 * @returns The window, or undefined.
 */
function savedWindow(value: unknown): UmbraDesktopSavedWindow | undefined {
  if (!isRecord(value)) return undefined;
  const { app, rect, state, z, active, snapped, restoreRect, location } = value;
  if (typeof app !== 'string' || !app) return undefined;
  if (!isRect(rect)) return undefined;
  if (state !== 'normal' && state !== 'minimized' && state !== 'maximized') return undefined;
  if (typeof z !== 'number' || !Number.isFinite(z)) return undefined;
  if (typeof active !== 'boolean') return undefined;
  if (snapped !== undefined && snapped !== 'left' && snapped !== 'right') return undefined;
  if (restoreRect !== undefined && !isRect(restoreRect)) return undefined;
  const saved: UmbraDesktopSavedWindow = { app, rect: { ...rect }, state, z, active };
  if (snapped) saved.snapped = snapped;
  if (restoreRect) saved.restoreRect = { ...(restoreRect as Rect) };
  // A bad page is dropped on its own rather than taking the window with it: the window can still
  // reopen, at its app's start page.
  if (typeof location === 'string' && isSitePath(location)) saved.location = location;
  return saved;
}

/**
 * Whether a value is a plain object.
 * @param value Anything.
 * @returns True for an object that is not an array.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether a value is a usable rectangle: finite numbers, with a size above zero.
 * @param value Anything.
 * @returns True for a rectangle.
 */
function isRect(value: unknown): value is Rect {
  if (!isRecord(value)) return false;
  const { x, y, w, h } = value;
  return [x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n)) && (w as number) > 0 && (h as number) > 0;
}

/**
 * Whether a string is a path on this site: it starts with one slash, not two (which would name
 * another host), and carries no scheme.
 * @param value The stored page.
 * @returns True for a same-site path.
 */
function isSitePath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}
