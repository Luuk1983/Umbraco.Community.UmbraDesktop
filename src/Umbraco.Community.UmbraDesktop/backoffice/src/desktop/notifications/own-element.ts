import {
  UMBRADESKTOP_DESKTOP_SOURCE_ID,
  type UmbraDesktopNotification,
  type UmbraDesktopNotificationColor,
} from './types.js';

/**
 * A notification the desktop raised itself, drawn with its own element on the desktop's toast
 * (umbraCoffee design D15), and the contract that element gets.
 *
 * **The whole contract is `data` plus {@link UmbraDesktopNotificationLayoutHandler}.** The toast sets
 * both as properties on the element, the way Umbraco's `UmbNotificationHandler` sets them on a
 * notification layout, and gives it nothing else: no `uui-toast-notification` around it, no
 * `open` or `autoClose`. A layout written against the handler's basics (`close()`, `onClose()`,
 * `key`, `color`, `duration`) works unchanged; one that reaches for anything more of core's handler
 * does not, and should not be raised on the desktop.
 */

/**
 * Whether the desktop draws a notification's own element on its toast, rather than headline and
 * message only.
 *
 * Only for a notification the desktop raised in its own document. Everything from a window stays
 * plain data, because a window's document can close and nothing on the desktop may hold on to it
 * (notifications design D5). The desktop's own document lives as long as the desktop, so that reason
 * does not apply to it, and drawing the element is what puts its buttons where they are seen.
 *
 * Any element, on purpose, not only a package's. Umbraco's own non-default layouts raised in the
 * desktop's document, `umb-peek-error-notification` with its error viewer button among them, are drawn
 * here too, themed and in the desktop's stack, instead of taking a click to be raised again as
 * Umbraco's own toast in Umbraco's position. They ask no more of the handler than the contract above.
 *
 * The element also has to be defined, or there is nothing to draw and the plain toast is the better
 * one. One question for both the toast stack, which draws the element, and the centre, which on a
 * click shows such a notification again as a desktop toast instead of raising it in the document:
 * if they asked it differently, a click could bring back a toast that draws nothing it did not
 * already.
 * @param sourceId Where the notification came from.
 * @param notification The notification.
 * @returns True when a desktop toast draws the notification's element.
 */
export function drawsOwnElement(sourceId: string, notification: UmbraDesktopNotification): boolean {
  const spec = notification.element;
  return sourceId === UMBRADESKTOP_DESKTOP_SOURCE_ID && !!spec && customElements.get(spec.name) !== undefined;
}

/**
 * What a desktop toast hands its element as `notificationHandler`: the part of Umbraco's
 * `UmbNotificationHandler` a notification layout actually uses.
 */
export interface UmbraDesktopNotificationLayoutHandler {
  /** The notification's key, as the document that raised it gave it. */
  readonly key: string;
  /** Its severity. */
  readonly color: UmbraDesktopNotificationColor;
  /** How long it stays in milliseconds, or null for until closed. */
  readonly duration: number | null;
  /** Take the toast down. */
  close(): void;
  /**
   * Settles once the toast is gone, however it went: this handler's `close()`, the cross, its timer,
   * Clear, or the desktop itself going away.
   * @returns A promise that resolves then.
   */
  onClose(): Promise<void>;
}

/**
 * Make the handler for one element, and the means to settle it.
 *
 * The three read-only fields are getters over whatever the toast carries now, so a repeat that
 * refreshes the toast in place is what the element sees, without a new handler it would have to
 * notice. They have no setters, so an element cannot change them.
 * @param current The notification the toast is showing now.
 * @param close What takes the toast down.
 * @returns The handler, and a function to call once the toast has gone, which settles `onClose()`.
 */
export function createNotificationLayoutHandler(
  current: () => UmbraDesktopNotification,
  close: () => void,
): { handler: UmbraDesktopNotificationLayoutHandler; settle: () => void } {
  let settle!: () => void;
  const closed = new Promise<void>((resolve) => (settle = resolve));
  const handler: UmbraDesktopNotificationLayoutHandler = {
    get key() {
      return current().key;
    },
    get color() {
      return current().color;
    },
    get duration() {
      return current().duration;
    },
    close,
    onClose: () => closed,
  };
  return { handler, settle };
}
