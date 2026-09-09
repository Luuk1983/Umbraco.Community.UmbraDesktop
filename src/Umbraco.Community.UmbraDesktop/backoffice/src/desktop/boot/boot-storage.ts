import {
  UMBRADESKTOP_BOOT_EXITED_KEY,
  UMBRADESKTOP_BOOT_HINT_KEY,
  UMBRADESKTOP_BOOT_MARKER_KEY,
} from './constants';

/**
 * Every read and write of the three boot keys, in one place and each one guarded.
 *
 * Storage is best-effort here for the same reason it is in the settings context, but the stakes
 * differ: this code runs during boot, before the backoffice has painted, so an exception escaping
 * it would take the whole backoffice down rather than costing a preference. A browser that refuses
 * storage gets a boot that is simply off.
 *
 * Each function takes its `Storage` so the caller chooses between `localStorage` (the hint and the
 * marker, which outlive the tab) and `sessionStorage` (the suppression, which must not), and so
 * every branch is testable without touching the real thing.
 */

/**
 * Read a key, treating any refusal as absence.
 * @param store The storage to read from.
 * @param key The key to read.
 * @returns The stored string, or null when absent or unreadable.
 */
function read(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Write a key, ignoring any refusal.
 * @param store The storage to write to.
 * @param key The key to write.
 * @param value The value to write.
 */
function write(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    // Private mode or blocked site data. The boot degrades to off, which is the safe direction.
  }
}

/**
 * Remove a key, ignoring any refusal.
 * @param store The storage to write to.
 * @param key The key to remove.
 */
function remove(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // As above.
  }
}

/**
 * Whether this browser last saw a user who boots into the desktop.
 *
 * Decides whether the splash goes up, never where we navigate. See {@link UMBRADESKTOP_BOOT_HINT_KEY}.
 * @param store Storage to read. Defaults to `localStorage`.
 * @returns True when the hint is set.
 */
export function readBootHint(store: Storage = localStorage): boolean {
  return read(store, UMBRADESKTOP_BOOT_HINT_KEY) === 'true';
}

/**
 * Mirror the current user's boot preference for the next boot to read.
 * @param value The preference to mirror.
 * @param store Storage to write. Defaults to `localStorage`.
 */
export function writeBootHint(value: boolean, store: Storage = localStorage): void {
  write(store, UMBRADESKTOP_BOOT_HINT_KEY, value ? 'true' : 'false');
}

/**
 * Record that a boot redirect is being attempted, before making it.
 * @param store Storage to write. Defaults to `localStorage`.
 */
export function markBootAttempt(store: Storage = localStorage): void {
  write(store, UMBRADESKTOP_BOOT_MARKER_KEY, 'true');
}

/**
 * Record that a boot finished, or that a stale marker has been spent.
 * @param store Storage to write. Defaults to `localStorage`.
 */
export function clearBootAttempt(store: Storage = localStorage): void {
  remove(store, UMBRADESKTOP_BOOT_MARKER_KEY);
}

/**
 * Whether a previous boot attempt never reported a mounted desktop.
 * @param store Storage to read. Defaults to `localStorage`.
 * @returns True when a marker is present.
 */
export function hasBootAttempt(store: Storage = localStorage): boolean {
  return read(store, UMBRADESKTOP_BOOT_MARKER_KEY) === 'true';
}

/**
 * Stop booting into the desktop until this tab is closed.
 *
 * Written when the user explicitly exits, so that leaving survives a refresh. Without it, exiting
 * and reloading would put the user straight back and Exit would read as broken.
 * @param store Storage to write. Defaults to `sessionStorage`.
 */
export function suppressBootForSession(store: Storage = sessionStorage): void {
  write(store, UMBRADESKTOP_BOOT_EXITED_KEY, 'true');
}

/**
 * Whether the user has exited the desktop in this tab.
 * @param store Storage to read. Defaults to `sessionStorage`.
 * @returns True when the boot is suppressed for this tab.
 */
export function isBootSuppressed(store: Storage = sessionStorage): boolean {
  return read(store, UMBRADESKTOP_BOOT_EXITED_KEY) === 'true';
}
