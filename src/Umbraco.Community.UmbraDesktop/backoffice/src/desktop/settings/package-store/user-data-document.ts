import type { UmbraDesktopPackageSettingsDocument } from './package-settings-store.js';
import { newRowKey } from '../../user-data/user-data.repository.js';
import type { UmbraDesktopUserDataClient } from '../../user-data/types.js';

/**
 * One document of the signed-in user's, stored as a single `umbracoUserData` row identified by
 * group and identifier: where a package's settings live, so they follow the person to any browser
 * they sign in on. Ported from Accessories' own document, whose rules design §5 promised the store
 * keeps.
 *
 * Not `UmbraDesktopUserDataRepository`, which the desktop's own settings use. That reads its group
 * once and trusts the answer for the life of the page, which is right for one tab writing its own
 * rows; a package's store hears other tabs' saves, so a cached "no row" goes stale the moment
 * another tab makes one, and the next save here would make a second. Umbraco enforces no uniqueness
 * on group and identifier, so this class is mostly about never making a second row:
 * - it looks again before any write while it knows no row, so a row another tab or browser made is
 *   updated rather than joined;
 * - it never creates when it could not look, since "could not ask" is not "nothing there";
 * - when duplicates exist anyway, the lowest key wins, so every browser settles on the same row, and
 *   the others are removed on the next write;
 * - when an update fails it looks again rather than guessing, so a failure that was only the network
 *   does not become a second row.
 *
 * Writes must not overlap, since each is a read-then-act. It does not queue them itself: its one
 * caller, the package settings store, writes one change at a time.
 *
 * Last write wins between two tabs of the same user. That is the same contract the desktop's own
 * settings have, and right for a single value.
 */
export class UmbraDesktopUserDataDocument implements UmbraDesktopPackageSettingsDocument {
  /** The row this document is stored in, once one has been found or made. */
  #key?: string;

  /** Duplicate rows found by the last read, removed by the next write. */
  #duplicates: string[] = [];

  /**
   * @param client Where the rows are.
   * @param group The row's group: the package's own, never the desktop's.
   * @param identifier The row's identifier within the group, one per kind of document.
   * @param newKey Makes a key for a new row. A parameter so tests can name it.
   */
  constructor(
    private readonly client: UmbraDesktopUserDataClient,
    private readonly group: string,
    private readonly identifier: string,
    private readonly newKey: () => string = newRowKey,
  ) {}

  /**
   * Read the stored value.
   * @returns The value; null when nothing is stored yet; undefined when the server could not be
   *   asked, which a caller must not mistake for nothing.
   */
  async read(): Promise<string | null | undefined> {
    const rows = await this.#attempt(() => this.client.readGroup(this.group), undefined);
    if (!rows) return undefined;
    const mine = rows.filter((row) => row.identifier === this.identifier).sort((a, b) => (a.key < b.key ? -1 : 1));
    this.#key = mine[0]?.key;
    this.#duplicates = mine.slice(1).map((row) => row.key);
    return mine[0]?.value ?? null;
  }

  /**
   * Store a value, replacing what was there.
   * @param value The new value.
   * @returns Whether it was stored.
   */
  async write(value: string): Promise<boolean> {
    if (this.#key === undefined && (await this.read()) === undefined) return false;
    if (this.#key !== undefined) {
      const row = { key: this.#key, group: this.group, identifier: this.identifier, value };
      if (await this.#attempt(() => this.client.update(row), false)) {
        await this.#removeDuplicates();
        return true;
      }
      // The row may have been deleted meanwhile. Look again rather than guess, so a failure that
      // was only the network does not become a second row.
      if ((await this.read()) === undefined) return false;
      if (this.#key !== undefined) return false;
    }
    const key = this.newKey();
    const created = await this.#attempt(
      () => this.client.create({ key, group: this.group, identifier: this.identifier, value }),
      false,
    );
    if (created) this.#key = key;
    return created;
  }

  /** Remove the duplicate rows the last read found. Best effort: a leftover is harmless, since reads ignore it. */
  async #removeDuplicates(): Promise<void> {
    const duplicates = this.#duplicates;
    this.#duplicates = [];
    for (const key of duplicates) await this.#attempt(() => this.client.remove(key), false);
  }

  /**
   * Make one request, turning a throw into the failure answer the port promises instead.
   *
   * The port's contract is to report failure rather than throw it, and the store awaits this
   * document with no catch: a throw would end its write loop and reject a load nobody awaits. The
   * desktop's own repository guards the same way, for the same reason.
   * @param request The request.
   * @param failed What a throw is reported as.
   * @returns The request's answer, or `failed`.
   */
  async #attempt<T>(request: () => Promise<T>, failed: T): Promise<T> {
    try {
      return await request();
    } catch {
      return failed;
    }
  }
}
