/**
 * The Media Health app's manifest alias and sizes (design §3), in a module of their own so the
 * manifests can name the app without loading the window.
 */

/** The app's alias: what the launcher tile and a favourite pin, final once shipped. */
export const UMBRADESKTOP_MEDIA_HEALTH_APP = 'Umbraco.Community.UmbraDesktop.Media.Health';

/**
 * The window's opening content box, in px: the mock's 660 × 580 window less a caption's worth, since
 * the desktop adds the chrome (`desktop-apps.md` §2.1). Room for the line, the bar, three rows and
 * the footer without a scrollbar under any theme.
 */
export const MEDIA_HEALTH_CONTENT_SIZE = { w: 640, h: 540 } as const;

/** The smallest box the three rows still fit in with their buttons beside their text. */
export const MEDIA_HEALTH_MIN_CONTENT_SIZE = { w: 480, h: 400 } as const;
