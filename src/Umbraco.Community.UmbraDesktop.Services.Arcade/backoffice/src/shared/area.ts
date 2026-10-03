/**
 * The localisation area everything the Arcade says lives under.
 *
 * One area for the package rather than one per component: an area is a package's namespace in
 * Umbraco's merged dictionary, and the hub, the board and the profile are told apart by their key
 * prefix. In its own module so the manifest and the elements cannot spell it different ways.
 */
export const AREA = 'umbraDesktopArcade';
