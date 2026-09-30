import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UserDataService } from '@umbraco-cms/backoffice/external/backend-api';
import { UmbId } from '@umbraco-cms/backoffice/id';
import { tryExecute } from '@umbraco-cms/backoffice/resources';

/**
 * The `umbracoUserData` group every row of this package lives in. Namespaced with the package id,
 * so nothing else that stores user data can read or overwrite it by accident, and final: renaming
 * it would lose every user's stored settings and notes.
 */
export const ACCESSORIES_USER_DATA_GROUP = 'Umbraco.Community.UmbraDesktop.Accessories';

/**
 * One row of Umbraco's per-user key/value store, as this package reads it.
 *
 * No user in it: every `user-data` endpoint takes the user from the signed-in session, so a row is
 * always the current user's own and there is no user id here to trust or forget.
 */
export interface UserDataRow {
  /** The row's own key, the only thing Umbraco keeps unique. */
  key: string;
  /** The namespace the row belongs to. */
  group: string;
  /** What the row is, within its group. */
  identifier: string;
  /** The stored payload, `nvarchar(max)` on the server, so a JSON document fits. */
  value: string;
}

/**
 * The four `user-data` operations this package needs. A port rather than the generated client, so
 * {@link UserDataDocument}'s rules can be tested without a signed-in backoffice.
 */
export interface UserDataClient {
  /**
   * Read every row of one group.
   * @param group The group.
   * @returns The rows, or undefined when the request failed. Empty and failed are different
   *   answers, and the caller depends on telling them apart.
   */
  readGroup(group: string): Promise<UserDataRow[] | undefined>;
  /**
   * Create a row, with the key chosen by the caller, since Umbraco answers a create with no body.
   * @param row The row, key included.
   * @returns Whether it was created.
   */
  create(row: UserDataRow): Promise<boolean>;
  /**
   * Replace a row's value.
   * @param row The row, identified by its key.
   * @returns Whether it was written.
   */
  update(row: UserDataRow): Promise<boolean>;
  /**
   * Delete a row.
   * @param key The row's key.
   * @returns Whether it was deleted.
   */
  remove(key: string): Promise<boolean>;
}

/**
 * Rows per request when reading a group. The server's own default, stated so the paging reads a
 * number this file owns.
 */
const PAGE_SIZE = 100;

/**
 * The real client, over Umbraco's own generated `UserDataService`: core's endpoints, so this
 * package needs no controller and no table to keep something per user.
 *
 * Every call is quiet (`disableNotifications`). The callers decide what a failure means and say so
 * in their own window, which is where a person is looking; a toast from here as well would report
 * one failure twice.
 * @param host The element the requests are made for.
 * @returns A {@link UserDataClient}.
 */
export function createUserDataClient(host: UmbControllerHost): UserDataClient {
  const quiet = { disableNotifications: true };
  return {
    async readGroup(group) {
      const rows: UserDataRow[] = [];
      // Paged rather than one generous `take`: a truncated answer could hide a row and let the
      // next write create a duplicate. In practice this loops once.
      while (true) {
        const { data, error } = await tryExecute(
          host,
          UserDataService.getUserData({ query: { groups: [group], skip: rows.length, take: PAGE_SIZE } }),
          quiet,
        );
        if (error || !data) return undefined;
        rows.push(
          ...data.items.map((item) => ({ key: item.key, group: item.group, identifier: item.identifier, value: item.value })),
        );
        if (data.items.length === 0 || rows.length >= data.total) return rows;
      }
    },
    async create(row) {
      const { error } = await tryExecute(host, UserDataService.postUserData({ body: { ...row } }), quiet);
      return !error;
    },
    async update(row) {
      const { error } = await tryExecute(host, UserDataService.putUserData({ body: { ...row } }), quiet);
      return !error;
    },
    async remove(key) {
      const { error } = await tryExecute(host, UserDataService.deleteUserDataById({ path: { id: key } }), quiet);
      return !error;
    },
  };
}

/**
 * One document of the signed-in user's, stored as a single `umbracoUserData` row identified by
 * group and identifier: what this package keeps per person, and follows them to any browser they
 * sign in on, as the desktop's own settings do.
 *
 * Umbraco enforces no uniqueness on group and identifier, so this class is mostly about never
 * making a second row:
 * - it looks before its first write, so a row another browser made is updated rather than joined;
 * - it never creates when it could not look, since "could not ask" is not "nothing there";
 * - when duplicates exist anyway, the lowest key wins, so every browser settles on the same row,
 *   and the others are removed on the next write.
 *
 * Last write wins between two tabs of the same user. That is the same contract the desktop's own
 * settings have, and right for a single value. A caller whose document is a list merges before it
 * writes, as Sticky Notes does (`mergePersonal`), or a stale tab deletes what another one added.
 */
export class UserDataDocument {
  /** The row this document is stored in, once one has been found or made. */
  #key?: string;

  /** Duplicate rows found by the last read, removed by the next write. */
  #duplicates: string[] = [];

  /**
   * @param client Where the rows are.
   * @param group The row's group, normally {@link ACCESSORIES_USER_DATA_GROUP}.
   * @param identifier The row's identifier within the group, one per kind of document.
   * @param newKey Makes a key for a new row. A parameter so tests can name it.
   */
  constructor(
    private readonly client: UserDataClient,
    private readonly group: string,
    private readonly identifier: string,
    private readonly newKey: () => string = () => UmbId.new(),
  ) {}

  /**
   * Read the stored value.
   * @returns The value; null when nothing is stored yet; undefined when the server could not be
   *   asked, which a caller must not mistake for nothing.
   */
  async read(): Promise<string | null | undefined> {
    const rows = await this.client.readGroup(this.group);
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
      const updated = await this.client.update({ key: this.#key, group: this.group, identifier: this.identifier, value });
      if (updated) {
        await this.#removeDuplicates();
        return true;
      }
      // The row may have been deleted meanwhile. Look again rather than guess, so a failure that
      // was only the network does not become a second row.
      if ((await this.read()) === undefined) return false;
      if (this.#key !== undefined) return false;
    }
    const key = this.newKey();
    const created = await this.client.create({ key, group: this.group, identifier: this.identifier, value });
    if (created) this.#key = key;
    return created;
  }

  /** Remove the duplicate rows the last read found. Best effort: a leftover is harmless, since reads ignore it. */
  async #removeDuplicates(): Promise<void> {
    const duplicates = this.#duplicates;
    this.#duplicates = [];
    for (const key of duplicates) await this.client.remove(key);
  }
}
