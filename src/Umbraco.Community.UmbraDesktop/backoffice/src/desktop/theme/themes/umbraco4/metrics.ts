/**
 * The Umbraco 4 theme's geometry, factored out so the numbers JavaScript needs (`index.ts`'s
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
 * The window frame's border, in px. Unlike Win98, which paints a raised ring out of layered
 * bevels and therefore needs `border: none` plus padding, Umbraco 4 draws a genuine hairline —
 * so this stays on the base's `--umbradesktop-window-border` and is part of the band the drag
 * clamp has to account for.
 */
export const U4_WINDOW_BORDER = 1;

/**
 * The pane header's height, inside the frame's border. Taken from v4's content-pane title row,
 * which is the only window-chrome antecedent the backoffice had — it never shipped a modal with
 * a titlebar of its own.
 */
export const U4_TITLEBAR_HEIGHT = 25;

/**
 * How much of a window must stay on screen when it is dragged against the bottom edge: the
 * frame's top border as well as the header itself, or the last row of pixels of the only grab
 * handle a window has would go under the taskbar with it. Feeds `metrics.titlebarHeight`.
 */
export const U4_CAPTION_KEEP_VISIBLE = U4_WINDOW_BORDER + U4_TITLEBAR_HEIGHT;

/**
 * Width of each window button. Wider than Win98's 20px because these are flat icon buttons that
 * only draw an edge on hover, and a target with no permanent border needs more room around its
 * glyph to read as a button at all.
 */
export const U4_CONTROL_WIDTH = 26;

/**
 * The gap after reload, separating it from the minimize/maximize/close trio. Umbraco 4 had no
 * reload control — nothing in a 2009 web backoffice did — so it should not read as a fourth
 * window button, and v4's own toolbars separated groups exactly this way.
 */
export const U4_CONTROL_GAP = 4;

/** Window buttons in the titlebar: reload, minimize, maximize, close. */
export const U4_CONTROL_COUNT = 4;

/**
 * The non-draggable band at the titlebar's trailing end, and therefore where the draggable strip
 * stops: the frame's border, the four buttons, and reload's separating gap.
 *
 * Derived rather than written down, because this feeds `clampWindowPosition`: the clamp keeps
 * `grab + trailing` px of a window on screen when it is dragged off the right edge, so a value
 * that disagrees with the CSS leaves either less draggable titlebar than intended or none at all.
 *
 * The controls stay flush with the frame's top-right corner, as the base renders them — v4 inset
 * its toolbar buttons, but a corner target is worth more than the fidelity, and insetting them
 * would widen this band for nothing.
 */
export const U4_TRAILING_CONTROLS_WIDTH =
  U4_WINDOW_BORDER + U4_CONTROL_COUNT * U4_CONTROL_WIDTH + U4_CONTROL_GAP;

/**
 * Height of the taskbar. Feeds the palette's `--umbradesktop-taskbar-height`, its
 * `--umbradesktop-taskbar-reserve`, and `metrics.taskbarReserve`.
 *
 * Reserve equals height, as in Win98 and unlike the macOS dock: the bar is flush with the bottom
 * edge with no margin under it, so it occupies exactly its own height and nothing more.
 */
export const U4_TASKBAR_HEIGHT = 32;

/** The bar's inner padding, which is also the gap between the buttons sitting in it. */
export const U4_TASKBAR_PADDING = 3;

/**
 * Draggable titlebar that must stay on screen, in px. The Umbraco theme's value, unchanged: it is
 * a comfort budget rather than a consequence of this theme's geometry, and 80px of header is as
 * grabbable here as it is under Umbraco.
 */
export const U4_GRAB = 80;

/**
 * Width of the launcher panel. Wider than Win98's 224px menu because this one is two stacked
 * idioms rather than one list — a Favourites grid of four columns above a grouped tree — and
 * narrower than the base's roomy multi-column card canvas, because v4's Sections panel was a
 * corner panel, not a full-screen surface.
 */
export const U4_LAUNCHER_WIDTH = 320;

/**
 * Vertical space the launcher leaves above itself, so the panel stops short of the very top of
 * the screen instead of butting against it. Feeds `--umbradesktop-launcher-max-height`, which is
 * measured from the viewport top down to the bar.
 */
export const U4_LAUNCHER_TOP_CLEARANCE = 16;
