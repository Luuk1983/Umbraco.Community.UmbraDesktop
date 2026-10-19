/**
 * Keeps core's own navigation inside a manager window from moving the desktop (#144, design §8).
 *
 * The link rule (`link-rule.ts`) catches every link click inside a window. Some of core's dialogs do
 * not use a link: Create from a card's or tree item's menu opens core's "Create an item under" dialog
 * on the desktop page, and that dialog calls `history.pushState` itself, which would take the whole
 * backoffice off the desktop to the Media section (measured on 17.7). The backoffice's router announces
 * every push first with a cancelable `willchangestate` carrying the address, so the guard cancels a push
 * a manager window takes over and the window opens that page beside itself instead.
 *
 * The window is the one the person last pressed in, because the dialog sits on the desktop page outside
 * every window, and it was opened from a menu in that window.
 */

/** A manager window, as the guard sees it. */
export interface UmbraDesktopMediaRouteTaker extends Element {
  /**
   * Take a page the desktop page was about to navigate to, if it is one the window opens itself.
   * @param url The address being pushed, as core wrote it.
   * @returns True when the window took it, which cancels the push.
   */
  takeRoute(url: string): boolean;
}

/** The manager windows open now. */
const windows = new Set<UmbraDesktopMediaRouteTaker>();

/** The window last pressed in. */
let active: UmbraDesktopMediaRouteTaker | undefined;

/**
 * Hand a push to the window last worked in, and cancel it when that window takes it.
 * @param event The router's announcement.
 */
function onWillChangeState(event: Event): void {
  const url = (event as CustomEvent<{ url?: unknown }>).detail?.url;
  if (typeof url !== 'string' || !active || !windows.has(active)) return;
  if (active.takeRoute(url)) event.preventDefault();
}

/**
 * Guard the desktop page for a manager window while it is open. One listener for all of them.
 * @param manager The window.
 * @returns Stops guarding for it.
 */
export function guardRoutes(manager: UmbraDesktopMediaRouteTaker): () => void {
  if (windows.size === 0) window.addEventListener('willchangestate', onWillChangeState);
  windows.add(manager);
  return () => {
    windows.delete(manager);
    if (active === manager) active = undefined;
    if (windows.size === 0) window.removeEventListener('willchangestate', onWillChangeState);
  };
}

/**
 * Say that the person is working in a window, from a press inside it.
 * @param manager The window.
 */
export function markActive(manager: UmbraDesktopMediaRouteTaker): void {
  active = manager;
}
