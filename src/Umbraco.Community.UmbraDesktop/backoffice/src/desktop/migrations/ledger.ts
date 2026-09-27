import type { UmbraDesktopMigrationLedger, UmbraDesktopMigrationStore } from './types';

/** The identifier the ledger is stored under, within whatever group the store owns. */
export const UMBRADESKTOP_MIGRATION_LEDGER_IDENTIFIER = 'migrations';

/** The ledger payload's version. Bumped only if the ledger's own shape ever changes. */
const LEDGER_VERSION = 1;

/**
 * The record of which migrations have been applied, kept in one stored document.
 *
 * Reads are forgiving in one direction only. A payload that is absent, unparseable, the wrong shape
 * or a version this build predates all read as **nothing applied**, which re-runs migrations that
 * are required to be idempotent and is therefore safe. A payload that could not be *fetched* reads
 * as `undefined` instead, which stops the runner dead — because running work that cannot be recorded
 * means running it again on every load forever.
 *
 * Those two are easy to collapse into one and the collapse is silent, which is why they are separate
 * types rather than an empty array and a flag.
 */
export class UmbraDesktopStoredMigrationLedger implements UmbraDesktopMigrationLedger {
  /** Where the document lives. */
  #store: UmbraDesktopMigrationStore;

  /**
   * The applied ids once read, and the only copy {@link record} adds to.
   *
   * Kept across a failed write on purpose: a migration whose record did not save still *ran*, so its
   * id belongs in the next write rather than being dropped because one request failed.
   */
  #applied?: string[];

  /**
   * @param store Where to keep the ledger.
   */
  constructor(store: UmbraDesktopMigrationStore) {
    this.#store = store;
  }

  /**
   * The ids already applied.
   * @returns The applied ids, or `undefined` when the document could not be fetched.
   */
  async read(): Promise<string[] | undefined> {
    if (this.#applied) return [...this.#applied];

    let raw: string | null | undefined;
    try {
      raw = await this.#store.read(UMBRADESKTOP_MIGRATION_LEDGER_IDENTIFIER);
    } catch {
      // The store's contract is to report failure rather than throw it, and this is where that
      // stops being assumed. A rejection here escapes into the settings context's load, which has
      // no catch, and the desktop then never paints.
      return undefined;
    }

    if (raw === undefined) return undefined;

    this.#applied = parseLedger(raw);
    return [...this.#applied];
  }

  /**
   * Records one id as applied, writing the whole document.
   *
   * Written even when the id is already present, so that ids left pending by an earlier failed write
   * get another chance to save rather than being stranded behind a short-circuit.
   * @param id The migration's id.
   * @returns Whether the document was stored.
   */
  async record(id: string): Promise<boolean> {
    const applied = this.#applied ?? (await this.read());
    if (!applied) return false;

    this.#applied ??= applied;
    if (!this.#applied.includes(id)) this.#applied.push(id);

    try {
      return await this.#store.write(
        UMBRADESKTOP_MIGRATION_LEDGER_IDENTIFIER,
        JSON.stringify({ v: LEDGER_VERSION, applied: this.#applied }),
      );
    } catch {
      // Worse than a rejecting read: this one escapes from inside the migration screen, which has
      // no dismiss button while it is running, so the person would be left behind a screen with no
      // way out. Reported as a refused record instead, which the runner already handles.
      return false;
    }
  }
}

/**
 * Read a stored ledger payload. Never throws.
 * @param raw The stored document, or null when nothing is stored.
 * @returns The applied ids, empty when the payload cannot be read.
 */
function parseLedger(raw: string | null): string[] {
  if (!raw) return [];

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return [];
  }

  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return [];

  const payload = decoded as { v?: unknown; applied?: unknown };
  if (payload.v !== LEDGER_VERSION) return [];
  if (!Array.isArray(payload.applied)) return [];

  // Entry by entry rather than all-or-nothing: one junk element is no reason to re-run every
  // migration the rest of the list correctly records.
  return payload.applied.filter((entry): entry is string => typeof entry === 'string');
}

export default UmbraDesktopStoredMigrationLedger;
