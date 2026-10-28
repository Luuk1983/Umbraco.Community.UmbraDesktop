/**
 * The Media Health app's manifest alias and sizes (design §3), in a module of their own so the
 * manifests can name the app without loading the window.
 */

/** The app's alias: what the launcher tile and a favourite pin, final once shipped. */
export const UMBRADESKTOP_MEDIA_HEALTH_APP = 'Umbraco.Community.UmbraDesktop.Media.Health';

/**
 * The window's opening content box, in px, measured rather than taken from the mock (desktop-apps.md
 * §2.1: the desktop adds the chrome). The overview with three rows and three folders, read in a real
 * backoffice on 2026-10-28 (design §16.10), measured again once the thumbnails moved under each row's
 * words (design §16.13): its scroll height was 675 under the Umbraco theme and 676 under the tallest,
 * Umbraco 4, macOS, Windows 11 and Windows 98 alike, at 640 wide. So the overview opens whole, with no
 * scrollbar, under every theme; a notice over it (a check over a day old) scrolls, which is rare.
 */
export const MEDIA_HEALTH_CONTENT_SIZE = { w: 640, h: 676 } as const;

/** The smallest box the three rows still fit in with their buttons beside their text. */
export const MEDIA_HEALTH_MIN_CONTENT_SIZE = { w: 480, h: 400 } as const;
