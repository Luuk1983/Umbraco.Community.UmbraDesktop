/**
 * The desktop's own shapes for a notification, as plain data.
 *
 * Plain, and never core's handler, on purpose. A handler closes over the realm of the frame that
 * raised it, and that frame's window can close; anything the desktop keeps past the moment a
 * notification arrives would then be holding a dead document. `dirty-watcher.ts` hit the same thing
 * with workspace contexts. Design: `docs/design/2026-09-27-desktop-notifications-design.md`.
 */

/**
 * A notification's severity, as its sender chose it.
 *
 * Core's colours, with its blank `''` read as the `'default'` it renders as, so there is one spelling
 * for "no particular severity" rather than two.
 */
export type UmbraDesktopNotificationColor = 'default' | 'positive' | 'warning' | 'danger';

/**
 * The element a notification was raised with, when it was not core's default layout, and the data
 * it was given. Kept so the notification can be raised again in its source window, where whatever
 * the element offers (core's error viewer, say) can be used.
 */
export interface UmbraDesktopNotificationElement {
  /** The custom element's tag name. */
  name: string;
  /** A copy of the data it was given, safe to store and to hand back. */
  data: unknown;
}

/** One notification, read off core's handler the moment it was raised. */
export interface UmbraDesktopNotification {
  /** The handler's key, unique within the document that raised it. */
  key: string;
  /** Its severity. */
  color: UmbraDesktopNotificationColor;
  /** How long it asked to stay on screen in milliseconds, or null for until closed. */
  duration: number | null;
  /** Its headline, when it has one. */
  headline?: string;
  /** Its text. Empty when the sender gave none. */
  message: string;
  /** The element it was raised with, when that was not core's default layout. */
  element?: UmbraDesktopNotificationElement;
}

/**
 * Who raised a notification: the window's id, or the desktop's own source id, plus the label to show.
 *
 * The label is stored as the app's name exactly as the catalogue has it, which may be a `#key`
 * localization reference, and localized when drawn. Localizing it on the way in would freeze it in
 * whichever language was active when the message arrived.
 */
export interface UmbraDesktopNotificationOrigin {
  /** The source's id: a window id, or {@link UMBRADESKTOP_DESKTOP_SOURCE_ID}. */
  sourceId: string;
  /** What to call the source, possibly a `#key` to localize. */
  source: string;
}

/** The source id the desktop itself raises under, as opposed to any window. */
export const UMBRADESKTOP_DESKTOP_SOURCE_ID = 'desktop';

/**
 * One line of the scrollback: a notification and every repeat of it folded into one.
 *
 * Repeats fold on {@link id}, which is severity, headline and text. Which window raised it is left
 * out deliberately, or the same message from five windows would be five entries; the entry instead
 * remembers whoever raised it last. Design §3.1.
 */
export interface UmbraDesktopScrollbackEntry extends UmbraDesktopNotificationOrigin {
  /** What makes two notifications the same one. */
  id: string;
  /** Its severity. */
  color: UmbraDesktopNotificationColor;
  /** Its headline, when it has one. */
  headline?: string;
  /** Its text. */
  message: string;
  /** How many times it has arrived. */
  count: number;
  /** When it last arrived, in epoch milliseconds. */
  lastSeen: number;
  /** The element it was raised with, so a click can raise it again. */
  element?: UmbraDesktopNotificationElement;
}

/** A toast on the desktop right now. */
export interface UmbraDesktopToast extends UmbraDesktopNotificationOrigin {
  /** The scrollback entry it belongs to, which is also what a repeat is matched on. */
  id: string;
  /** The notification as it last arrived. */
  notification: UmbraDesktopNotification;
  /** How many times it has arrived while showing. */
  count: number;
  /**
   * Bumped by every repeat, so the stack knows to start the toast's timer over. A number rather
   * than a timestamp so two repeats inside the same millisecond still differ.
   */
  generation: number;
}

/**
 * A live way back into a document that raises notifications: its current watcher.
 *
 * Registered by a window each time its frame loads, and replaced on every reload, which is what lets
 * an entry hold plain data and still be raised again: the centre asks whichever source currently
 * answers to the entry's source id. Design D5.
 */
export interface UmbraDesktopNotificationSource {
  /**
   * Raise a notification again in this source's own document, visibly, so the element it carries
   * can be used.
   * @param notification What to raise.
   */
  reraise(notification: UmbraDesktopNotification): void;
}
