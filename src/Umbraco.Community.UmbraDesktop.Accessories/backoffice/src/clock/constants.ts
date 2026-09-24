/**
 * Every number Clock needs in more than one place. Separate from the element so the manifest can
 * read the content size without pulling the app into the bundle's main chunk.
 */

/** The face's diameter at the default window size, in px. It grows with the window. */
export const CLOCK_FACE_PX = 200;

/**
 * The smallest face, in px: the size at which the twelve hour marks are still separate marks and
 * the hands are still told apart by length.
 */
export const CLOCK_MIN_FACE_PX = 120;

/** The app's own padding, and the space between the face and the words under it, in px. */
export const CLOCK_PADDING_PX = 12;

/** Height of the digital time line, in px. */
export const CLOCK_TIME_HEIGHT_PX = 36;

/** Height of the date line, in px. */
export const CLOCK_DATE_HEIGHT_PX = 20;

/**
 * The width the words under the face need, in px.
 *
 * The date line is the wide one: a long weekday and month in full, like "Wednesday 24 September
 * 2026", at the theme's body size. The face is narrower than that at its smallest, so this rather
 * than the face sets the minimum width.
 */
export const CLOCK_TEXT_WIDTH_PX = 240;

/**
 * Content size for a face of `face` px: the face and the two lines of words under it, padded.
 * @param face The face's diameter.
 * @returns The content box.
 */
function contentFor(face: number): { w: number; h: number } {
  return {
    w: Math.max(face, CLOCK_TEXT_WIDTH_PX) + CLOCK_PADDING_PX * 2,
    h: face + CLOCK_TIME_HEIGHT_PX + CLOCK_DATE_HEIGHT_PX + CLOCK_PADDING_PX * 3,
  };
}

/** The content box Clock opens at. The chrome is the host's to add. */
export const CLOCK_CONTENT_SIZE = contentFor(CLOCK_FACE_PX);

/** The smallest content box: the smallest face, and the words still on one line each. */
export const CLOCK_MIN_CONTENT_SIZE = contentFor(CLOCK_MIN_FACE_PX);
