import type { UmbraDesktopMigration, UmbraDesktopMigrationStore } from './types';
import { settingsToUserDataMigration } from './0001-settings-to-user-data';

/** What the migrations need in order to be built. */
export interface UmbraDesktopMigrationSources {
  /** The signed-in user's account store. */
  store: UmbraDesktopMigrationStore;

  /** Reads this user's browser-stored settings payload, or null when there is none. */
  readLegacySettings: () => string | null;
}

/**
 * Every client-side migration, in the order they must run.
 *
 * **The order is the contract.** Ids are never reused and never renumbered, because an id is what
 * the ledger records: renaming one re-runs it for every user who had already applied it, and
 * reordering two that depend on each other is not something any test here would catch.
 *
 * A new migration is appended, never inserted.
 * @param sources What the migrations read and write.
 * @returns The migrations, in order.
 */
export function umbraDesktopMigrations(sources: UmbraDesktopMigrationSources): readonly UmbraDesktopMigration[] {
  return [
    settingsToUserDataMigration({
      store: sources.store,
      readLegacy: sources.readLegacySettings,
    }),
  ];
}
