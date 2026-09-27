import type { UmbraDesktopUserDataClient, UmbraDesktopUserDataRow } from './types';

/**
 * Reading and writing one group of Umbraco's per-user key/value store, safely.
 *
 * "Safely" is the whole job. `umbracoUserData` has **no uniqueness constraint** on
 * (user, group, identifier), `CreateAsync` checks existence by row key only, and the mapper assigns
 * a fresh key when the body omits one — so a POST without a key *always* succeeds and there is no
 * upsert anywhere in the API. Straightforward save code therefore multiplies rows quietly, and a
 * later read can return a different row than the one being written. This class is the single place
 * that hazard is handled:
 *
 * ```
 * 0 rows   -> create, with a key we chose
 * 1 row    -> update it
 * >1 rows  -> update the first, delete the rest
 * ```
 *
 * The whole group is fetched once and served from memory afterwards, because two consumers want
 * rows from it on every load — the migration runner wants the ledger, the settings context wants the
 * settings — and filtering by group alone returns both in one response. Only *successful* reads are
 * remembered, so a request that failed is retried rather than cached as an answer.
 */
export class UmbraDesktopUserDataRepository {
  /** The group every row read or written here belongs to. */
  #group: string;

  /** The port requests go through. */
  #client: UmbraDesktopUserDataClient;

  /**
   * The group's rows once they have been read, kept in step by every successful write.
   *
   * Held as the in-flight promise rather than the resolved array so that two consumers asking at
   * once join one request instead of making two. Cleared when a read fails, which is what makes a
   * failure a retry rather than a remembered "no rows".
   */
  #rows?: Promise<UmbraDesktopUserDataRow[] | undefined>;

  /**
   * The tail of the write queue, so writes never overlap. See {@link write} for why that matters.
   */
  #queue: Promise<unknown> = Promise.resolve();

  /** Whether this repository has been retired and must stop writing. See {@link abandon}. */
  #abandoned = false;

  /**
   * Retire this repository: refuse every write from now on, including ones already queued.
   *
   * Called when the signed-in user changes. Without it, a save queued for the person who just
   * signed out can still be waiting when the next one signs in, and the request would then go out
   * carrying the new user's token. Core's `PUT /user-data` has no ownership check, so it would
   * re-home the old user's row onto the new user: the first loses their settings entirely and the
   * second silently inherits them.
   *
   * Reads are left alone. A stale read answers a question nobody is asking any more and cannot
   * damage anything.
   */
  abandon(): void {
    this.#abandoned = true;
  }

  /**
   * @param group The group to read and write. Reverse-DNS, and inside the 255-character column.
   * @param client The port to make requests through.
   */
  constructor(group: string, client: UmbraDesktopUserDataClient) {
    this.#group = group;
    this.#client = client;
  }

  /**
   * Reads one identifier's stored value.
   *
   * Three outcomes rather than two, and the caller is expected to care which: a value, `null` for
   * an identifier with no row, and `undefined` for a request that failed. Collapsing the last two
   * would tell a desktop whose server is down that the user has no settings, which is the
   * difference between forgetting for one session and appearing to reset.
   * @param identifier The row to read.
   * @returns The value, `null` when no row exists, or `undefined` when the group could not be read.
   */
  async read(identifier: string): Promise<string | null | undefined> {
    const rows = await this.#load();
    if (!rows) return undefined;

    return rows.find((row) => row.identifier === identifier)?.value ?? null;
  }

  /**
   * Writes one identifier's value, following the contract in the class remarks.
   *
   * Refuses outright when the group could not be read. That is not caution for its own sake: with
   * no view of what is already stored, a create is the only move available, and a create against an
   * identifier that already has a row is exactly how a duplicate is made.
   * @param identifier The row to write.
   * @param value The value to store.
   * @returns Whether the value is now on the server.
   */
  write(identifier: string, value: string): Promise<boolean> {
    // Serialised, because the decision this makes is read-then-act and the settings context does not
    // await it: `#update` fires a save per click, so two clicks inside one round trip put two writes
    // in flight. Both would find no existing row, both would create one with a key of their own, and
    // nothing server-side stops either — core's duplicate check is by row key, and the index on
    // (user, group, identifier) is not unique. The loser becomes a row nobody reads, and the *next*
    // save deletes it as a duplicate, taking the newer payload with it.
    //
    // One queue for the whole repository rather than one per identifier: there are two identifiers,
    // writes are rare, and a queue that can be reasoned about beats one that is marginally faster.
    const result = this.#queue.then(() => this.#write(identifier, value));

    // The queue must survive a rejection, or one failed write stalls every later one. The result
    // the caller sees is untouched; only the chain swallows.
    this.#queue = result.catch(() => undefined);

    return result;
  }

  /**
   * One write, with the queue already held. See {@link write}.
   * @param identifier The row to write.
   * @param value The value to store.
   * @returns Whether the value is now on the server.
   */
  async #write(identifier: string, value: string): Promise<boolean> {
    // Re-checked after the queue, not only before it: the point of abandoning is to stop writes
    // that were already waiting their turn when the user changed.
    if (this.#abandoned) return false;

    const rows = await this.#load();
    if (!rows) return false;

    const matches = rows.filter((row) => row.identifier === identifier);

    if (matches.length === 0) {
      const created: UmbraDesktopUserDataRow = { key: newRowKey(), group: this.#group, identifier, value };
      if (!(await this.#attempt(() => this.#client.create(created)))) return false;
      rows.push(created);
      return true;
    }

    const [keep, ...duplicates] = matches;
    if (!(await this.#attempt(() => this.#client.update({ ...keep, value })))) return false;
    keep.value = value;

    // After the write, not before: losing the extras only matters once there is a surviving row
    // holding the value, and a delete that fails leaves a duplicate rather than a gap.
    for (const duplicate of duplicates) {
      if (await this.#attempt(() => this.#client.remove(duplicate.key))) {
        rows.splice(rows.indexOf(duplicate), 1);
      }
    }

    return true;
  }

  /**
   * The group's rows, fetched at most once.
   * @returns The rows, or undefined when the request failed.
   */
  #load(): Promise<UmbraDesktopUserDataRow[] | undefined> {
    this.#rows ??= this.#read();

    return this.#rows;
  }

  /**
   * Fetch the group, turning any throw into the "could not read" answer the port promises.
   *
   * The port's contract is to *report* failure rather than throw it, and the implementation behind
   * it is Umbraco's generated client. Trusting that contract rather than enforcing it is how a
   * rejection reaches the settings context, whose load has no catch, and the desktop then never
   * paints at all — the worst failure available here, and one that a swallowed request error makes
   * look impossible right up until it is not.
   * @returns The rows, or undefined when the group could not be read.
   */
  async #read(): Promise<UmbraDesktopUserDataRow[] | undefined> {
    try {
      const rows = await this.#client.readGroup(this.#group);
      // Forget a failure immediately, so the next caller asks again rather than inheriting it.
      if (!rows) this.#rows = undefined;
      return rows;
    } catch {
      this.#rows = undefined;
      return undefined;
    }
  }

  /**
   * Run one write, turning any throw into the refusal the port promises. See {@link #read}.
   * @param operation The write to attempt.
   * @returns Whether it succeeded.
   */
  async #attempt(operation: () => Promise<boolean>): Promise<boolean> {
    try {
      return await operation();
    } catch {
      return false;
    }
  }
}

/**
 * A fresh key for a row we are about to create.
 *
 * Chosen here rather than left to the server because a create returns `201` with no body: a row
 * whose key we never learn cannot be updated afterwards, and with no uniqueness constraint the next
 * write would create a second one instead of failing.
 *
 * `crypto.randomUUID` needs a secure context, which a backoffice served over plain HTTP on a LAN is
 * not, so it falls back to building a version 4 UUID out of `crypto.getRandomValues` — available
 * everywhere, secure context or not.
 * @returns A version 4 UUID.
 */
function newRowKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Version 4 in the high nibble of byte 6, variant 10 in the top bits of byte 8. Without these the
  // string is random but not a UUID, and Umbraco parses it as a Guid.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default UmbraDesktopUserDataRepository;
