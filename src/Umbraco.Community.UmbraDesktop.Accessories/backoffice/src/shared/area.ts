/**
 * The localisation area every accessory's words live under.
 *
 * One area for the package rather than one per app, the same as Entertainment's: an area is a
 * package's namespace in Umbraco's merged dictionary, and the apps inside it are told apart by their
 * key prefix (`calculator…`, `notepad…`). In its own module so the four elements and the manifest
 * cannot spell it four different ways.
 */
export const AREA = 'umbraDesktopAccessories';
