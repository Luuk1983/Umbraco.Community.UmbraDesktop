import type { UmbraDesktopMigration, UmbraDesktopMigrationLedger } from './types';

/**
 * Which migrations have work to do, asked before any of them runs.
 *
 * This exists for one purpose: deciding whether a screen appears. The runner does not consult it,
 * and each migration decides for itself whether to act, so a wrong answer here costs a screen shown
 * or withheld and nothing else. That is deliberate — the alternative, a runner that trusted a
 * look-ahead, would let a cosmetic mistake silently skip real work.
 *
 * A migration whose look-ahead throws is treated as having nothing to do. Taking the desktop down
 * over a question this advisory would be absurd.
 * @param migrations The migrations to ask, in declaration order.
 * @param ledger Where applied ids are recorded.
 * @returns The migrations that have work, in declaration order. Empty when the ledger cannot be
 * read, because in that state the runner will not run anything either.
 */
export async function pendingMigrations(
  migrations: readonly UmbraDesktopMigration[],
  ledger: UmbraDesktopMigrationLedger,
): Promise<UmbraDesktopMigration[]> {
  const applied = await ledger.read();
  if (!applied) return [];

  const done = new Set(applied);
  const pending: UmbraDesktopMigration[] = [];

  for (const migration of migrations) {
    if (done.has(migration.id)) continue;

    try {
      if (await migration.pending()) pending.push(migration);
    } catch {
      // Advisory, so an unreadable answer is simply "no". The runner will still run it and decide
      // properly; all that is lost is the chance to say so on screen first.
    }
  }

  return pending;
}
