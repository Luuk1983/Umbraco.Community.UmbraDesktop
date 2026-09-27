/** Types for reading and writing Umbraco's per-user key/value store. */

/**
 * One row of `umbracoUserData`, as this package reads it.
 *
 * The user is absent on purpose. Every endpoint takes the user from the backoffice security
 * accessor and none of the request models carries a user key, so there is no user id here to
 * forget not to trust.
 */
export interface UmbraDesktopUserDataRow {
  /** The row's own key, and the only thing Umbraco enforces uniqueness on. */
  key: string;
  /** The namespace the row belongs to. */
  group: string;
  /** What the row is, within its group. */
  identifier: string;
  /** The stored payload. `nvarchar(max)` server-side, so a JSON document is fine. */
  value: string;
}

/**
 * The four operations this package needs from Umbraco's `user-data` endpoints.
 *
 * A port rather than the generated client itself, so the save contract in
 * {@link UmbraDesktopUserDataRepository} can be tested without a controller host, a token or
 * `tryExecute`. The server-backed implementation lives in `server.client.ts`.
 */
export interface UmbraDesktopUserDataClient {
  /**
   * Reads every row in one group.
   *
   * Filtered by group rather than unfiltered: an unfiltered read pulls up to a hundred rows of
   * `nvarchar(max)` belonging to whatever else stores user data here.
   * @param group The group to read.
   * @returns The rows, or undefined when the request failed. Empty and failed are different
   * answers, and the caller depends on telling them apart.
   */
  readGroup(group: string): Promise<UmbraDesktopUserDataRow[] | undefined>;

  /**
   * Creates a row.
   *
   * The key is supplied rather than left to the server. Umbraco assigns a fresh one when the body
   * omits it and returns 201 with no body, so a keyless create leaves the caller unable to name the
   * row it just made — and since there is no uniqueness constraint, the next write would create a
   * second one.
   * @param row The row to create, key included.
   * @returns Whether the request succeeded.
   */
  create(row: UmbraDesktopUserDataRow): Promise<boolean>;

  /**
   * Replaces a row's value.
   * @param row The row to write, identified by its key.
   * @returns Whether the request succeeded.
   */
  update(row: UmbraDesktopUserDataRow): Promise<boolean>;

  /**
   * Deletes a row.
   * @param key The row's key.
   * @returns Whether the request succeeded.
   */
  remove(key: string): Promise<boolean>;
}
