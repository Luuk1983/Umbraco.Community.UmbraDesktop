/**
 * The macOS theme's geometry, factored out so the numbers JavaScript needs (`index.ts`'s
 * `metrics`) are computed from the same constants the CSS renders (`window.css.ts`,
 * `taskbar.css.ts`, `palette.ts`), rather than being a hand-copied literal that can silently
 * drift from what actually paints. This is exactly the failure that shipped once already:
 * `leadingControlsWidth` was written down as 124 while the CSS it described rendered 102.
 */

/**
 * The window frame's border, in px, on every side. Feeds the palette's `--umbradesktop-window-border`.
 *
 * It counts toward the geometry below on both axes, which is easy to miss because it is painted by
 * a token rather than by this theme's own stylesheet: the ring sits outside `.titlebar`, so its
 * leading edge is as undraggable as the traffic lights and its top edge is as much of the window
 * as the caption.
 */
export const MACOS_WINDOW_BORDER = 1;

/**
 * The hairline under the caption, in px. Feeds the palette's
 * `--umbradesktop-titlebar-border-bottom`, in both variants — they differ in colour, never in
 * width, and a variant that changed the width would change where a dragged window stops.
 */
export const MACOS_TITLEBAR_BORDER = 1;

/** Padding inside the titlebar's leading edge, before the first traffic light. */
export const MACOS_TITLEBAR_PADDING = 10;

/** Diameter of each traffic light (close/minimize/maximize). */
export const MACOS_LIGHT_SIZE = 12;

/** Gap between adjacent controls, applied by the `.controls` flex container. */
export const MACOS_CONTROL_GAP = 8;

/** Width of the reload button, which is not a native macOS control. */
export const MACOS_RELOAD_SIZE = 22;

/** Extra space (beyond the flex gap) setting reload apart from the traffic-light cluster. */
export const MACOS_RELOAD_MARGIN = 10;

/**
 * How much of the titlebar's leading edge the controls occupy, and therefore where the draggable
 * strip begins: the frame's border ring, the leading padding, the three lights, the three gaps
 * between all four controls (the lights and reload sit in one flex row), reload's extra margin,
 * then reload's own width. Measured from the window's own left edge, because that is what a
 * `rect.x` places.
 *
 * Derived rather than written down: this feeds `clampWindowPosition`, and a value that disagrees
 * with the CSS makes windows clamp wrong at the screen edges — which is exactly what happened when
 * it was a hand-computed literal (124, not the actual 103). Deriving it fixed the bulk of that and
 * left one pixel behind, the frame ring, because the ring is painted through a palette token
 * rather than by this theme's own stylesheet and so was not among the constants being summed.
 * `metrics.test.ts` measures the rendered box, which is what caught the remainder.
 */
export const MACOS_LEADING_CONTROLS_WIDTH =
  MACOS_WINDOW_BORDER +
  MACOS_TITLEBAR_PADDING +
  3 * MACOS_LIGHT_SIZE +
  3 * MACOS_CONTROL_GAP +
  MACOS_RELOAD_MARGIN +
  MACOS_RELOAD_SIZE;

/**
 * The caption's own height, inside the frame ring. Feeds the palette's
 * `--umbradesktop-titlebar-height`, which sets a `min-height` on the content box.
 */
export const MACOS_TITLEBAR_HEIGHT = 30;

/**
 * How much of a window must stay on screen when it is dragged against the bottom edge: the frame
 * ring above the caption and the caption's own hairline as well as the caption itself, or the last
 * few pixels of the only grab handle a window has go under the dock with it. Feeds
 * `metrics.titlebarHeight`.
 */
export const MACOS_CAPTION_KEEP_VISIBLE = MACOS_WINDOW_BORDER + MACOS_TITLEBAR_HEIGHT + MACOS_TITLEBAR_BORDER;

/**
 * Height of the floating dock itself. Feeds the palette's `--umbradesktop-taskbar-height`, which
 * sets a plain `height` — a *content* height, since the base `.bar` is content-box (unlike Win98's,
 * which opts into `border-box` so its padding comes out of its declared height).
 */
export const MACOS_TASKBAR_HEIGHT = 48;

/**
 * The dock's top hairline, in px. Feeds the palette's `--umbradesktop-taskbar-border-top`, in both
 * variants.
 *
 * Called out because `MACOS_TASKBAR_HEIGHT` above is a content height: the dock actually occupies
 * one pixel more than it declares, and the reserve below has to cover the box, not the declaration.
 */
export const MACOS_TASKBAR_BORDER = 1;

/** The dock's bottom margin. Feeds the palette's `--umbradesktop-taskbar-margin`. */
export const MACOS_TASKBAR_BOTTOM_MARGIN = 10;

/**
 * Clearance above the dock's own box, on top of its height and bottom margin. Not itself present
 * in any rendered rule — a deliberate buffer, not a value derived from the CSS — so it stays a
 * named constant rather than folded into the sum below as an unexplained remainder.
 */
export const MACOS_TASKBAR_CLEARANCE = 8;

/**
 * Height reserved at the desktop's bottom edge for the dock: its own box — height plus the
 * hairline, which `MACOS_TASKBAR_HEIGHT` does not include — the margin that lifts it off the edge,
 * and clearance above that. Feeds `metrics.taskbarReserve`, the palette's
 * `--umbradesktop-taskbar-reserve`, and the matching fallback in `taskbar.css.ts`'s launcher rules.
 */
export const MACOS_TASKBAR_RESERVE =
  MACOS_TASKBAR_HEIGHT + MACOS_TASKBAR_BORDER + MACOS_TASKBAR_BOTTOM_MARGIN + MACOS_TASKBAR_CLEARANCE;
