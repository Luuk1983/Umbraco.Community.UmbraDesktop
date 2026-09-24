/**
 * Every number Paint needs in more than one place. Separate from the element so the manifest can
 * read the content size without pulling the app into the bundle's main chunk.
 */

/**
 * A new picture's size in pixels. An image opened from the media library keeps its own size instead.
 *
 * Not following the window, as MS Paint's canvas never did: a picture that changed size whenever its
 * window did would crop or pad what someone had drawn. A window larger than the picture centres it;
 * a smaller one scrolls it.
 */
export const PAINT_CANVAS_SIZE = { w: 480, h: 300 } as const;

/**
 * The palette: MS Paint's own twenty-eight, in its own order, two rows of fourteen.
 *
 * This app's domain palette, for the reason Minesweeper gives for its digit colours: a theme has no
 * opinion about which colours a painter is offered, and this set is the one a person who used the
 * original will reach for without looking. Stored as hex so one list feeds both the swatches and the
 * pixels.
 */
export const PAINT_PALETTE = [
  '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080',
  '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
  '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff',
  '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040',
] as const;

/** Swatches per palette row. */
export const PAINT_PALETTE_COLUMNS = 14;

/** Brush sizes on offer, in pixels. The pencil is always 1, which is what makes it a pencil. */
export const PAINT_BRUSH_SIZES = [2, 4, 8] as const;

/**
 * The largest edge of an image Paint will open, in px. Past this a canvas starts to fail in some
 * browsers and a single copy of the pixels is tens of megabytes; an image that large is a photograph
 * to be edited elsewhere, and Paint says so rather than opening it badly.
 */
export const PAINT_MAX_IMAGE_EDGE_PX = 4096;

/** How many strokes Undo can take back at most. */
export const PAINT_UNDO_DEPTH = 20;

/**
 * The memory Undo may use, in bytes. Every undo step is a whole copy of the picture, four bytes a
 * pixel, so the step count is derived from this and the picture's size rather than fixed.
 */
export const PAINT_UNDO_BUDGET_BYTES = 256 * 1024 * 1024;

/**
 * How many undo steps a picture of this size gets: {@link PAINT_UNDO_DEPTH} for a sketch, fewer for a
 * large photograph, never none.
 * @param width The picture's width.
 * @param height Its height.
 * @returns The number of steps.
 */
export function undoDepthFor(width: number, height: number): number {
  const perStep = width * height * 4;
  return Math.max(1, Math.min(PAINT_UNDO_DEPTH, Math.floor(PAINT_UNDO_BUDGET_BYTES / perStep)));
}

/** One palette swatch's edge, in px. */
export const PAINT_SWATCH_PX = 18;

/** Height of the toolbar, in px. */
export const PAINT_TOOLBAR_HEIGHT_PX = 32;

/** Height of the status bar under the palette: the picture's name, its size, and messages. */
export const PAINT_STATUS_HEIGHT_PX = 24;

/** The app's own padding, and the space between its rows, in px. */
export const PAINT_PADDING_PX = 6;

/** Padding inside the well round the picture, in px. */
export const PAINT_WELL_PADDING_PX = 4;

/** Height of the palette: two rows of swatches and the gap between them. */
const PALETTE_HEIGHT_PX = PAINT_SWATCH_PX * 2 + 2;

/**
 * The content box Paint opens at: a new picture whole in its well, the toolbar above, the palette
 * and the status bar below, padded. The chrome is the host's to add.
 */
export const PAINT_CONTENT_SIZE = {
  w: PAINT_CANVAS_SIZE.w + PAINT_WELL_PADDING_PX * 2 + PAINT_PADDING_PX * 2,
  h:
    PAINT_TOOLBAR_HEIGHT_PX +
    PAINT_CANVAS_SIZE.h +
    PAINT_WELL_PADDING_PX * 2 +
    PALETTE_HEIGHT_PX +
    PAINT_STATUS_HEIGHT_PX +
    PAINT_PADDING_PX * 5,
} as const;

/**
 * The smallest content box: the toolbar and palette whole, and enough of the picture to draw in. The
 * well scrolls, so a smaller window shows less picture rather than a smaller one.
 */
export const PAINT_MIN_CONTENT_SIZE = {
  w: PAINT_SWATCH_PX * PAINT_PALETTE_COLUMNS + 2 * (PAINT_PALETTE_COLUMNS - 1) + PAINT_SWATCH_PX * 3 + PAINT_PADDING_PX * 4,
  h: PAINT_TOOLBAR_HEIGHT_PX + 120 + PALETTE_HEIGHT_PX + PAINT_STATUS_HEIGHT_PX + PAINT_PADDING_PX * 5,
} as const;
