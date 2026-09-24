/**
 * Every number Paint needs in more than one place. Separate from the element so the manifest can
 * read the content size without pulling the app into the bundle's main chunk.
 */

/**
 * The picture's size in pixels.
 *
 * Fixed, as MS Paint's default canvas was, rather than following the window: a picture that changed
 * size whenever its window did would crop or pad what someone had drawn. A window larger than this
 * centres it; a smaller one scrolls it.
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

/** How many strokes Undo can take back. Each is a copy of the picture, so this is its memory cost. */
export const PAINT_UNDO_DEPTH = 20;

/** One palette swatch's edge, in px. */
export const PAINT_SWATCH_PX = 18;

/** Height of the toolbar, in px. */
export const PAINT_TOOLBAR_HEIGHT_PX = 32;

/** The app's own padding, and the space between its three rows, in px. */
export const PAINT_PADDING_PX = 6;

/** Padding inside the well round the picture, in px. */
export const PAINT_WELL_PADDING_PX = 4;

/** Height of the palette: two rows of swatches and the gap between them. */
const PALETTE_HEIGHT_PX = PAINT_SWATCH_PX * 2 + 2;

/**
 * The content box Paint opens at: the whole picture in its well, the toolbar above and the palette
 * below, padded. The chrome is the host's to add.
 */
export const PAINT_CONTENT_SIZE = {
  w: PAINT_CANVAS_SIZE.w + PAINT_WELL_PADDING_PX * 2 + PAINT_PADDING_PX * 2,
  h:
    PAINT_TOOLBAR_HEIGHT_PX +
    PAINT_CANVAS_SIZE.h +
    PAINT_WELL_PADDING_PX * 2 +
    PALETTE_HEIGHT_PX +
    PAINT_PADDING_PX * 4,
} as const;

/**
 * The smallest content box: the toolbar and palette whole, and enough of the picture to draw in. The
 * well scrolls, so a smaller window shows less picture rather than a smaller one.
 */
export const PAINT_MIN_CONTENT_SIZE = {
  w: PAINT_SWATCH_PX * PAINT_PALETTE_COLUMNS + 2 * (PAINT_PALETTE_COLUMNS - 1) + PAINT_SWATCH_PX * 3 + PAINT_PADDING_PX * 4,
  h: PAINT_TOOLBAR_HEIGHT_PX + 120 + PALETTE_HEIGHT_PX + PAINT_PADDING_PX * 4,
} as const;
