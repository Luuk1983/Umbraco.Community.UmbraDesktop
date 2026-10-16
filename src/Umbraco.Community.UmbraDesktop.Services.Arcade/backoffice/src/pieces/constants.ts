/**
 * Every number the Arcade's pieces need in both their CSS and their tests, per the repository's
 * "derive numbers, never type them" rule (`docs/developer/theming.md` §4). The stylesheets read these
 * through `unsafeCSS`, and the tests mount the pieces in boxes sized from them.
 */

/** The full result card's width, in px, as the mock draws it. */
export const ARCADE_CARD_WIDTH_PX = 268;

/** The compact result card's width, in px. */
export const ARCADE_COMPACT_CARD_WIDTH_PX = 226;

/** Space a piece keeps from the edges of the box it is given, each side, in px. */
export const ARCADE_PIECE_MARGIN_PX = 12;

/**
 * Below this width a piece draws its compact form (design P10): the full card plus its margins no
 * longer fits. One threshold for the card and the panel, so a game never gets a full card over a
 * compact panel or the other way round.
 *
 * Minesweeper's well (nine 26px cells, eight 1px gaps, 8px padding each side: 258) is under it and
 * Snake's (twenty 14px cells, 8px padding each side: 296) is over it. Both are measured in a real
 * desktop in the verification task, because deriving only makes the sum consistent with itself.
 */
export const ARCADE_COMPACT_BELOW_PX = ARCADE_CARD_WIDTH_PX + 2 * ARCADE_PIECE_MARGIN_PX;

/**
 * How many rows a board lists. Matches the server's `ArcadeStore.BoardSize`, which cuts `top` to
 * this; the client needs it too, because a hidden viewer merged into a shorter `top` still belongs in
 * the list as long as their rank is within it.
 */
export const ARCADE_BOARD_SIZE = 10;

/** The full panel's widest, in px; it rises from the bottom of a wider game centred at this width. */
export const ARCADE_PANEL_MAX_WIDTH_PX = 470;
