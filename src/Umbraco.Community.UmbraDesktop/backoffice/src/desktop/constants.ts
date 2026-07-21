/** Alias of the UmbraDesktop backoffice section. */
export const UMBRADESKTOP_SECTION_ALIAS = 'Umbraco.Community.UmbraDesktop.Section';

/** URL segment for the section (…/umbraco/section/<pathname>). */
export const UMBRADESKTOP_SECTION_PATHNAME = 'umbradesktop';

/** Height of the taskbar/panel in pixels. */
export const UMBRADESKTOP_TASKBAR_HEIGHT = 50;

/** Reserved category alias that collects uncertified section-fallback apps. */
export const UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS = 'umbradesktop-more';

/** Display label of the reserved uncertified category. */
export const UMBRADESKTOP_UNCERTIFIED_CATEGORY_LABEL = 'More';

/** Sort weight that keeps the uncertified category last (ascending sort, large value). */
export const UMBRADESKTOP_UNCERTIFIED_CATEGORY_WEIGHT = 9999;

/**
 * Minimum window size in px, used by resize clamping. Kept in sync with the window
 * frame's CSS `min-width`/`min-height` (which are declared as literals in window.element).
 */
export const UMBRADESKTOP_WINDOW_MIN_SIZE = { w: 320, h: 200 };
