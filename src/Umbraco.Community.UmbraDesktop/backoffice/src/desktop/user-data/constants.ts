/** Where this package's rows live inside Umbraco's per-user key/value store. */

/**
 * The group every row this package stores belongs to.
 *
 * Namespaced because the store is shared. Core's own convention is inconsistent — the v14 tours
 * migration wrote `umbraco.tours`, while the first user preference to follow it uses
 * `Umbraco.BackOffice.Media` — so this takes the package's assembly name, which matches what this
 * package already uses for its `IKeyValueService` documents (`Umbraco.Community.UmbraDesktop.
 * Connections`) and cannot collide with a lowercase `umbraco.` group core adds later.
 *
 * **Never change this.** It is not a display string: it is half the address of every row, and
 * SQLite compares text case-sensitively by default, so even a change of casing would leave every
 * existing user's settings sitting in a group nothing reads.
 *
 * Well inside the `nvarchar(255)` column, which has no validation in front of it — an overlong
 * group surfaces as a raw database error rather than a 400.
 */
export const UMBRADESKTOP_USER_DATA_GROUP = 'Umbraco.Community.UmbraDesktop';

/** The row holding one user's desktop settings, serialised by `serialiseSettings`. */
export const UMBRADESKTOP_SETTINGS_IDENTIFIER = 'settings';
