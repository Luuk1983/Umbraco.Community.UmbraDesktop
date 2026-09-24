/**
 * Every number Notepad needs in more than one place. Separate from the element so the manifest can
 * read the content size without pulling the app into the bundle's main chunk.
 */

/** Height of the toolbar and of the status bar, in px. */
export const NOTEPAD_BAR_HEIGHT_PX = 32;

/** The app's own padding, in px. */
export const NOTEPAD_PADDING_PX = 6;

/**
 * The content box Notepad opens at: a page roughly sixty characters wide and fifteen lines tall,
 * which is the shape of a note rather than of a document. The page reflows, so a maximized Notepad is
 * a full-screen page.
 */
export const NOTEPAD_CONTENT_SIZE = { w: 520, h: 360 } as const;

/**
 * The smallest content box: the toolbar's four buttons on one row, and a few lines of page under it.
 * The page takes whatever the two bars leave, so below this it would be a slot rather than a page.
 */
export const NOTEPAD_MIN_CONTENT_SIZE = {
  w: 300,
  h: NOTEPAD_BAR_HEIGHT_PX * 2 + NOTEPAD_PADDING_PX * 4 + 96,
} as const;
