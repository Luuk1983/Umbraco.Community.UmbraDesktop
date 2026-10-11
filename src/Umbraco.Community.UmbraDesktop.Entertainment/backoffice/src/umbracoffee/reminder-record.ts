/**
 * Which umbraCoffee reminders this browser has shown, so two desktop tabs or a reload do not repeat
 * one (design §6.3). Per browser, not per user account: a second device may show one again, which is
 * accepted.
 *
 * Every access is guarded, because storage can be blocked or throw, and a reminder system that breaks
 * the cup when it does would be worse than a repeated reminder.
 *
 * Marking is a read followed by a write, not an atomic step, so two tabs deciding at the same moment
 * can both find a reminder unshown and both show it. That is accepted: the worst case is one duplicate
 * reminder, most likely after waking from sleep, and the cup's comment says why nothing heavier is
 * used to prevent it.
 */

/**
 * Where the record is kept. Named like Snake's best score, `umbradesktop-entertainment-<app>-<what>`,
 * so everything this package leaves in `localStorage` is found under one prefix.
 */
export const REMINDED_STORAGE_KEY = 'umbradesktop-entertainment-umbracoffee-reminded';

/** How many keys to keep. Two per episode, so ten episodes of history, which is years of a monthly show. */
const KEEP = 20;

/** The two calls the record makes on `localStorage`, so a test can pass a map instead. */
export type ReminderStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Where to find the storage, as a function rather than the storage itself.
 *
 * A function because in a browser that blocks site data it is `window.localStorage` itself that
 * throws, on the property read and before any `getItem`. A storage passed as an argument would be
 * read at the call site, outside the guard here, so the lookup has to happen inside it.
 */
export type ReminderStorageSource = () => ReminderStorage | undefined;

/** This browser's `localStorage`, looked up only when called. */
const browserStorage: ReminderStorageSource = () => globalThis.localStorage;

/**
 * The reminders this browser has shown.
 * @param source Where the storage is; this browser's `localStorage` unless a test says otherwise.
 * @returns The shown keys, oldest first. Anything that is not a list of strings reads as empty.
 */
export function readReminded(source: ReminderStorageSource = browserStorage): Set<string> {
  try {
    const parsed: unknown = JSON.parse(source()?.getItem(REMINDED_STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * Record a reminder as shown. A key marked again moves to the newest end, so it is the last to be
 * dropped when the list is trimmed.
 * @param key From `reminderKey`.
 * @param source Where the storage is; this browser's `localStorage` unless a test says otherwise.
 */
export function markReminded(key: string, source: ReminderStorageSource = browserStorage): void {
  try {
    const keys = [...readReminded(source)].filter((k) => k !== key);
    source()?.setItem(REMINDED_STORAGE_KEY, JSON.stringify([...keys, key].slice(-KEEP)));
  } catch {
    // Blocked storage: the reminder may repeat. That is the whole cost.
  }
}
