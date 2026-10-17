/**
 * The localisation area everything this service says lives under.
 *
 * `umbraDesktopServicesMedia` rather than `umbraDesktopMedia`, which is left for the Media add-on: an
 * area is a package's namespace in Umbraco's merged dictionary, and two packages sharing one would
 * each be able to overwrite the other's words. In its own module so the code and the dictionaries
 * cannot spell it different ways.
 */
export const AREA = 'umbraDesktopServicesMedia';
