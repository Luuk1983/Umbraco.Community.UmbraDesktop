/**
 * Every number the Image Editor needs in more than one place: its stylesheets, its manifest's sizes,
 * and the tests that measure both. Separate from the element so the manifest reads the sizes without
 * pulling the editor, and Fabric with it, into the bundle's main chunk.
 */

/** Width of the mode panel on the right, in px: the 320px panel of the mocks (design §4). */
export const PANEL_WIDTH = 320;

/** Height of the mode bar along the top, in px: undo, redo, the five modes, Save and "...". */
export const MODE_BAR_HEIGHT = 48;

/** Height of the status bar along the bottom, in px: the file's facts on the left, zoom on the right. */
export const STATUS_BAR_HEIGHT = 36;

/** The narrowest canvas still worth editing on, in px. */
export const MIN_CANVAS_WIDTH = 400;

/** Thickness of the line under the mode in use, in px: the line under Umbraco's own tab (D13). */
export const CURRENT_LINE = 3;

/**
 * The file menu's smallest box, in px. **A copy** of Services.Media's `FILE_MENU_MIN_SIZE`
 * (`file-menu/constants.ts` in that package, published on its developer page), because nothing is
 * imported from another package. The menu covers the whole editor, so the editor's smallest box must
 * hold it.
 */
export const FILE_MENU_MIN_SIZE = { w: 520, h: 542 } as const;

/**
 * The content box the editor opens at: a canvas wide enough to see a landscape photo at a useful size
 * beside the panel, and tall enough for the panel's longest mode without a scroll bar.
 */
export const IMAGE_EDITOR_CONTENT_SIZE = { w: 1100, h: 720 } as const;

/**
 * The tallest the mode panel's content gets, in px: Adjust's sliders and its compare group, padding
 * included. Measured 2026-10-18 in Chrome at 432px under every theme id, the other modes shorter;
 * `fits.test.ts` fails if a panel needs a scroll bar at the smallest size.
 */
export const PANEL_CONTENT_HEIGHT = 432;

/**
 * The smallest content box: the narrowest canvas beside the panel and the panel's tallest content
 * between the bars, and the file menu's smallest box, since it covers the editor; whichever is more.
 */
export const IMAGE_EDITOR_MIN_CONTENT_SIZE = {
  w: Math.max(MIN_CANVAS_WIDTH + PANEL_WIDTH, FILE_MENU_MIN_SIZE.w),
  h: Math.max(MODE_BAR_HEIGHT + PANEL_CONTENT_HEIGHT + STATUS_BAR_HEIGHT, FILE_MENU_MIN_SIZE.h),
} as const;

/** The file extensions the editor opens, without dots: what a canvas can decode and the editor can edit. */
export const ACCEPT: readonly string[] = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
