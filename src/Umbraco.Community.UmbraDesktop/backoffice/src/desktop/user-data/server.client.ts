import type { UmbraDesktopUserDataClient, UmbraDesktopUserDataRow } from './types';
import { UserDataService } from '@umbraco-cms/backoffice/external/backend-api';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The four `user-data` operations, over Umbraco's own generated client.
 *
 * Core's endpoints, not this package's: there is no controller behind any of this, and no C# at
 * all. `umbracoUserData` already is a per-user key/value store, the controllers take the user from
 * the backoffice security accessor rather than from the request, and the only gate is
 * `BackOfficeAccess` — authenticated and approved. Which is exactly the gate personal preferences
 * want, and the reason this feature needed no table.
 *
 * Deliberately thin, and deliberately untested in isolation. Every branch worth testing lives in
 * {@link UmbraDesktopUserDataRepository}, which is driven through this interface; what is left here
 * is argument shuffling, where a mistake is a type error rather than a behaviour, and `tsc` already
 * runs over it. The same reasoning `connections.repository.ts` follows.
 *
 * **Every call is quiet.** `disableNotifications` is set on all four, so nothing here raises a toast
 * of its own. That is not indifference to failure: this runs on the boot path, where an unreachable
 * server is an expected and handled state, and a red notification arriving before the desktop has
 * painted would report a condition the desktop is about to recover from. The callers report what
 * actually matters — the runner reports a migration that failed, the settings context reports a
 * preference that did not save — and doing it in one layer is what stops a single failure being
 * announced twice.
 */
/**
 * Rows per request when reading a group.
 *
 * The server's own default, stated rather than inherited so the paging below is reading a number
 * this file owns rather than one that could change underneath it.
 */
const PAGE_SIZE = 100;

export class UmbraDesktopUserDataServerClient implements UmbraDesktopUserDataClient {
  /** The host requests are made on behalf of. */
  #host: UmbControllerHost;

  /**
   * @param host The controller host the requests belong to.
   */
  constructor(host: UmbControllerHost) {
    this.#host = host;
  }

  /**
   * Reads every row in one group belonging to the signed-in user.
   * @param group The group to read.
   * @returns The rows, or undefined when the request failed.
   */
  async readGroup(group: string): Promise<UmbraDesktopUserDataRow[] | undefined> {
    const rows: UmbraDesktopUserDataRow[] = [];

    // Paged rather than one request with a generous `take`, because a truncated answer is worse
    // than a slow one here. The repository converges on duplicates only over the rows it can
    // actually see, and duplicates are exactly what would push this group past a page: a view that
    // stopped at the page boundary would leave the extras invisible and let the next write add
    // another. In normal use this loops once, for two rows.
    while (true) {
      const { data, error } = await tryExecute(
        this.#host,
        UserDataService.getUserData({ query: { groups: [group], skip: rows.length, take: PAGE_SIZE } }),
        { disableNotifications: true },
      );

      if (error || !data) return undefined;

      rows.push(
        ...data.items.map((item) => ({
          key: item.key,
          group: item.group,
          identifier: item.identifier,
          value: item.value,
        })),
      );

      // An empty page as well as the count, because the count is the server's and the loop's
      // termination should not depend on it alone.
      if (data.items.length === 0 || rows.length >= data.total) return rows;
    }
  }

  /**
   * Creates a row, with the key chosen by the caller.
   * @param row The row to create.
   * @returns Whether the request succeeded.
   */
  async create(row: UmbraDesktopUserDataRow): Promise<boolean> {
    const { error } = await tryExecute(
      this.#host,
      UserDataService.postUserData({ body: { group: row.group, identifier: row.identifier, value: row.value, key: row.key } }),
      { disableNotifications: true },
    );

    return !error;
  }

  /**
   * Replaces a row's value.
   * @param row The row to write, identified by its key.
   * @returns Whether the request succeeded.
   */
  async update(row: UmbraDesktopUserDataRow): Promise<boolean> {
    const { error } = await tryExecute(
      this.#host,
      UserDataService.putUserData({ body: { group: row.group, identifier: row.identifier, value: row.value, key: row.key } }),
      { disableNotifications: true },
    );

    return !error;
  }

  /**
   * Deletes a row.
   * @param key The row's key.
   * @returns Whether the request succeeded.
   */
  async remove(key: string): Promise<boolean> {
    const { error } = await tryExecute(this.#host, UserDataService.deleteUserDataById({ path: { id: key } }), {
      disableNotifications: true,
    });

    return !error;
  }
}

export default UmbraDesktopUserDataServerClient;
