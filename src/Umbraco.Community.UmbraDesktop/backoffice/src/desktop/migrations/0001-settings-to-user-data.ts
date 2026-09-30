import type { UmbraDesktopMigration, UmbraDesktopMigrationStore } from './types';
import { UMBRADESKTOP_SETTINGS_IDENTIFIER } from '../user-data/constants';
import { isReadableSettingsPayload, parseSettings, serialiseSettings } from '../settings/settings-store';

/** What the migration needs in order to run. */
export interface UmbraDesktopSettingsMigrationSources {
  /** Where the account's settings live. */
  store: UmbraDesktopMigrationStore;

  /**
   * Reads this user's browser-stored payload, or null when there is none.
   *
   * A function rather than a value, so the migration reads at the moment it runs and so the caller
   * owns the storage key and the try/catch around a browser that refuses to be read at all.
   */
  readLegacy: () => string | null;
}

/**
 * Moves one user's desktop settings from their browser onto their Umbraco account.
 *
 * ```
 * account empty AND browser has a payload -> write it up, and say so
 * anything else                           -> nothing to do
 * ```
 *
 * One-way, and it deletes nothing — but it is **not** non-destructive, which an earlier version of
 * this comment claimed. The browser's copy lives at the same key the cache does, by design, so the
 * load that follows a successful migration mirrors the account's copy straight back over it. What
 * was in the browser is replaced by a normalised form of itself.
 *
 * That is harmless while the two say the same thing, and it is why this refuses to migrate a payload
 * it cannot read: copying one would put *defaults* on the account, record the migration as done, and
 * then overwrite the original with them. See `isReadableSettingsPayload`.
 *
 * Worth being honest about: this migration would work correctly with no ledger at all, because it
 * detects its own state — once the account has a row, the browser copy is never consulted again.
 * The ledger is infrastructure for the second migration rather than a load-bearing part of this
 * one, and the runner's "record only what did work" rule is what keeps the ledger from making this
 * migration *worse* than having none.
 * @param sources Where to read from and write to.
 * @returns The migration.
 */
export function settingsToUserDataMigration(sources: UmbraDesktopSettingsMigrationSources): UmbraDesktopMigration {
  return {
    id: '0001-settings-to-user-data',
    descriptionKey: 'umbraDesktop_migrationSettingsToAccount',

    async pending(): Promise<boolean> {
      // The same question `run` asks, without the answer. Runs on every load until this migration is
      // applied, so it reads the memoised store and writes nothing.
      const stored = await sources.store.read(UMBRADESKTOP_SETTINGS_IDENTIFIER);

      return stored === null && isReadableSettingsPayload(sources.readLegacy());
    },

    async run(): Promise<boolean> {
      const stored = await sources.store.read(UMBRADESKTOP_SETTINGS_IDENTIFIER);

      // Unreadable rather than absent. Not a throw: the ledger comes from the same request, so
      // getting here at all means something transient, and next load tries again having lost
      // nothing. Writing on this branch is what would lose something — it would mean writing over
      // settings we simply could not see.
      if (stored === undefined) return false;

      // The account already has settings. They win, and the browser copy is never read again — see
      // §4.3 of the design doc for the two-browsers case this decides.
      if (stored !== null) return false;

      const legacy = sources.readLegacy();

      // Unreadable counts as absent, and that is not only about corruption. A payload from a later
      // build reads as unreadable here, and copying it would write *defaults* onto the account,
      // record the migration as done, and then let the account's copy overwrite the original in the
      // browser. Leaving it alone costs the user a default desktop until they change something;
      // taking it costs them the settings they actually had.
      if (!isReadableSettingsPayload(legacy)) return false;

      // Through the parser rather than copied across verbatim, so a corrupt payload arrives on the
      // account as the defaults instead of as something unreadable that every later load recovers
      // from in the same way.
      const settings = serialiseSettings(parseSettings(legacy));

      if (!(await sources.store.write(UMBRADESKTOP_SETTINGS_IDENTIFIER, settings))) {
        // A read that worked followed by a write that did not is an anomaly rather than an
        // unreachable server, and it is the one case where somebody's settings are genuinely at
        // risk of being left behind. Thrown so the runner stops and reports it.
        throw new Error('Could not write desktop settings to the user account.');
      }

      return true;
    },
  };
}

export default settingsToUserDataMigration;
