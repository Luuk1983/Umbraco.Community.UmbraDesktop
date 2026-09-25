/**
 * Every number Disk Cleanup needs in more than one place. Separate from the element so the manifest
 * can read the content size without pulling the app into the bundle's main chunk.
 */

/** The app's own padding, and the gap between its parts, in px. */
export const DISK_CLEANUP_PADDING_PX = 10;

/** The line at the top saying what the window is for, in px: two lines of body text beside an icon. */
export const DISK_CLEANUP_INTRO_PX = 40;

/** A caption over the list or the description box, in px. */
export const DISK_CLEANUP_CAPTION_PX = 18;

/** One bin's row in the list, in px. */
export const DISK_CLEANUP_ROW_PX = 30;

/**
 * One line of the description, in px, set on the box rather than inherited.
 *
 * It was inherited, and the box's height assumed about 19px a line. The backoffice's text runs on
 * a line height of up to 21px, so three lines overflowed the box and it showed a scroll bar. Fixed
 * here, the box's height is a count of lines this app controls.
 */
export const DISK_CLEANUP_DESCRIPTION_LINE_PX = 17;

/**
 * How many lines the description box holds. Four: the longest description, the media bin's in
 * Dutch, wraps to four at the minimum width.
 */
export const DISK_CLEANUP_DESCRIPTION_LINES = 4;

/** The description box, in px: {@link DISK_CLEANUP_DESCRIPTION_LINES} lines. */
export const DISK_CLEANUP_DESCRIPTION_PX = DISK_CLEANUP_DESCRIPTION_LINE_PX * DISK_CLEANUP_DESCRIPTION_LINES;

/** The buttons, in px. */
export const DISK_CLEANUP_BUTTONS_PX = 28;

/**
 * The status under the buttons, in px: three lines of small text, since a refusal for both bins is
 * two sentences and a refusal cut off by an ellipsis is one nobody can act on.
 */
export const DISK_CLEANUP_STATUS_PX = 48;

/** How many bins the list holds. */
const BINS = 2;

/** The column's height: every part above, with a gap between each. */
const HEIGHT =
  DISK_CLEANUP_PADDING_PX * 2 +
  DISK_CLEANUP_INTRO_PX +
  DISK_CLEANUP_CAPTION_PX * 2 +
  (DISK_CLEANUP_ROW_PX * BINS + 2) +
  DISK_CLEANUP_DESCRIPTION_PX +
  DISK_CLEANUP_BUTTONS_PX +
  DISK_CLEANUP_STATUS_PX +
  DISK_CLEANUP_PADDING_PX * 6;

/** The content box Disk Cleanup opens at. Nothing in it grows, so only the width has room to spare. */
export const DISK_CLEANUP_CONTENT_SIZE = { w: 420, h: HEIGHT } as const;

/** The smallest content box: a bin's name and its count still on one line. */
export const DISK_CLEANUP_MIN_CONTENT_SIZE = { w: 340, h: HEIGHT } as const;
