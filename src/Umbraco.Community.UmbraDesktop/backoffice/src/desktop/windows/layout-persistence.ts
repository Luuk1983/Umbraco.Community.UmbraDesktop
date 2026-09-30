import { parseLayout, serialiseLayout } from './layout';
import type { UmbraDesktopWindowLayout } from './layout';
import type { UmbraDesktopReopenWindows } from '../settings/types';

/** Prefix of the per-user key the layout is kept under, in both storages. */
const STORAGE_KEY_PREFIX = 'umbradesktop:windows';

/**
 * The key one user's layout lives under. Per user, as the settings cache is, so two accounts
 * sharing a browser never reopen each other's windows.
 * @param userUnique The user's unique id.
 * @returns The key.
 */
export function layoutStorageKey(userUnique: string): string {
  return `${STORAGE_KEY_PREFIX}:${userUnique}`;
}

/**
 * How the store reaches each storage: a function rather than the `Storage` itself, because where
 * site data is blocked, merely reading `window.localStorage` throws, and it has to throw inside the
 * store's own `try` rather than wherever the store was built.
 */
export interface UmbraDesktopWindowLayoutStorages {
  /** The tab's own storage, the working copy. */
  session: () => Storage;
  /** The browser's storage, the copy kept between visits. */
  local: () => Storage;
}

/** This browser's copies of one user's layout. */
export interface UmbraDesktopWindowLayoutStore {
  /**
   * The layout to reopen: the tab's own copy, or, for a tab that has none yet and a user who keeps
   * windows between visits, the browser's.
   * @returns The layout, empty when nothing is kept, the mode is off, or storage refused.
   */
  load(): UmbraDesktopWindowLayout;
  /**
   * Keep a layout: in the tab, and in the browser too when windows are kept between visits.
   * Nothing at all while the mode is off.
   * @param layout The layout.
   */
  save(layout: UmbraDesktopWindowLayout): void;
  /**
   * Throw away whichever copies the current mode does not keep: both when it is off, the browser's
   * when it is `session`, none when it is `persistent`. Called when the mode changes,
   * so the browser never holds what the user has not asked it to.
   */
  forgetUnkept(): void;
}

/** The default storages: this tab's `sessionStorage` and this browser's `localStorage`. */
const BROWSER_STORAGES: UmbraDesktopWindowLayoutStorages = {
  session: () => window.sessionStorage,
  local: () => window.localStorage,
};

/**
 * One user's window layout, kept in this browser and never on the account.
 *
 * Not on the account because the layout changes every time a window is moved, resized, opened or
 * closed, which is a stream of writes a convenience does not justify, and because a layout belongs
 * to a screen: one saved on a laptop is little use arriving on a large monitor. Only the choice of
 * when to reopen windows is on the account (`reopenWindows`, with the other settings).
 *
 * Two copies with different jobs. `sessionStorage` is the working copy: every save goes there and
 * every load reads it first, so F5 brings back exactly this tab and two tabs never overwrite each
 * other while somebody works. `localStorage` is written only in `persistent` mode and read only by a
 * tab with no working copy of its own, which is a tab opened after the browser was closed (or a
 * second tab, which starts from whatever was changed last). It can be overwritten by any tab, and
 * that does not matter, because nothing reads it once a tab has its own copy.
 *
 * Storage that refuses (blocked site data, some private modes) reads as nothing kept and writes
 * nowhere, so the desktop still works and simply forgets its windows.
 * @param userUnique Whose layout.
 * @param mode The user's current choice, read at every call so a change applies at once.
 * @param storages How to reach each storage; this tab's and this browser's unless a test says otherwise.
 * @returns The store.
 */
export function windowLayoutStore(
  userUnique: string,
  mode: () => UmbraDesktopReopenWindows,
  storages: UmbraDesktopWindowLayoutStorages = BROWSER_STORAGES,
): UmbraDesktopWindowLayoutStore {
  const key = layoutStorageKey(userUnique);
  const read = (storage: () => Storage): string | null => {
    try {
      return storage().getItem(key);
    } catch {
      return null;
    }
  };
  const write = (storage: () => Storage, value: string): void => {
    try {
      storage().setItem(key, value);
    } catch {
      // Refused or full. The layout is a convenience: the desktop carries on without it.
    }
  };
  const remove = (storage: () => Storage): void => {
    try {
      storage().removeItem(key);
    } catch {
      // Refused: then nothing was kept there either.
    }
  };

  return {
    load: () => {
      const current = mode();
      if (current === 'off') return parseLayout(null);
      return parseLayout(read(storages.session) ?? (current === 'persistent' ? read(storages.local) : null));
    },
    save: (layout) => {
      const current = mode();
      if (current === 'off') return;
      const value = serialiseLayout(layout);
      write(storages.session, value);
      if (current === 'persistent') write(storages.local, value);
    },
    forgetUnkept: () => {
      const current = mode();
      if (current !== 'persistent') remove(storages.local);
      if (current === 'off') remove(storages.session);
    },
  };
}
