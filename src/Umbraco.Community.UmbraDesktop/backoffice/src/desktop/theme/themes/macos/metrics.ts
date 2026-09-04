/**
 * The macOS theme's geometry, factored out so the numbers JavaScript needs (`index.ts`'s
 * `metrics`) are computed from the same constants the CSS renders (`window.css.ts`,
 * `taskbar.css.ts`, `palette.ts`), rather than being a hand-copied literal that can silently
 * drift from what actually paints. This is exactly the failure that shipped once already:
 * `leadingControlsWidth` was written down as 124 while the CSS it described rendered 102.
 */

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
 * strip begins: the leading padding, the three lights, the three gaps between all four controls
 * (the lights and reload sit in one flex row), reload's extra margin, then reload's own width.
 * Derived rather than written down: this feeds `clampWindowPosition`, and a value that disagrees
 * with the CSS makes windows clamp wrong at the screen edges — which is exactly what happened when
 * it was a hand-computed literal (124, not the actual 102).
 */
export const MACOS_LEADING_CONTROLS_WIDTH =
  MACOS_TITLEBAR_PADDING +
  3 * MACOS_LIGHT_SIZE +
  3 * MACOS_CONTROL_GAP +
  MACOS_RELOAD_MARGIN +
  MACOS_RELOAD_SIZE;

/** Titlebar height. Feeds both `metrics.titlebarHeight` and the palette's pixel string. */
export const MACOS_TITLEBAR_HEIGHT = 30;

/** Height of the floating dock itself. Feeds the palette's `--umbradesktop-taskbar-height`. */
export const MACOS_TASKBAR_HEIGHT = 44;

/** The dock's bottom margin. Feeds the palette's `--umbradesktop-taskbar-margin`. */
export const MACOS_TASKBAR_BOTTOM_MARGIN = 10;

/**
 * Clearance above the dock's own box, on top of its height and bottom margin. Not itself present
 * in any rendered rule — a deliberate buffer, not a value derived from the CSS — so it stays a
 * named constant rather than folded into the sum below as an unexplained remainder.
 */
export const MACOS_TASKBAR_CLEARANCE = 8;

/**
 * Height reserved at the desktop's bottom edge for the dock: its own height, the margin that lifts
 * it off the edge, and clearance above that. Feeds `metrics.taskbarReserve`, the palette's
 * `--umbradesktop-taskbar-reserve`, and the matching fallback in `taskbar.css.ts`'s launcher rules.
 */
export const MACOS_TASKBAR_RESERVE = MACOS_TASKBAR_HEIGHT + MACOS_TASKBAR_BOTTOM_MARGIN + MACOS_TASKBAR_CLEARANCE;
