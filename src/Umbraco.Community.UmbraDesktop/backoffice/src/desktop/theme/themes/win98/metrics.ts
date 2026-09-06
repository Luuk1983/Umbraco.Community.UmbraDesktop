/**
 * The Win98 theme's geometry, factored out so the numbers JavaScript needs (`index.ts`'s
 * `metrics`) are computed from the same constants the CSS renders (`window.css.ts`,
 * `taskbar.css.ts`, `palette.ts`), rather than being hand-copied literals that can silently drift
 * from what actually paints. That drift is not hypothetical: the macOS theme shipped a
 * hand-computed `leadingControlsWidth` of 124 describing CSS that rendered 102, and a window
 * dragged into a corner became unreachable.
 *
 * `metrics.test.ts` closes the remaining gap by measuring the rendered boxes in a browser and
 * holding the published metrics against them — deriving keeps these numbers consistent with each
 * other, but only measuring keeps them consistent with the CSS.
 */

/**
 * Depth of a Win98 double bevel: an outer highlight/shadow pixel and an inner one, on all four
 * sides. Every raised, pressed and sunken edge in this theme is two pixels of layered `inset`
 * box-shadow, and this is that two.
 */
export const WIN98_BEVEL_DEPTH = 2;

/**
 * The window frame's border ring, in px: the double bevel plus one pixel of button face inside it,
 * which is what makes a Win98 window edge read as a raised object rather than a hairline.
 *
 * Also what the frame's `padding` is set to, so the bevel has somewhere to paint — `.titlebar` and
 * `.bodywrap` would otherwise cover it — and therefore part of the non-draggable band at the
 * titlebar's trailing end. Coupled to {@link WIN98_BEVEL_DEPTH} on purpose: a deeper bevel needs a
 * wider ring or it disappears under the content.
 */
export const WIN98_FRAME_BORDER = WIN98_BEVEL_DEPTH + 1;

/** The caption bar's own height, inside the frame ring. Feeds the palette's pixel string. */
export const WIN98_TITLEBAR_HEIGHT = 22;

/**
 * How much of a window must stay on screen when it is dragged against the bottom edge: the frame
 * ring above the caption as well as the caption itself, or the last few pixels of the only grab
 * handle a window has would go under the taskbar with it. Feeds `metrics.titlebarHeight`.
 */
export const WIN98_CAPTION_KEEP_VISIBLE = WIN98_FRAME_BORDER + WIN98_TITLEBAR_HEIGHT;

/** Width of each window button. Feeds the palette's `--umbradesktop-control-width`. */
export const WIN98_CONTROL_WIDTH = 20;

/** Height of each window button, leaving a pixel of caption above and below it. */
export const WIN98_CONTROL_HEIGHT = WIN98_TITLEBAR_HEIGHT - 2 * WIN98_BEVEL_DEPTH;

/**
 * The 2px Win98 uses everywhere it sets one control apart from another: after reload (which is not
 * a Win98 control and should not read as a fourth one), before close (as Win98 itself separates
 * close from the minimize/maximize pair), and between the cluster and the frame's right edge.
 */
export const WIN98_CONTROL_GAP = 2;

/** Window buttons in the titlebar: reload, minimize, maximize, close. */
export const WIN98_CONTROL_COUNT = 4;

/**
 * How many {@link WIN98_CONTROL_GAP}s fall inside the trailing band: reload's trailing gap,
 * close's leading gap, and the cluster's own inset from the frame.
 */
const WIN98_CONTROL_GAPS = 3;

/**
 * The non-draggable band at the titlebar's trailing end, and therefore where the draggable strip
 * stops: the frame's border ring, the four buttons, and the three gaps between and after them.
 *
 * Derived rather than written down, because this feeds `clampWindowPosition`: the clamp keeps
 * `grab + trailing` px of a window on screen when it is dragged off the right edge, so a value
 * that disagrees with the CSS leaves either less draggable titlebar than intended or none at all.
 */
export const WIN98_TRAILING_CONTROLS_WIDTH =
  WIN98_FRAME_BORDER +
  WIN98_CONTROL_COUNT * WIN98_CONTROL_WIDTH +
  WIN98_CONTROL_GAPS * WIN98_CONTROL_GAP;

/**
 * Height of the taskbar. Feeds the palette's `--umbradesktop-taskbar-height`, its
 * `--umbradesktop-taskbar-reserve`, and `metrics.taskbarReserve`.
 *
 * Reserve equals height here, unlike the macOS dock: the bar is flush with the bottom edge with no
 * margin under it, so it occupies exactly its own height and nothing more.
 */
export const WIN98_TASKBAR_HEIGHT = 30;

/** The bar's inner padding, which is also the gap between the buttons sitting in it. */
export const WIN98_TASKBAR_PADDING = 2;

/**
 * Draggable titlebar that must stay on screen, in px. The Umbraco theme's value, unchanged: it is
 * a comfort budget rather than a consequence of this theme's geometry, and 80px of caption is as
 * grabbable under Win98 as it is under Umbraco.
 */
export const WIN98_GRAB = 80;

/**
 * Vertical space the start menu leaves above itself, so a tall menu stops short of the very top of
 * the screen instead of butting against it. Feeds `--umbradesktop-launcher-max-height`, which is
 * measured from the viewport top down to the bar.
 */
export const WIN98_LAUNCHER_TOP_CLEARANCE = 16;

/** Width of the start menu panel. Narrow, because it is a vertical list rather than a card grid. */
export const WIN98_LAUNCHER_WIDTH = 224;
