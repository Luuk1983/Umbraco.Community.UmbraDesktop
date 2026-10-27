/**
 * Asking a question in a dialog over a desktop window (#179): the desktop's contract, copied here
 * because an add-on never imports the desktop (`docs/developer/desktop-apps.md`). The dialog is a
 * window of the desktop's own, drawn by its theme, that keeps the window it is over waiting until it
 * closes, as an OS's modal child window does.
 */

/** The event an app dispatches to open a dialog over its window. */
export const UMBRADESKTOP_OPEN_DIALOG_EVENT = 'umbradesktop-open-dialog';

/** The event a dialog's content dispatches to close its dialog, once it is answered. */
export const UMBRADESKTOP_CLOSE_DIALOG_EVENT = 'umbradesktop-close-dialog';

/**
 * Ask the desktop for a dialog over the window `from` is in.
 * @param from An element inside the app, which the event bubbles from.
 * @param detail The dialog: its title, icon, content, the props set on its content, and its size.
 * @returns Whether the desktop opened it. It says so by cancelling the event, so an app outside the
 *   desktop, or one whose window already has a dialog open, can tell and do without.
 */
export function openDesktopDialog(from: HTMLElement, detail: UmbraDesktopOpenDialogDetail): boolean {
  const event = new CustomEvent<UmbraDesktopOpenDialogDetail>(UMBRADESKTOP_OPEN_DIALOG_EVENT, {
    detail,
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  from.dispatchEvent(event);
  return event.defaultPrevented;
}
