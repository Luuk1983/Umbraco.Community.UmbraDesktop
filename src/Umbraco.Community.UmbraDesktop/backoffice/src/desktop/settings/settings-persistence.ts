import type { UmbraDesktopSettingsCache } from './settings-cache';
import type { UmbraDesktopSettings } from './types';
import { parseSettings, serialiseSettings } from './settings-store';
import { UMBRADESKTOP_SETTINGS_IDENTIFIER } from '../user-data/constants';
import { runMigrations } from '../migrations/runner';
import { pendingMigrations } from '../migrations/pending';
import type {
  UmbraDesktopMigration,
  UmbraDesktopMigrationLedger,
  UmbraDesktopMigrationReport,
  UmbraDesktopMigrationStore,
} from '../migrations/types';

/** Where a loaded set of settings came from. */
export type UmbraDesktopSettingsSource = 'server' | 'cache' | 'defaults';

/** What one load produced. */
export interface UmbraDesktopSettingsLoad {
  /** The settings to apply. */
  settings: UmbraDesktopSettings;

  /**
   * Where they came from.
   *
   * Carried out rather than kept private because the caller reports on it: `cache` means the account
   * did not answer, so this session will forget anything changed in it.
   */
  source: UmbraDesktopSettingsSource;
}

/** What persistence needs in order to work. */
export interface UmbraDesktopSettingsPersistenceSources {
  /** The account's store, one row per identifier. */
  store: UmbraDesktopMigrationStore;

  /** The browser's cache of the same settings. */
  cache: UmbraDesktopSettingsCache;

  /** Where applied migrations are recorded. */
  ledger: UmbraDesktopMigrationLedger;

  /** The migrations this build knows about, in the order they must run. */
  migrations: readonly UmbraDesktopMigration[];
}

/**
 * One user's settings, on their account, with the browser as a cache.
 *
 * Two rules, and everything else follows from them.
 *
 * **Reading falls back.** The account is the source of truth, but when it has nothing to say this
 * browser's copy is a better answer than the defaults — and that is true whether the account is
 * unreachable or genuinely empty. An empty account with a populated cache is the state a migration
 * is about to resolve anyway, so painting the cache is the same answer arrived at sooner, and it
 * means a migration that then fails costs the user nothing for the session.
 *
 * **Writing does not fall back.** The cache is only ever written from a value the account confirmed,
 * which is what makes the two impossible to diverge rather than merely unlikely to. There is never a
 * local change sitting in the cache waiting to be silently overwritten by the next read, because a
 * change that did not reach the account never reached the cache either.
 *
 * Migrations are **not** part of loading. They run after the desktop is on screen, behind a screen of
 * their own, which is what makes the way somebody entered the desktop stop mattering.
 */
export class UmbraDesktopSettingsPersistence {
  /** Where to read and write. */
  #sources: UmbraDesktopSettingsPersistenceSources;

  /**
   * @param sources Where to read and write.
   */
  constructor(sources: UmbraDesktopSettingsPersistenceSources) {
    this.#sources = sources;
  }

  /**
   * Loads this user's settings.
   * @returns The settings, and where they came from.
   */
  async load(): Promise<UmbraDesktopSettingsLoad> {
    const stored = await this.#sources.store.read(UMBRADESKTOP_SETTINGS_IDENTIFIER);

    if (typeof stored === 'string') {
      // The only branch that writes the cache, because it is the only one holding a value the
      // account actually confirmed.
      this.#sources.cache.write(stored);
      return { settings: parseSettings(stored), source: 'server' };
    }

    // Unreachable, or empty. Either way this browser's copy is the best answer available, and the
    // cache is left exactly as it was: there is nothing confirmed to mirror.
    const cached = this.#sources.cache.read();
    return { settings: parseSettings(cached), source: cached ? 'cache' : 'defaults' };
  }

  /**
   * Which migrations have work to do, asked before any of them runs.
   *
   * Advisory, and used for one thing: deciding whether a screen appears. See `migrations/pending.ts`.
   * @returns The migrations with work, in declaration order.
   */
  async pending(): Promise<UmbraDesktopMigration[]> {
    return pendingMigrations(this.#sources.migrations, this.#sources.ledger);
  }

  /**
   * Runs whatever has not been applied yet.
   * @param onStart Called immediately before each migration that runs, for the screen to narrate.
   * @returns What happened, for the caller to report on.
   */
  async migrate(onStart?: (migration: UmbraDesktopMigration) => void): Promise<UmbraDesktopMigrationReport> {
    return runMigrations({
      migrations: this.#sources.migrations,
      ledger: this.#sources.ledger,
      onStart,
    });
  }

  /**
   * Saves this user's settings, and mirrors them into the cache only once the account has them.
   * @param settings The settings to save.
   * @returns Whether they reached the account. False leaves the change in memory for this session.
   */
  async save(settings: UmbraDesktopSettings): Promise<boolean> {
    const payload = serialiseSettings(settings);

    if (!(await this.#sources.store.write(UMBRADESKTOP_SETTINGS_IDENTIFIER, payload))) return false;

    this.#sources.cache.write(payload);
    return true;
  }
}

export default UmbraDesktopSettingsPersistence;
