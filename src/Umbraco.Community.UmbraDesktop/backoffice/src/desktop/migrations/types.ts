/**
 * Types for the client-side migration runner.
 *
 * **Client-side, and user-scoped.** This exists for data only a browser can reach, which today means
 * one thing: `localStorage`. Data that already lives on the server is migrated on the server, with
 * Umbraco's own `PackageMigrationPlan`, because a migration running in one person's browser runs
 * under that person's permissions, whenever they happen to sign in, and races anyone signing in
 * beside them. See `docs/design/2026-09-23-settings-on-the-user-account-design.md` §3.
 *
 * The runner, the ledger and these types know nothing about desktop settings; migrations arrive as
 * data, so that part could be lifted out of this package unchanged if a second one ever wanted it.
 * An individual migration obviously does know its own domain — `0001-settings-to-user-data.ts` sits
 * beside them and imports the settings parser, which is the point of the split.
 */

/** What the migration screen is doing, and therefore what it says. */
export type UmbraDesktopMigrationPhase = 'running' | 'done' | 'failed';

/**
 * Whether a migration screen is showing, and what it is showing.
 *
 * `idle` is the fourth state and the common one: no migration is pending, has just finished, or has
 * failed, so there is no screen. It is expressed as a phase rather than as an absent state object so
 * that dismissing the screen is one assignment rather than a separate flag to keep in step.
 */
export interface UmbraDesktopMigrationScreenState {
  /** Which screen to show, or `idle` for none. */
  phase: 'idle' | UmbraDesktopMigrationPhase;

  /** Localization key of the migration this is about, when there is one. */
  descriptionKey?: string;
}

/** One migration: something that happened to the data once, and must not happen twice. */
export interface UmbraDesktopMigration {
  /**
   * Stable id, sortable, never reused and never renumbered.
   *
   * It is what the ledger records, so changing one re-runs a migration everywhere.
   */
  readonly id: string;

  /**
   * Localization key for one line saying what this is doing, shown on the boot splash while it runs.
   *
   * A key rather than text, because the runner never renders it: it hands the migration to
   * `onStart`, and the caller resolves the key. That is what lets the splash take an
   * already-localized string while depending on nothing itself.
   *
   * The string behind it is written for the person waiting, not for the log: "Moving your desktop
   * settings to your account", not "0001 localStorage to user-data".
   */
  readonly descriptionKey: string;

  /**
   * Whether this migration has work to do, without doing any of it.
   *
   * **Advisory only.** Nothing depends on it being right: the runner never consults it, and
   * {@link run} decides for itself whether to act. Its one job is to answer "should a screen appear
   * at all", before anything has happened, so that a migration with nothing to do never flashes a
   * screen up and takes it away again.
   *
   * Must be cheap and must not write. In practice it reads the same memoised store {@link run}
   * reads, so it costs nothing.
   * @returns True when {@link run} would change something.
   */
  pending(): Promise<boolean>;

  /**
   * Does the work.
   *
   * **Must be idempotent**, and must decide for itself whether there is anything to do. A run that
   * is interrupted, or whose record fails to save, is repeated on the next load.
   * @returns True when it changed something, false when it found nothing to do. Only a true is
   * recorded — see the runner for the data loss that rule prevents.
   * @throws Anything. A throw stops the run and is reported.
   */
  run(): Promise<boolean>;
}

/** Where the runner remembers what has already been applied. */
export interface UmbraDesktopMigrationLedger {
  /**
   * The ids already applied.
   * @returns The applied ids, or `undefined` when the ledger could not be read at all. The two are
   * different: "nothing applied" means run everything, "unreadable" means run nothing.
   */
  read(): Promise<string[] | undefined>;

  /**
   * Records one id as applied.
   * @param id The migration's id.
   * @returns Whether the record reached the server.
   */
  record(id: string): Promise<boolean>;
}

/**
 * The minimum a ledger needs from a store: one string, read and written by identifier.
 *
 * Narrow on purpose. `UmbraDesktopUserDataRepository` satisfies it structurally, and nothing in this
 * folder imports from `user-data/`, which is what keeps the runner storage-agnostic.
 */
export interface UmbraDesktopMigrationStore {
  /**
   * Reads one identifier.
   * @param identifier What to read.
   * @returns The value, `null` when nothing is stored, `undefined` when the read failed.
   */
  read(identifier: string): Promise<string | null | undefined>;

  /**
   * Writes one identifier.
   * @param identifier What to write.
   * @param value The value to store.
   * @returns Whether it was stored.
   */
  write(identifier: string, value: string): Promise<boolean>;
}

/** What one run of the runner did, for the caller to report on. */
export interface UmbraDesktopMigrationReport {
  /** Ids that did work and were recorded, in the order they ran. */
  applied: string[];

  /**
   * Ids that did work but whose record did not save.
   *
   * The work stands; the bookkeeping does not, so they are attempted again next load. Worth logging
   * and not worth interrupting anybody over.
   */
  unrecorded: string[];

  /** The migration that threw, if one did. Everything after it was skipped. */
  failure?: {
    /** The failing migration's id. */
    id: string;
    /** The failing migration's description key, so a message can name it in the user's words. */
    descriptionKey: string;
    /** Whatever it threw. */
    error: unknown;
  };

  /** True when the ledger could not be read, so nothing ran at all. */
  ledgerUnavailable: boolean;
}
