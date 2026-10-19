/**
 * The localisation area every word of this add-on lives under.
 *
 * One area for the package rather than one per app, the same as the other add-ons: an area is a
 * package's namespace in Umbraco's merged dictionary, and the apps inside it are told apart by their
 * key prefix. `umbraDesktopMedia`, which Services.Media left free for this package by taking
 * `umbraDesktopServicesMedia`. In its own module so the code and the dictionaries cannot spell it
 * two ways.
 */
export const AREA = 'umbraDesktopMedia';
