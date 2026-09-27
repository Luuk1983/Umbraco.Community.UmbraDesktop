import type { UmbraDesktopNotification, UmbraDesktopNotificationColor } from './types.js';

/**
 * The one place that reads the inside of core's `UmbNotificationHandler`.
 *
 * A handler keeps what it was raised with in private fields, `_data` and `_elementName`, with no
 * public getter for either. Core's own container reads `_data` the same way and calls it a trick in a
 * comment, so this is not going further than core does, but it is still a private field and it can
 * move in any release. Keeping the read here, and testing it against a real handler in
 * `read-handler.test.ts`, is what makes that a loud failure instead of blank toasts.
 */

/** Core's default layout element. A notification raised with it carries nothing to raise again. */
const DEFAULT_LAYOUT = 'umb-notification-layout-default';

/** The colours this desktop knows, which are core's. */
const COLORS: ReadonlySet<string> = new Set(['default', 'positive', 'warning', 'danger']);

/** What this module needs of a handler, public and private halves together. */
interface HandlerLike {
  /** Unique id per notification. */
  key?: unknown;
  /** Severity. */
  color?: unknown;
  /** Auto-close in milliseconds, or null. */
  duration?: unknown;
  /** Private: the tag name of the element it renders. */
  _elementName?: unknown;
  /** Private: the data it was raised with. */
  _data?: unknown;
}

/**
 * Read a string field off something that may not be an object.
 * @param from The object.
 * @param name The field.
 * @returns The field if it is a string, otherwise undefined.
 */
function stringField(from: unknown, name: string): string | undefined {
  const value = (from as Record<string, unknown> | null | undefined)?.[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Copy data out of the frame's realm, or give up.
 *
 * A JSON round trip, because the copy has to survive `sessionStorage` anyway and because it drops
 * every tie to the frame: a prototype, a function, an element. Data that cannot make the trip (a
 * cycle, a BigInt) cannot be stored or handed back safely either, so its element is dropped and the
 * notification is still shown as text.
 * @param data The handler's data.
 * @returns A plain copy, or undefined if there is none to be had.
 */
function copyData(data: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(data ?? null));
  } catch {
    return undefined;
  }
}

/**
 * Read one of core's notification handlers into plain data.
 * @param handler A handler from a notification context's `notifications` list.
 * @returns The notification, or undefined when this is not a handler.
 */
export function readNotificationHandler(handler: unknown): UmbraDesktopNotification | undefined {
  const h = handler as HandlerLike | null | undefined;
  if (!h || typeof h.key !== 'string') return undefined;
  const data = h._data;
  const color = typeof h.color === 'string' && COLORS.has(h.color) ? (h.color as UmbraDesktopNotificationColor) : 'default';
  const duration = typeof h.duration === 'number' ? h.duration : null;
  const notification: UmbraDesktopNotification = {
    key: h.key,
    color,
    duration,
    message: stringField(data, 'message') ?? '',
  };
  const headline = stringField(data, 'headline');
  if (headline) notification.headline = headline;
  const elementName = typeof h._elementName === 'string' ? h._elementName : DEFAULT_LAYOUT;
  if (elementName !== DEFAULT_LAYOUT) {
    const copy = copyData(data);
    if (copy !== undefined) notification.element = { name: elementName, data: copy };
  }
  return notification;
}
