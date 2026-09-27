import { parseSettings, settingsStorageKey } from './settings-store';
import { writeBootHint } from '../boot/boot-storage';

/**
 * The browser's copy of one user's settings.
 *
 * Two methods and no failure mode, which is the point. The cache is read during boot — before
 * anything has painted, where an exception takes the whole backoffice down rather than costing a
 * preference — and on a desktop whose server cannot be reached, where throwing would turn a
 * degraded session into no session. Everything is swallowed.
 */
export interface UmbraDesktopSettingsCache {
  /**
   * Reads the cached payload.
   * @returns The payload, or null when there is none or storage refused to be read.
   */
  read(): string | null;

  /**
   * Writes the cached payload, and the boot hint derived from it.
   *
   * Only ever called with a value the server confirmed, which is what makes divergence between the
   * cache and the account impossible rather than merely unlikely. See the design doc §4.1.
   * @param value The payload to cache.
   */
  write(value: string): void;
}

/**
 * A cache over browser storage, under the same per-user key the settings have always used.
 *
 * Deliberately the *same* key rather than a new one. It keeps `entrypoint.ts` untouched, since the
 * boot decision still reads exactly what it always read, and it means an older build of this package
 * rolled back onto a migrated account still finds a payload it understands.
 * @param userUnique The current user's unique id. Scopes the key, so two accounts sharing a machine
 * do not inherit each other's desktop.
 * @param store Where to keep it. Defaults to `localStorage`; injected so every branch is testable.
 * @returns The cache.
 */
export function browserSettingsCache(userUnique: string, store: Storage = localStorage): UmbraDesktopSettingsCache {
  const key = settingsStorageKey(userUnique);

  return {
    read: () => {
      try {
        return store.getItem(key);
      } catch {
        // Private mode, or site data blocked. Reads as "nothing cached", which the caller already
        // handles: it is the same answer a first sign-in gives.
        return null;
      }
    },

    write: (value: string) => {
      try {
        store.setItem(key, value);
      } catch {
        // As above. The desktop still works, this browser just will not boot into it until a load
        // where storage is available.
      }

      // The hint belongs to the same copy, so it moves with it and never on its own.
      //
      // Two keys, read at two different moments by two different pieces of code: the hint decides
      // whether to raise the splash, during the bundle's own evaluation, before anything can say who
      // is signed in; the payload decides whether to navigate, once the user has resolved. A browser
      // whose hint disagrees with its payload therefore either raises a splash that lifts onto the
      // classic backoffice, or navigates to the desktop with no splash at all — and the second is
      // the exact flash the splash exists to remove. Writing them in one place is what makes
      // disagreeing impossible.
      //
      // A payload this build cannot read yields a hint of false, which is the safe direction: a
      // missing splash costs a moment of the backoffice, while a splash raised for a boot that never
      // comes covers a screen that was working.
      writeBootHint(parseSettings(value).bootIntoDesktop, store);
    },
  };
}
