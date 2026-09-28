import { parseLayout, serialiseLayout } from './layout';
import type { UmbraDesktopWindowLayout } from './layout';

/** Prefix of the per-user `localStorage` key the layout is kept under. */
const STORAGE_KEY_PREFIX = 'umbradesktop:windows';

/**
 * The `localStorage` key one user's layout lives under. Per user, as the settings cache is, so two
 * accounts sharing a browser never reopen each other's windows.
 * @param userUnique The user's unique id.
 * @returns The key.
 */
export function layoutStorageKey(userUnique: string): string {
  return `${STORAGE_KEY_PREFIX}:${userUnique}`;
}

/** This browser's copy of one user's layout. */
export interface UmbraDesktopWindowLayoutStorage {
  /**
   * Reads the stored payload.
   * @returns The payload, or null when there is none or storage refused to be read.
   */
  read(): string | null;
  /**
   * Writes the payload.
   * @param value The payload.
   * @returns Whether storage accepted it.
   */
  write(value: string): boolean;
}

/**
 * The layout's storage over `localStorage`. Storage that refuses (private browsing, blocked site
 * data) reads as nothing saved and writes as a failure, so the desktop still works and simply
 * forgets its windows when it closes.
 * @param userUnique Whose layout.
 * @param store The storage, `localStorage` unless a test says otherwise.
 * @returns The storage.
 */
export function browserLayoutCache(userUnique: string, store: Storage = localStorage): UmbraDesktopWindowLayoutStorage {
  const key = layoutStorageKey(userUnique);
  return {
    read: () => {
      try {
        return store.getItem(key);
      } catch {
        return null;
      }
    },
    write: (value) => {
      try {
        store.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * One user's window layout, kept in this browser and nowhere else.
 *
 * **Not on the account**, unlike the desktop settings, and deliberately. The layout changes every
 * time a window is moved, resized, opened or closed, and writing that to the server each time would
 * be excessive for what is a convenience for people who use the desktop regularly. A layout also
 * belongs to a screen: one saved on a laptop is little use arriving on a large monitor. So it lives
 * in `localStorage`, per user, and the only part on the account is the choice of whether to reopen
 * windows at all (`reopenWindows`, with the other settings).
 *
 * Asynchronous although `localStorage` is not, so the restorer does not depend on where the layout
 * is kept.
 */
export class UmbraDesktopWindowLayoutPersistence {
  /** Where the layout is kept. */
  #storage: UmbraDesktopWindowLayoutStorage;

  /**
   * @param storage Where the layout is kept.
   */
  constructor(storage: UmbraDesktopWindowLayoutStorage) {
    this.#storage = storage;
  }

  /**
   * Loads this user's layout.
   * @returns The layout: an empty one when nothing is saved or it cannot be read.
   */
  async load(): Promise<{ layout: UmbraDesktopWindowLayout }> {
    return { layout: parseLayout(this.#storage.read()) };
  }

  /**
   * Saves this user's layout.
   * @param layout The layout.
   * @returns Whether the browser kept it.
   */
  async save(layout: UmbraDesktopWindowLayout): Promise<boolean> {
    return this.#storage.write(serialiseLayout(layout));
  }
}
