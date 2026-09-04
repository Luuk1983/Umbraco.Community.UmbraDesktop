import {
  UMBRADESKTOP_CONTROL_COUNT,
  UMBRADESKTOP_CONTROL_WIDTH,
  UMBRADESKTOP_WINDOW_BORDER,
} from '../../../constants.js';

/**
 * The Windows 11 theme's geometry, factored out so the numbers JavaScript needs (`index.ts`'s
 * `metrics`) are computed from the same constants the CSS renders, rather than being hand-copied
 * literals that can silently drift from what actually paints. `metrics.test.ts` closes the
 * remaining gap by measuring the rendered boxes in a browser.
 *
 * This theme reuses three shared constants rather than restating them, which none of the other
 * pastiches could: `UMBRADESKTOP_CONTROL_WIDTH` is 46, and 46x32 happens to be the exact size
 * Windows 11 draws its caption buttons — the chrome's own default was already this metric. Taking
 * it from the constant means a change there reaches this theme too, instead of leaving a stale 46
 * behind in a second place.
 */

/** The window frame's border, in px. Unchanged from the chrome's own default. */
export const W11_WINDOW_BORDER = UMBRADESKTOP_WINDOW_BORDER;

/**
 * The caption's height, in px. Windows 11 draws a 32px caption, eight shorter than the Umbraco
 * theme's 40 — part of why its windows read as tighter than the backoffice's own chrome.
 */
export const W11_TITLEBAR_HEIGHT = 32;

/**
 * The hairline under the caption, in px — **zero**, because Windows 11 does not draw one. Its
 * caption is the same surface as the window body, and the whole title area reads as one unbroken
 * plane; a divider is the single clearest tell that a window is not Win11.
 *
 * Named rather than dropped, so it stays a term in the sum below. A zero that is written down is
 * a decision; a zero that was never added is the kind of omission `metrics.test.ts` exists to
 * catch, and it caught exactly this class of mistake twice on the Umbraco 4 theme.
 */
export const W11_TITLEBAR_BORDER = 0;

/**
 * How much of a window must stay on screen when it is dragged against the bottom edge: the
 * frame's top border, the caption, and the caption's own hairline. Feeds `metrics.titlebarHeight`.
 */
export const W11_CAPTION_KEEP_VISIBLE =
  W11_WINDOW_BORDER + W11_TITLEBAR_HEIGHT + W11_TITLEBAR_BORDER;

/**
 * The non-draggable band at the caption's trailing end: the frame's border and the four buttons.
 *
 * No separating gap before reload, unlike the Umbraco 4 theme. Windows 11 draws its caption
 * buttons as one contiguous run with no divisions in it, and reload sitting flush at the head of
 * that run is closer to right than a gap that no Windows caption has ever had.
 */
export const W11_TRAILING_CONTROLS_WIDTH =
  W11_WINDOW_BORDER + UMBRADESKTOP_CONTROL_COUNT * UMBRADESKTOP_CONTROL_WIDTH;

/**
 * Height of the taskbar. Windows 11's is 48px and flush with the bottom edge — full width, not a
 * floating dock, which is the cheapest way to tell this theme apart from the macOS one at a
 * glance. Reserve therefore equals height: no margin beneath it to account for.
 */
export const W11_TASKBAR_HEIGHT = 48;

/** The bar's inner padding, and the gap between the buttons sitting in it. */
export const W11_TASKBAR_PADDING = 4;

/** Side of a taskbar button. Square, because the bar shows icons without labels. */
export const W11_TASK_SIZE = 40;

/** Width of the accent bar under the focused window's task button. */
export const W11_TASK_MARKER_WIDTH = 16;

/** Height of that bar, and its distance from the button's bottom edge. */
export const W11_TASK_MARKER_HEIGHT = 3;

/**
 * Draggable caption that must stay on screen, in px. The Umbraco theme's value, unchanged: a
 * comfort budget rather than a consequence of this theme's geometry.
 */
export const W11_GRAB = 80;

/**
 * Width of the Start panel. Windows 11's is a fixed centred card rather than a corner menu or a
 * full-screen surface, and 640px is close to what it draws at default scaling.
 */
export const W11_LAUNCHER_WIDTH = 640;

/**
 * The gap Windows 11 leaves between the Start panel and the taskbar. It is what makes the panel
 * read as floating above the bar rather than growing out of it, and it is the reason this theme
 * sets `--umbradesktop-launcher-bottom` explicitly instead of letting it default to the reserve.
 */
export const W11_LAUNCHER_GAP = 12;

/** Clearance above the panel, so a tall catalogue stops short of the top of the screen. */
export const W11_LAUNCHER_TOP_CLEARANCE = 24;
