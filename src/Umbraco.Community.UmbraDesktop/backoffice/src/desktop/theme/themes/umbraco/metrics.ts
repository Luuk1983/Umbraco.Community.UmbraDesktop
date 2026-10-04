/**
 * The numbers the Umbraco theme's own stylesheets and palette draw with, named once so the CSS and
 * the tests that measure it read the same value.
 *
 * This theme's *window geometry* is not here, and that is deliberate: the caption stays 40px, the
 * buttons stay 46px wide and the frame ring stays 1px, so `metrics` in `index.ts` is still the base
 * chrome's own `UMBRADESKTOP_DEFAULT_METRICS` and nothing the window manager clamps against moved.
 * What is here is paint: how round, how big a painted face, how big a tile.
 */

/** Corner radius of a window, in px. The same as the cards inside an Umbraco backoffice view. */
export const UMBRACO_WINDOW_RADIUS = 12;

/**
 * Diameter of the circle painted behind a caption button on hover, in px.
 *
 * Smaller than the button's own box on purpose: the box is the touch target (46 wide, the caption's
 * full height) and the circle is only what is drawn in it, which is the same trade the macOS
 * theme's traffic lights make. Painted by a `radial-gradient` in the hover token rather than by a
 * pseudo-element, so no new structure is added to the caption.
 */
export const UMBRACO_CONTROL_FACE = 30;

/**
 * Thickness of the coral line under the focused window's taskbar button, in px.
 *
 * The base draws three, edge to edge, and that was the heaviest thing on the bar. One pixel was tried
 * and was not pretty: a hairline across a whole button reads as a rule, and on a display scaled to
 * 125 or 150 percent a single pixel can render uneven. Two, as a short bar with soft ends, keeps the
 * section menu's marker and loses the weight.
 */
export const UMBRACO_TASK_LINE = 2;

/**
 * How far the coral line stops short of each side of its button, in px. A line that runs edge to edge
 * is a rule; one that stops short, with soft ends, is the underline under the active tab inside a
 * window, which is the thing this marker is meant to echo.
 */
export const UMBRACO_TASK_LINE_INSET = 8;

/** Corner radius of the hover tile on a taskbar button, in px. */
export const UMBRACO_TASK_TILE_RADIUS = 10;

/** Gap between a taskbar button's top edge and its hover tile, in px. */
export const UMBRACO_TASK_TILE_TOP = 6;

/** Gap between a taskbar button's side edges and its hover tile, in px. */
export const UMBRACO_TASK_TILE_SIDE = 3;

/**
 * Gap between a taskbar button's bottom edge and its hover tile, in px.
 *
 * More than the top gap, because the active window's coral line sits on the button's bottom edge
 * and the tile has to clear it: the line is 3px and this leaves it air.
 */
export const UMBRACO_TASK_TILE_BOTTOM = 9;

/** Corner radius of the box around a window and its attached windows, in px. */
export const UMBRACO_TASK_GROUP_RADIUS = 12;

/**
 * The narrowest a button is allowed to be, in px, as a touch target.
 *
 * Apple's guideline, which is the stricter of the usual two. Applied to width only: the caption's
 * and the taskbar's heights are their bars', and the bar is the target.
 */
export const UMBRACO_MIN_TOUCH = 44;
