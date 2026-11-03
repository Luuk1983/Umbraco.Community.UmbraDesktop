import { findHostDesktopContext } from '../host-desktop.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';

/**
 * Where a session modal has opened, which decides what it shows (design §4).
 *
 * - `window`: inside a window's frame on a desktop. Shows nothing; the desktop locks instead.
 * - `desktop`: in a document showing a desktop. The lock screen.
 * - `elsewhere`: anywhere else, the classic backoffice above all. Core's own screens, untouched.
 */
export type UmbraDesktopSessionPlacement = 'window' | 'desktop' | 'elsewhere';

/**
 * The desktops shown right now, in this realm. A set rather than a flag, so a desktop torn down
 * while another is being built (a test, or Exit straight into a fresh desktop) cannot clear the
 * other's mark.
 */
const shown = new Set<Element>();

/**
 * Mark a desktop as shown, for as long as it is connected.
 *
 * Called by the desktop element itself rather than found by walking the page for it: the element is
 * buried in shadow roots under the section's route, and it is the one that knows when it comes and
 * goes. After Exit the same document is the classic backoffice, which must get core's screens back.
 * @param desktop The desktop element.
 * @returns A function that unmarks it, for the element's disconnect.
 */
export function desktopShown(desktop: Element): () => void {
  shown.add(desktop);
  return () => shown.delete(desktop);
}

/**
 * Where a session modal opened in `view` is.
 *
 * Decided when the modal renders, never when it is registered, because one document can be a
 * desktop now and the classic backoffice a moment later.
 * @param view The window the modal opened in; the calling realm's own by default.
 * @returns The placement.
 */
export function sessionPlacement(view: Window = window): UmbraDesktopSessionPlacement {
  // A window first: its frame never shows a desktop of its own, and the desktop above it does not
  // make it one.
  if (findHostDesktopContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, view)) return 'window';
  for (const desktop of shown) if (desktop.isConnected && desktop.ownerDocument === view.document) return 'desktop';
  return 'elsewhere';
}
