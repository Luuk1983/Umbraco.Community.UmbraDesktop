import type { UmbraDesktopThemeMetrics } from './theme/types';

/** Alias of the UmbraDesktop backoffice section. */
export const UMBRADESKTOP_SECTION_ALIAS = 'Umbraco.Community.UmbraDesktop.Section';

/**
 * Fallback icon for an app with no icon of its own: neither the catalogue entry nor its referenced
 * manifest for a curated entry, nor `meta.icon` for a registered one. One constant because it is
 * one promise to a user ("every tile has some icon"), read by both `derive-apps.ts` (catalogue
 * fallback) and `registered-apps.ts` (registered-app normalisation) rather than typed twice and
 * risking the two derivations disagreeing on what "no icon" renders as.
 */
export const UMBRADESKTOP_DEFAULT_ICON = 'icon-box';

/** URL segment for the section (…/umbraco/section/<pathname>). */
export const UMBRADESKTOP_SECTION_PATHNAME = 'umbradesktop';

/**
 * The attribute carrying the active chrome theme's id onto a self-contained app.
 *
 * A published contract, not an implementation detail: an app branches on it with
 * `:host([data-umbradesktop-theme='win98'])` when a theme's difference is structural rather than a
 * colour, which is the one thing the app token group cannot express (design §6.2, D9). It is an
 * ancestor selector everywhere else — `:host-context` — and that has never shipped in Firefox,
 * which is why the id is stamped on the app's own element rather than offered further up the tree.
 *
 * Named here because it is written in three places that must agree, and two of them are outside
 * this repository's control: `app-host.element` stamps it on the app, `window.element` stamps it on
 * the host for an app that renders into light DOM and so has no `:host` to select with, and the
 * app's own stylesheet selects on it. The one place that cannot read this constant is
 * `window.element`'s template, since Lit's `html` interpolates attribute *values* and not their
 * names; `window-body.test.ts` reads the rendered attribute back through this constant, so a
 * literal that drifts from it fails a test rather than quietly killing every app's selector.
 */
export const UMBRADESKTOP_THEME_ATTRIBUTE = 'data-umbradesktop-theme';

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
 * How long a window body gets to load before the desktop stops waiting on it.
 *
 * One number for both kinds of body, because it is one judgement about one user: a window has
 * already opened, so the only choice left is between "still loading" and "this is not coming", and
 * a shell that ran out of patience at two different moments depending on which kind of app was
 * opened would be arbitrary from the outside. It is a safety net on the iframe path (reveal the
 * frame anyway if the booting backoffice never reports its chrome stripped, see `#onIframeLoad` in
 * `window.element`) and a verdict on the element path (give up on the dynamic import and say so,
 * see `app-host.element`), but the deadline is the same deadline.
 *
 * Long enough that a cold chunk fetch on a slow connection is not called a failure, short enough
 * that nobody sits in front of an empty window wondering. Before this constant existed the element
 * path had a named, documented `APP_LOAD_TIMEOUT_MS` of its own while the iframe path in
 * `window.element.ts` had a bare `12000`, so the same deadline was stated twice in two places with
 * only one of them saying why. That is what "derive numbers, never type them" is about here: their
 * whole justification is that they are the same number.
 */
export const UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS = 12_000;

/**
 * The smallest **content** box the desktop asks for on behalf of an app that named none, in px.
 *
 * Content and not window: `defaultSize`/`minSize` are an app's content box everywhere now (see
 * `window-chrome.ts`), so the fallback for an app that declares no minimum is a content box too,
 * and the chrome is added to it like anybody else's. It is a comfort floor rather than a
 * correctness one — the correctness floor is what the chrome itself needs, which is derived from
 * the active theme's metrics and applied on top of this.
 *
 * Also interpolated into the window frame's own CSS `min-width`/`min-height` in `window.element`,
 * which is what governs a **maximized** window, whose inline style carries no minimum. Those were
 * two literals with a comment saying they had to be kept in sync with this constant by hand.
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
 * Diameter of the unsaved-changes dot in the titlebar, in px, behind
 * `--umbradesktop-titlebar-dirty-size`.
 *
 * Interpolated into `.dirty` in `window.element` rather than written there, so this file stays the
 * one place the caption's geometry is stated. It does **not** enter
 * `UMBRADESKTOP_WINDOW_KEEP_VISIBLE`: the marker sits inside `.title`, which is the draggable part
 * of the caption, so it takes nothing away from the grab strip.
 */
export const UMBRADESKTOP_UNSAVED_MARKER_SIZE = 8;

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

/**
 * What the base chrome costs an app: the caption and its hairline, and **nothing** horizontally.
 *
 * The zero is a fact about `box-sizing` rather than about there being no frame. `.frame` sizes
 * content-box, so the border ring is painted outside the width the window manager set and takes
 * none of it from the app — where Win98's ring is `border-box` padding and comes straight out of
 * the rect. That difference is exactly why this is a per-theme metric and not one number in the
 * chrome, and why {@link UmbraDesktopThemeMetrics.chromeHeight} is not simply `titlebarHeight`:
 * that one counts the ring above the caption, which this must not.
 *
 * Deliberately *not* summed from `UMBRADESKTOP_WINDOW_KEEP_VISIBLE.titlebar` minus a border, even
 * though the two happen to be a border apart today. They answer different questions — one is what
 * stays grabbable when a window is dragged off the bottom edge, the other is what an app's box does
 * not get — and a subtraction between them would read as arithmetic rather than as two facts.
 */
export const UMBRADESKTOP_WINDOW_CHROME = {
  w: 0,
  h: UMBRADESKTOP_TITLEBAR_HEIGHT + UMBRADESKTOP_TITLEBAR_BORDER,
};

/**
 * The geometry in force before any theme has resolved, which is also the Umbraco theme's own.
 *
 * One object with two jobs, and they are the same numbers by construction rather than by
 * agreement: `theme/themes/umbraco` publishes this as its `metrics` (its palettes are empty, so
 * every number it describes belongs to the base chrome and its CSS fallbacks — see that file), and
 * the window manager and window element both start here until `setMetrics` arrives. Before this
 * existed the theme restated each field from the same constants, which is one edit away from the
 * two disagreeing about what "no theme yet" looks like.
 */
export const UMBRADESKTOP_DEFAULT_METRICS: UmbraDesktopThemeMetrics = {
  titlebarHeight: UMBRADESKTOP_WINDOW_KEEP_VISIBLE.titlebar,
  leadingControlsWidth: UMBRADESKTOP_WINDOW_KEEP_VISIBLE.leading,
  trailingControlsWidth: UMBRADESKTOP_WINDOW_KEEP_VISIBLE.trailing,
  grab: UMBRADESKTOP_WINDOW_KEEP_VISIBLE.grab,
  chromeWidth: UMBRADESKTOP_WINDOW_CHROME.w,
  chromeHeight: UMBRADESKTOP_WINDOW_CHROME.h,
  taskbarReserve: UMBRADESKTOP_TASKBAR_HEIGHT,
};
