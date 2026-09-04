/** Alias of the UmbraDesktop backoffice section. */
export const UMBRADESKTOP_SECTION_ALIAS = 'Umbraco.Community.UmbraDesktop.Section';

/** URL segment for the section (…/umbraco/section/<pathname>). */
export const UMBRADESKTOP_SECTION_PATHNAME = 'umbradesktop';

/**
 * Height of the taskbar/panel in pixels.
 *
 * The chrome no longer reads this directly — it takes its height from
 * `--umbradesktop-taskbar-height`, whose CSS fallback is this same number written as a literal in
 * `taskbar.element` and `desktop.element`. Its one consumer is the Umbraco theme
 * (`theme/themes/umbraco`), which reports it back out as `metrics.taskbarReserve` so that value
 * and the CSS fallback stay a single source rather than two literals to keep in sync by hand.
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
 * What must stay inside the desktop while dragging, under the Umbraco theme. `trailing` is the
 * width of the three window buttons (3 × 46px) at the titlebar's right end, which are not
 * draggable; `titlebar` is the bar's own height. These are the only values in play today — no
 * theme context exists yet to vary them. A later milestone is intended to add one so each theme
 * can supply its own titlebar geometry; until then this constant is what every theme gets.
 */
export const UMBRADESKTOP_WINDOW_KEEP_VISIBLE = { grab: 80, leading: 0, trailing: 138, titlebar: 40 };
