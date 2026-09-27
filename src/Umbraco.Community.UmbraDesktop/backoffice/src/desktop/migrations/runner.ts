import type { UmbraDesktopMigration, UmbraDesktopMigrationLedger, UmbraDesktopMigrationReport } from './types';

/** What the runner needs in order to run. */
export interface UmbraDesktopMigrationRun {
  /** The migrations, in the order they must run. */
  migrations: readonly UmbraDesktopMigration[];

  /** Where applied ids are remembered. */
  ledger: UmbraDesktopMigrationLedger;

  /**
   * Called immediately before each migration that actually runs, never for one that is skipped.
   *
   * This is what the boot splash shows. Deliberately a callback rather than an observable: the
   * runner has no opinion about what a caller does with it, and the splash cannot depend on
   * anything that has to be constructed.
   */
  onStart?: (migration: UmbraDesktopMigration) => void;
}

/**
 * Runs whatever has not been applied yet, in order, and records what did work.
 *
 * Three rules, each of which exists because the obvious alternative fails badly:
 *
 * 1. **Nothing runs when the ledger cannot be read.** Work that cannot be recorded is work that
 *    repeats on every load, so an unreachable server means do nothing and try again next time.
 * 2. **Only a migration that resolves `true` is recorded.** A migration that finds nothing to do is
 *    not finished, it is waiting. Recording it would mean a user who happens to sign in first on a
 *    machine with nothing to migrate has the migration marked done, and then loses the data still
 *    sitting on the machine they use — with nothing having failed anywhere.
 * 3. **A failed *record* does not stop the run.** The work stands and is repeated next load, which
 *    idempotence makes cheap. Stopping instead would let one permanently failing write block every
 *    later migration forever, which is the more expensive failure by a wide margin.
 *
 * A migration that *throws* does stop the run, because a later migration may well depend on the
 * state the failed one was in the middle of producing.
 * @param run What to run and where to record it.
 * @returns What happened, for the caller to report on.
 */
export async function runMigrations(run: UmbraDesktopMigrationRun): Promise<UmbraDesktopMigrationReport> {
  const report: UmbraDesktopMigrationReport = { applied: [], unrecorded: [], ledgerUnavailable: false };

  const alreadyApplied = await run.ledger.read();
  if (!alreadyApplied) {
    report.ledgerUnavailable = true;
    return report;
  }

  const done = new Set(alreadyApplied);

  for (const migration of run.migrations) {
    if (done.has(migration.id)) continue;

    run.onStart?.(migration);

    let changed: boolean;
    try {
      changed = await migration.run();
    } catch (error) {
      report.failure = { id: migration.id, descriptionKey: migration.descriptionKey, error };
      return report;
    }

    if (!changed) continue;

    if (await run.ledger.record(migration.id)) {
      report.applied.push(migration.id);
    } else {
      report.unrecorded.push(migration.id);
    }
  }

  return report;
}
