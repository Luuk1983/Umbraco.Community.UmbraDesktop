/**
 * Every number the Image Editor needs in more than one place: its stylesheets, its manifest's sizes,
 * and the tests that measure both. Separate from the element so the manifest reads the sizes without
 * pulling the editor, and Fabric with it, into the bundle's main chunk.
 */

/** Width of the mode panel on the right, in px: the 320px panel of the mocks (design §4). */
export const PANEL_WIDTH = 320;

/** Height of the mode bar along the top, in px: File, undo, redo, the five modes, Save. */
export const MODE_BAR_HEIGHT = 48;

/** Height of the status bar along the bottom, in px: the file's facts on the left, zoom on the right. */
export const STATUS_BAR_HEIGHT = 36;

/** The narrowest canvas still worth editing on, in px. */
export const MIN_CANVAS_WIDTH = 400;

/**
 * The File page's smallest box, in px. **A copy** of Services.Media's `FILE_PAGE_MIN_SIZE`
 * (`file-page/constants.ts` in that package, published on its developer page), because nothing is
 * imported from another package. The File page covers the window under the mode bar, so the editor's
 * smallest box must hold it there.
 */
export const FILE_PAGE_MIN_SIZE = { w: 720, h: 560 } as const;

/**
 * The content box the editor opens at: a canvas wide enough to see a landscape photo at a useful size
 * beside the panel, and tall enough for the panel's longest mode without a scroll bar.
 */
export const IMAGE_EDITOR_CONTENT_SIZE = { w: 1100, h: 720 } as const;

/**
 * The smallest content box: the narrowest canvas beside the panel, and wide and tall enough for the
 * File page under the mode bar (it covers the status bar too), whichever is more.
 */
export const IMAGE_EDITOR_MIN_CONTENT_SIZE = {
  w: Math.max(MIN_CANVAS_WIDTH + PANEL_WIDTH, FILE_PAGE_MIN_SIZE.w),
  h: MODE_BAR_HEIGHT + FILE_PAGE_MIN_SIZE.h,
} as const;

/** The file extensions the editor opens, without dots: what a canvas can decode and the editor can edit. */
export const ACCEPT: readonly string[] = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
