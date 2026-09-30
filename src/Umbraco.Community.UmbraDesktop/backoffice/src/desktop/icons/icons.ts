import type { UmbIconDictionary } from '@umbraco-cms/backoffice/icon';

/** The glyph for going full screen: four arrows out to the corners. */
export const UMBRADESKTOP_ICON_FULLSCREEN = 'icon-umbradesktop-fullscreen';

/** The glyph for leaving full screen: four arrows in from the corners. */
export const UMBRADESKTOP_ICON_EXIT_FULLSCREEN = 'icon-umbradesktop-exit-fullscreen';

/**
 * The glyphs the desktop draws that Umbraco does not ship, one module each so the registry fetches
 * a glyph only when something first draws it, the way core's own dictionary does.
 *
 * Every one is `hidden`: they are the desktop's controls, not pictures of content, so they stay out
 * of the icon picker an editor uses for document types. Hidden still resolves, it only keeps the
 * name off the picker's list.
 *
 * The names are exported for the features that draw them, rather than written out a second time
 * there, so a renamed glyph cannot leave a button drawing an empty square.
 */
const icons: UmbIconDictionary = [
  { name: UMBRADESKTOP_ICON_FULLSCREEN, hidden: true, path: () => import('./fullscreen.js') },
  { name: UMBRADESKTOP_ICON_EXIT_FULLSCREEN, hidden: true, path: () => import('./exit-fullscreen.js') },
];

export default icons;
