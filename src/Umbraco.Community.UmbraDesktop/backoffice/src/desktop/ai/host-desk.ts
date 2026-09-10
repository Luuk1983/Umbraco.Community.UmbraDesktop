import type { DeskView } from './desk-snapshot';
import type { UmbraDesktopApp } from '../types';
import { findHostDesktopContext } from '../host-desktop';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../app-catalogue.context-token';

/**
 * Assembles the desktop both desk tools work against, from inside the chat's frame.
 *
 * It exists so "what is a desk" is decided once. The answer spans two of the desktop's contexts —
 * the window manager for what is open, the app catalogue for what could be — and a tool that
 * reached for them itself would be a second place to keep that pairing right.
 */

/** The desktop a desk tool found, or nothing when the chat is not on one. */
export interface HostDesk {
  /** Reading it: what is open, what each window shows, what could be opened. */
  view: DeskView;
  /**
   * Put an app on the desk.
   * @param app The app to open.
   */
  open(app: UmbraDesktopApp): void;
  /**
   * Raise a window that is already there.
   * @param id The window.
   */
  focus(id: string): void;
  /**
   * Close a window, unconditionally.
   * @param id The window.
   */
  close(id: string): void;
  /**
   * The window this chat is itself running in, when it could be worked out.
   *
   * Undefined only when the frame is not inside a desktop window element, which today means it is
   * not on a desktop at all. The close tool needs it because closing the chat from inside the call
   * that asked for it is the one outcome nobody can have meant.
   */
  selfWindowId?: string;
}

/**
 * The id of the desktop window a frame is running in.
 *
 * Walks out of the frame rather than being told: the `<iframe>`'s root node is the window element's
 * shadow root, and that element carries the window it is rendering. Reaching into our own element's
 * property is a smaller coupling than a new window-manager API that exists only for this.
 * @param view The frame's window.
 * @returns The window id, or undefined when this frame is not in a desktop window.
 */
function selfWindowIdOf(view: Window): string | undefined {
  let frame: Element | null;
  try {
    frame = view.frameElement;
  } catch {
    return undefined;
  }
  const root = frame?.getRootNode();
  const host = (root as ShadowRoot | undefined)?.host as
    | (Element & { window?: { id?: string } })
    | undefined;
  return host?.window?.id;
}

/**
 * The desktop hosting this chat, or `undefined` when there is not one.
 *
 * Asked per tool call rather than held, because an api instance is cached for the life of the
 * chat's tool manager while the desktop above it is not: the user can leave the desktop section and
 * come back, and a desktop captured at construction would then be one nobody can see.
 * @param view The window to ask from; defaults to the calling realm's own.
 * @returns The desktop, or `undefined`.
 */
export function findHostDesk(view: Window = window): HostDesk | undefined {
  const manager = findHostDesktopContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, view);
  if (!manager) return undefined;
  // The catalogue is provided by the same element as the manager, so in practice it resolves
  // whenever the manager does. Defaulted to empty anyway: an app list we could not read should
  // read as "no apps to offer" rather than take the whole tool down.
  const catalogue = findHostDesktopContext(UMBRADESKTOP_APP_CATALOGUE_CONTEXT, view);
  return {
    view: {
      getWindows: () => manager.getWindows(),
      subjectsOf: (id) => manager.subjectsOf(id),
      getApps: () => catalogue?.getApps() ?? [],
    },
    open: (app) => manager.open(app),
    focus: (id) => manager.focus(id),
    // `close`, not `requestClose`: the planner has already ruled out every window holding unsaved
    // changes, so there is nothing left for the guard dialog to protect and raising one would ask
    // the user a question about work that does not exist.
    close: (id) => manager.close(id),
    selfWindowId: selfWindowIdOf(view),
  };
}
