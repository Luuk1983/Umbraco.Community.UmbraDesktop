import type {
  UmbraDesktopNotification,
  UmbraDesktopNotificationOrigin,
  UmbraDesktopScrollbackEntry,
} from './types.js';

/**
 * The scrollback behind the taskbar clock, as a pure model: a list, what folds into it, and how it
 * is kept. No element and no context, which is what lets the twenty-slot and repeat rules be tested
 * as rules.
 */

/** How many entries the scrollback holds. The issue's number, and small on purpose. */
export const UMBRADESKTOP_SCROLLBACK_SIZE = 20;

/**
 * The `sessionStorage` key the scrollback lives under.
 *
 * Session rather than local storage, which the issue decided: it survives a reload and dies with the
 * tab, and each tab is its own desktop. `localStorage` would bring last Tuesday's license warning
 * back on Monday.
 */
export const UMBRADESKTOP_SCROLLBACK_STORAGE_KEY = 'umbradesktop.notifications';

/**
 * What makes two notifications the same one: severity, headline and text.
 *
 * The source is not part of it. Design §3.1: the same message from five windows has to be one entry,
 * or the scrollback is the multiplication this feature exists to stop.
 * @param notification The notification.
 * @returns Its identity.
 */
export function notificationIdentity(notification: Pick<UmbraDesktopNotification, 'color' | 'headline' | 'message'>): string {
  return JSON.stringify([notification.color, notification.headline ?? '', notification.message]);
}

/**
 * Fold a notification into the scrollback.
 *
 * A repeat updates its entry's count, last-seen time and source, and moves it to the top; anything
 * new goes on top and the oldest rolls off past {@link UMBRADESKTOP_SCROLLBACK_SIZE}. Folding is what
 * stops one recurring message pushing the other nineteen out.
 * @param entries The scrollback, newest first.
 * @param notification What arrived.
 * @param origin Who raised it.
 * @param now When, in epoch milliseconds.
 * @returns The new scrollback, newest first.
 */
export function recordNotification(
  entries: ReadonlyArray<UmbraDesktopScrollbackEntry>,
  notification: UmbraDesktopNotification,
  origin: UmbraDesktopNotificationOrigin,
  now: number,
): UmbraDesktopScrollbackEntry[] {
  const id = notificationIdentity(notification);
  const previous = entries.find((entry) => entry.id === id);
  const entry: UmbraDesktopScrollbackEntry = {
    id,
    color: notification.color,
    message: notification.message,
    count: (previous?.count ?? 0) + 1,
    lastSeen: now,
    sourceId: origin.sourceId,
    source: origin.source,
  };
  if (notification.headline) entry.headline = notification.headline;
  if (notification.element) entry.element = notification.element;
  return [entry, ...entries.filter((e) => e.id !== id)].slice(0, UMBRADESKTOP_SCROLLBACK_SIZE);
}

/**
 * How many distinct warning and error entries the scrollback holds: what the clock shows.
 *
 * A count of what might be worth looking at, not an unread count. It falls only as entries roll off,
 * and nothing clears it by hand, both of which the issue decided.
 * @param entries The scrollback.
 * @returns The number of warning and error entries.
 */
export function attentionCount(entries: ReadonlyArray<UmbraDesktopScrollbackEntry>): number {
  return entries.filter((entry) => entry.color === 'warning' || entry.color === 'danger').length;
}

/**
 * Whether a stored row has the shape of an entry. Storage is somebody else's to write to, and a row
 * that is not an entry would otherwise reach a template that assumes it is.
 * @param row A parsed row.
 * @returns True when it can be drawn as an entry.
 */
function isEntry(row: unknown): row is UmbraDesktopScrollbackEntry {
  const r = row as Partial<UmbraDesktopScrollbackEntry> | null;
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof r.id === 'string' &&
    typeof r.message === 'string' &&
    typeof r.color === 'string' &&
    typeof r.count === 'number' &&
    typeof r.lastSeen === 'number' &&
    typeof r.sourceId === 'string' &&
    typeof r.source === 'string'
  );
}

/**
 * Read the scrollback back out of storage.
 * @param store Where it is kept, normally `sessionStorage`.
 * @returns The stored entries, or an empty list when there are none or they cannot be read.
 */
export function readScrollback(store: Storage): UmbraDesktopScrollbackEntry[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(UMBRADESKTOP_SCROLLBACK_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, UMBRADESKTOP_SCROLLBACK_SIZE) : [];
  } catch {
    return [];
  }
}

/**
 * Keep the scrollback.
 *
 * A failed write is swallowed: storage full or blocked costs the scrollback its survival across a
 * reload, which is a far smaller loss than a notification that failed to show because saving it threw.
 * @param store Where to keep it, normally `sessionStorage`.
 * @param entries The scrollback.
 */
export function writeScrollback(store: Storage, entries: ReadonlyArray<UmbraDesktopScrollbackEntry>): void {
  try {
    store.setItem(UMBRADESKTOP_SCROLLBACK_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // See above.
  }
}
