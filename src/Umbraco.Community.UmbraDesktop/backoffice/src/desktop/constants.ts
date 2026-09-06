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
 * Width of one window control button, in px. Interpolated into `.ctrl`'s `width` in
 * `window.element` as the fallback behind `--umbradesktop-control-width`, so a theme can widen the
 * buttons and this stays what the Umbraco theme itself paints.
 */
export const UMBRADESKTOP_CONTROL_WIDTH = 46;

/**
 * Window buttons in the titlebar: reload, minimize, maximize, close.
 *
 * Written down because it is the number that silently went stale: `trailing` below was computed by
 * hand when there were three, and reload was added as a fourth without anybody revisiting the sum.
 * Counting them here, next to the width, is what makes adding a fifth a one-line change rather
 * than a bug nobody notices until a window is dragged into the right edge.
 */
export const UMBRADESKTOP_CONTROL_COUNT = 4;

/**
 * The window frame's border, in px, on every side. Interpolated into `.frame`'s `border` in
 * `window.element` as the fallback behind `--umbradesktop-window-border`.
 *
 * It counts toward the geometry below, on both axes: the ring is outside `.titlebar`, so its right
 * edge is as undraggable as the buttons and its top edge is as much of the window as the caption.
 */
export const UMBRADESKTOP_WINDOW_BORDER = 1;

/**
 * The titlebar's content height in px — the `min-height` behind `--umbradesktop-titlebar-height`
 * in `window.element`, which is what governs, since nothing the caption holds is this tall.
 */
export const UMBRADESKTOP_TITLEBAR_HEIGHT = 40;

/**
 * The hairline under the caption, in px, behind `--umbradesktop-titlebar-border-bottom`. Part of
 * `.titlebar`'s own box — and so part of the drag handle — rather than of the body below it.
 */
export const UMBRADESKTOP_TITLEBAR_BORDER = 1;

/**
 * What must stay inside the desktop while dragging, under the Umbraco theme.
 *
 * `trailing` is the non-draggable band at the titlebar's right end, measured from the window's own
 * right edge: the frame's border ring plus the four window buttons (reload, minimize, maximize,
 * close), none of which can start a drag — `.controls` swallows `pointerdown` so its buttons stay
 * clickable. `titlebar` is the matching band at the top: the frame's border plus the caption and
 * its own bottom hairline, measured from the window's top, because that is where a `rect.y` puts
 * it.
 *
 * Both are **derived, never typed**, for the reason `docs/theming.md` §4 gives: these numbers feed
 * `clampWindowPosition`, and one that disagrees with the CSS strands windows at the screen edges.
 * `trailing` was a hand-written `138` — three buttons — for as long as the titlebar has rendered
 * four, so a window dragged hard right kept 46px less draggable caption than `grab` asks for,
 * about half of it. `themes/umbraco/metrics.test.ts` now measures the rendered boxes and holds
 * these values against them, which is the only check that catches the next such addition.
 *
 * This is the Umbraco theme's own geometry — see `theme/themes/umbraco`, which reports these same
 * numbers back out as its `metrics` — and it is also what `window-manager.context`'s `#keep`
 * starts as, before any theme has resolved and called `setMetrics`. Every theme now publishes its
 * own metrics this way (see `theme/themes/macos`, whose geometry differs from this one), so this
 * constant is no longer the only geometry in play — just this theme's contribution to it, doubling
 * as the safe default before one is chosen.
 */
export const UMBRADESKTOP_WINDOW_KEEP_VISIBLE = {
  grab: 80,
  leading: 0,
  trailing: UMBRADESKTOP_WINDOW_BORDER + UMBRADESKTOP_CONTROL_COUNT * UMBRADESKTOP_CONTROL_WIDTH,
  titlebar: UMBRADESKTOP_WINDOW_BORDER + UMBRADESKTOP_TITLEBAR_HEIGHT + UMBRADESKTOP_TITLEBAR_BORDER,
};
