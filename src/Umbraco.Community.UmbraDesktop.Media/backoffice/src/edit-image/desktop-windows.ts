import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { contextNow } from './context-now.js';

/** The part of the desktop's window manager Edit image uses: its published `openApp`. */
export interface UmbraDesktopWindows extends UmbContextMinimal {
  /**
   * Open an app by alias, or with `reuse`, bring forward its window already at that location.
   * @param alias The app's manifest alias.
   * @param options Where to open it, and whether a window already there is focused instead.
   * @returns Whether a window was opened or focused.
   */
  openApp(alias: string, options?: { location?: string; reuse?: boolean }): boolean;
}

/** The window manager, by the alias the desktop publishes (`desktop-contexts.md` §5). */
const UMBRADESKTOP_WINDOW_MANAGER = new UmbContextToken<UmbraDesktopWindows>('UmbraDesktopWindowManagerContext');

/**
 * The desktop's window manager, from wherever an entity action is, or `undefined` when there is no
 * desktop (design §4.2).
 *
 * Two places, asked in turn, both answered at once. **On the desktop page**, as a Media Manager
 * window's tree and collection are, the manager is a provider above the element. **Inside a backoffice
 * window**, as the Media section and the Manager's item pane are, the element is in the window's
 * frame, where the desktop cannot be seen; the frame's own `<iframe>` element is on the desktop page
 * though, so the request goes from there. Desktop-contexts §5 documents this second route; this is
 * the add-on's own copy of it, since nothing is imported between packages.
 * @param element Where the action is.
 * @returns The window manager, or undefined in the plain backoffice.
 */
export function findDesktopWindows(element: Element): UmbraDesktopWindows | undefined {
  return findOnDesktop(element, UMBRADESKTOP_WINDOW_MANAGER);
}

/**
 * Any context the desktop provides, from wherever an action is: the window manager for Edit image,
 * and the media service for Optimize images (#139), which the desktop hosts on the same element. The
 * same two places as {@link findDesktopWindows}, asked in turn.
 * @param element Where the action is.
 * @param token The context to find.
 * @returns The context, or undefined in the plain backoffice.
 */
export function findOnDesktop<T extends UmbContextMinimal>(element: Element, token: UmbContextToken<T>): T | undefined {
  const here = contextNow(element, token);
  if (here) return here;
  let frame: Element | null = null;
  try {
    frame = element.ownerDocument.defaultView?.frameElement ?? null;
  } catch {
    // A cross-origin parent: not a desktop window, and no frame element to reach.
    return undefined;
  }
  return frame ? contextNow(frame, token) : undefined;
}
