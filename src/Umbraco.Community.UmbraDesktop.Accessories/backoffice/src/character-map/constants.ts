/**
 * Every number Character Map needs in more than one place. Separate from the element so the manifest
 * can read the content size without pulling the app, and its names table, into the main chunk.
 */

/** The app's own padding, and the gap between its rows, in px. */
export const CHARACTER_MAP_PADDING_PX = 6;

/** One row of controls: the font, group and search along the top, and the characters to copy. In px. */
export const CHARACTER_MAP_ROW_PX = 28;

/** The status bar, in px. */
export const CHARACTER_MAP_STATUS_PX = 22;

/** One square of the grid, in px: a character at a size you can tell it apart at, as in Windows. */
export const CHARACTER_MAP_CELL_PX = 30;

/** The fewest rows of the grid the window shrinks to. Fewer, and it is a strip rather than a map. */
const MIN_GRID_ROWS = 3;

/** The content box Character Map opens at: fourteen columns and nine rows of grid. */
export const CHARACTER_MAP_CONTENT_SIZE = { w: 460, h: 400 } as const;

/**
 * The smallest content box: the three controls along the top still on one row, and the grid's
 * minimum under them. The grid scrolls, so everything else is a matter of how much of it shows.
 */
export const CHARACTER_MAP_MIN_CONTENT_SIZE = {
  w: 380,
  h:
    CHARACTER_MAP_PADDING_PX * 5 +
    CHARACTER_MAP_ROW_PX * 2 +
    CHARACTER_MAP_CELL_PX * MIN_GRID_ROWS +
    2 +
    CHARACTER_MAP_STATUS_PX,
} as const;
