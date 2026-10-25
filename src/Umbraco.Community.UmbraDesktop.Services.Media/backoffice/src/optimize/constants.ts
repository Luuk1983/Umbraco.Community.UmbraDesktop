/**
 * Every name and number Optimize images (#139) needs in more than one place: its manifest, its
 * element, its stylesheet, its tests and its developer page. Separate from the element so a test
 * reads them without rendering anything.
 */

/** The Optimize images window's app alias. Final once shipped: a window reopened after a reload names it. */
export const UMBRADESKTOP_OPTIMIZE_APP = 'Umbraco.Community.UmbraDesktop.Services.Media.OptimizeImages';

/** The Optimize images window's element tag. */
export const OPTIMIZE_TAG = 'umbradesktop-media-optimize-images';

/** Padding round the window's content, in px, as the file menu's pages have. */
export const OPTIMIZE_PADDING = 24;

/** A switch's track, in px: as wide as two knobs and their padding. */
export const SWITCH_TRACK = { w: 38, h: 22 } as const;

/** The gap between a switch and its label, in px. */
export const SWITCH_GAP = 12;

/**
 * How far a switch's settings and explanation are indented, in px: to where its label starts, so they
 * read as belonging to it (owner, 2026-10-25).
 */
export const SETTING_INDENT = SWITCH_TRACK.w + SWITCH_GAP;

/**
 * The width of a setting's label column, in px, the same in every group so the labels and fields of
 * Resize and Convert line up as one form (owner, 2026-10-25): wide enough for "Max height".
 */
export const SETTING_LABEL_WIDTH = 104;

/** A thumbnail in the introduction's strip, in px: a 4:3 photo small enough for seven on a line. */
export const STRIP_THUMBNAIL = { w: 52, h: 39 } as const;

/** A row's thumbnail, in px: the mock's 48 × 36, a 4:3 photo at a size that still shows what it is. */
export const ROW_THUMBNAIL = { w: 48, h: 36 } as const;


/**
 * The narrowest the window works at, in px: Max width and Max height side by side on one row, the four
 * formats on one row beside their label, and no hint longer than two lines.
 */
export const OPTIMIZE_MIN_WIDTH = 560;

/**
 * The settings at their tallest at {@link OPTIMIZE_MIN_WIDTH}, in px, as reworked with the owner
 * (design §16): the introduction with its path, thumbnails and two skip lines (162), What to do with
 * every switch on and the larger-files warning, and Where the result goes with the used-elsewhere note
 * (594 together), and the footer (68). Without the warning it is 768. Measured, not summed, since the
 * notes wrap their own text: 2026-10-25 in Chrome, the same under every theme id. `fits.test.ts` fails
 * if it grows.
 */
export const OPTIMIZE_SETTINGS_HEIGHT = 824;

/**
 * The smallest content box the window works in: the settings at their tallest without a scroll bar.
 * The rows of a run scroll; the settings never need to.
 */
export const OPTIMIZE_MIN_CONTENT_SIZE = { w: OPTIMIZE_MIN_WIDTH, h: OPTIMIZE_SETTINGS_HEIGHT } as const;

/**
 * The window's content box when it opens: wide enough for the mock's longest row ("5184 × 3456 PNG,
 * 21.3 MB → 2560 × 1707 WebP, 520 KB") on one line beside its thumbnail and status, and as tall as the
 * settings at their tallest. `fits.test.ts` holds both against the rendered window under every theme.
 */
export const OPTIMIZE_CONTENT_SIZE = { w: 640, h: OPTIMIZE_SETTINGS_HEIGHT } as const;
