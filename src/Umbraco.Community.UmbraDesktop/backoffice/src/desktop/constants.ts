/** Alias of the UmbraDesktop backoffice section. */
export const UMBRADESKTOP_SECTION_ALIAS = 'Umbraco.Community.UmbraDesktop.Section';

/** URL segment for the section (…/umbraco/section/<pathname>). */
export const UMBRADESKTOP_SECTION_PATHNAME = 'umbradesktop';

/**
 * Height of the taskbar/panel in pixels.
 *
 * The chrome no longer reads this directly — it takes its height from
 * `--umbradesktop-taskbar-height`, whose CSS fallback is this same number written as a literal in
 * `taskbar.element` and `desktop.element`. Change one and you must change the others, until the
 * theme catalogue makes this constant the Umbraco theme's `taskbarReserve` and closes the gap.
 */
export const UMBRADESKTOP_TASKBAR_HEIGHT = 50;

/** Reserved group alias that collects uncurated / fallback apps. */
export const UMBRADESKTOP_MORE_GROUP_ALIAS = 'umbradesktop-more';

/** Localization token for the reserved "More" group label. */
export const UMBRADESKTOP_MORE_GROUP_LABEL = '#umbraDesktop_groupMore';

/** Sort weight that keeps the "More" group last (ascending sort, large value). */
export const UMBRADESKTOP_MORE_GROUP_WEIGHT = 9999;

/**
 * Minimum window size in px, used by resize clamping. Kept in sync with the window
 * frame's CSS `min-width`/`min-height` (which are declared as literals in window.element).
 */
export const UMBRADESKTOP_WINDOW_MIN_SIZE = { w: 320, h: 200 };

/**
 * What must stay inside the desktop while dragging, so a window can always be grabbed back. All
 * three are kept in sync with window.element's CSS: `controls` is the width of the three window
 * buttons (3 × 46px) at the titlebar's right end, which are not draggable, so a window hanging off
 * the left edge has to spare `grab` px of titlebar beside them; `titlebar` is the bar's own height.
 */
export const UMBRADESKTOP_WINDOW_KEEP_VISIBLE = { grab: 80, controls: 138, titlebar: 40 };
