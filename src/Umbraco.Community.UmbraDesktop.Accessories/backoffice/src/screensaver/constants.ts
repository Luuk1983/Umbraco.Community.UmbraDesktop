/**
 * Every number the screensaver needs in more than one place, or that is worth its reasoning.
 */

/** How often the watcher checks whether the desktop has been left alone, in ms. */
export const SCREENSAVER_CHECK_INTERVAL_MS = 1_000;

/**
 * How often the watcher looks for new iframe windows to listen in, in ms. A search through every
 * shadow root on the desktop is not free, and a window opened in the last few seconds is one
 * somebody is plainly using anyway.
 */
export const SCREENSAVER_FRAME_SCAN_INTERVAL_MS = 5_000;

/**
 * How far the pointer must move before the screensaver goes away, in px. Windows ignored the few
 * pixels a mouse drifts when a desk is knocked, and so does this; a click or a key always counts.
 */
export const SCREENSAVER_WAKE_DISTANCE_PX = 8;

/**
 * The longest step a saver is given, in ms. A tab that was in the background comes back with a
 * frame gap of minutes, and one step that long would fling every star past the viewer at once.
 */
export const SCREENSAVER_MAX_STEP_MS = 100;

/** The little monitor's screen, in px, in the classic 4:3. */
const SCREEN = { w: 192, h: 144 } as const;

/** The monitor's plastic around the screen, each side, in px. */
export const SCREENSAVER_BEZEL_PX = 10;

/** The monitor's stand under it, in px. */
export const SCREENSAVER_STAND_PX = 18;

/** The space between the settings box's rows, in px. */
export const SCREENSAVER_PADDING_PX = 12;

/** One row of controls: the saver list with Preview, or the wait. In px. */
export const SCREENSAVER_ROW_PX = 28;

/**
 * The line under the controls, saying what wakes the desktop, in px: three lines of the body size,
 * which is what it takes at the minimum width.
 */
export const SCREENSAVER_HINT_PX = 54;

/** The monitor, all of it, in px. */
const MONITOR = {
  w: SCREEN.w + 2 * SCREENSAVER_BEZEL_PX,
  h: SCREEN.h + 2 * SCREENSAVER_BEZEL_PX + SCREENSAVER_STAND_PX,
} as const;

/**
 * The preview monitor's sizes, in px. Only the monitor has any: the box it sits in is sized by Desktop
 * settings, about 360px up to the full width, and the column of controls beneath it flexes to fit.
 */
export const SCREENSAVER_MONITOR = {
  /** The monitor's screen. */
  screen: SCREEN,
  /** The monitor, bezel and stand included. */
  monitor: MONITOR,
} as const;
