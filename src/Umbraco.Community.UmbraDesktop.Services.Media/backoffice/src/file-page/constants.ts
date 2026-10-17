/**
 * Every number the File page needs in more than one place: its stylesheet, its fit test, and the
 * developer page that tells an app how big a box to give it. Separate from the element so a test
 * reads them without rendering anything.
 */

/** The File page's tag, which an app in another package uses by name. Published, and final. */
export const FILE_PAGE_TAG = 'umbradesktop-media-file-page';

/**
 * Width of the page list down the left, in px. Mock scene 1 drew 180; a real backoffice cut "Back to
 * the picture" short at that, so it is 200, which also holds the Dutch labels.
 */
export const PAGE_LIST_WIDTH = 200;

/**
 * Height of one row of the page list, in px. A finger-sized target (D2 chose the File page because
 * it works with a finger), the 48px Material and Apple both ask a touch target to be at least.
 */
export const PAGE_ROW_HEIGHT = 48;

/** Padding round the chosen page, in px. */
export const PAGE_PADDING = 24;

/**
 * Width of Save as's form column, in px: its widest row is the four format choices side by side,
 * each wide enough for "Keep (JPEG)" and "WebP" in a large target. The preview takes what is left.
 */
export const SAVE_AS_FORM_WIDTH = 360;

/** The narrowest Save as preview still worth drawing beside the form, in px. */
export const SAVE_AS_PREVIEW_MIN_WIDTH = 96;

/** Gap between Save as's form and its preview, and between the page's blocks, in px. */
export const PAGE_GAP = 16;

/**
 * Room for the line a save leaves under Save as's button ("Saved.", or the reason it was not), in
 * px: one 12px gap and a line of text, with a line to spare for a reason that wraps.
 */
export const SAVE_STATUS_ROOM = 52;

/**
 * The smallest box an app may give the File page, published on the developer page. Wide enough for
 * the page list, Save as's form and a preview beside it; tall enough for Save as's tallest form (a
 * copy, with its name and folder rows). Measured against the rendered page under every theme by
 * `fits.test.ts`, because deriving only makes the sum agree with itself.
 *
 * The height is the one number here that is measured rather than summed: the form's rows wrap
 * their own text, so their sum is the browser's. Measured 2026-10-17 in Chrome at 508px for a copy
 * and 456px for a replace with the address warning, under every theme id; plus
 * {@link SAVE_STATUS_ROOM} for the line a save leaves under the button.
 */
export const FILE_PAGE_MIN_SIZE = {
  w: PAGE_LIST_WIDTH + PAGE_PADDING * 2 + SAVE_AS_FORM_WIDTH + PAGE_GAP + SAVE_AS_PREVIEW_MIN_WIDTH,
  h: 508 + SAVE_STATUS_ROOM,
} as const;

/** How long Save as waits after the last change of format or quality before it measures the size. */
export const MEASURE_DEBOUNCE_MS = 300;

/** The events a File page fires, by name, so an app listening for them and the element agree. */
export const FILE_PAGE_EVENTS = {
  open: 'umbradesktop-media-file-open',
  saved: 'umbradesktop-media-file-saved',
  failed: 'umbradesktop-media-file-failed',
  back: 'umbradesktop-media-file-back',
  close: 'umbradesktop-media-file-close',
} as const;
