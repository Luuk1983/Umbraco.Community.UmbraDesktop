/**
 * The Media Health app's manifest alias and sizes (design §3), in a module of their own so the
 * manifests can name the app without loading the window.
 */

/** The app's alias: what the launcher tile and a favourite pin, final once shipped. */
export const UMBRADESKTOP_MEDIA_HEALTH_APP = 'Umbraco.Community.UmbraDesktop.Media.Health';

/**
 * The details pane's alias (design §16.15): an app hidden from the launcher that the window asks the
 * desktop to attach beside itself, by this alias, as the desktop's attached pane.
 */
export const UMBRADESKTOP_MEDIA_HEALTH_DETAILS_APP = 'Umbraco.Community.UmbraDesktop.Media.Health.Details';

/**
 * The details pane's width asked for, and a floating details window's content size: core's media Info
 * view gives its side column 350 px, and the pane's boxes sit in its padding (design §16.17).
 */
export const MEDIA_HEALTH_DETAILS_SIZE = { w: 380, h: 680 } as const;

/** The narrowest the details pane may get: the facts' labels beside their values still fit. */
export const MEDIA_HEALTH_DETAILS_MIN_SIZE = { w: 260, h: 320 } as const;

/**
 * The window's opening content box, in px, measured rather than taken from the mock (desktop-apps.md
 * §2.1: the desktop adds the chrome). It opens wide, so the overview opens on its cards and the list
 * has room for its table (design §16.15). With Where the space goes a section of its own under the
 * cards (design §16.17), the overview at 960 wide needed 726 px under all five themes in a real
 * backoffice on 2026-10-29, so it opens 728 tall and whole; a notice over it scrolls, which is rare.
 * Before the rework it opened at 640 by 693, the height the narrow rows needed (design §16.14).
 */
export const MEDIA_HEALTH_CONTENT_SIZE = { w: 960, h: 728 } as const;

/** The smallest box the three rows still fit in with their buttons beside their text. */
export const MEDIA_HEALTH_MIN_CONTENT_SIZE = { w: 480, h: 400 } as const;
