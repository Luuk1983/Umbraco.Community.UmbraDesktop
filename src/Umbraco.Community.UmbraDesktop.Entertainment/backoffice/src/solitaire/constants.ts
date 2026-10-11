/**
 * Every number Solitaire needs in more than one place: the rules, the layout, the element's CSS and
 * the manifest all read from here, never from literals. Separate from `rules.ts` so the manifest can
 * import sizes without pulling the lazy-loaded game into the main chunk, as Snake's does.
 */

/** Columns in the tableau. */
export const SOLITAIRE_COLUMNS = 7;
/** Foundation piles. */
export const SOLITAIRE_FOUNDATIONS = 4;

/** A card's height over its width: the poker-card proportion the SVG faces are drawn at (100 x 140). */
export const CARD_RATIO = 1.4;
/**
 * A card's corner radius as a fraction of its width. The element's CSS rounds the card and its back
 * with it, and the face sets draw their outline with it (as a share of the 100-unit card), so the
 * corners of the front, the back and the shadow always agree.
 */
export const CARD_RADIUS_RATIO = 0.07;
/** Smallest card width in px: the corner index is still readable at this size. */
export const CARD_MIN_WIDTH_PX = 64;
/** Largest card width in px: past this the cards only get bigger, not clearer. */
export const CARD_MAX_WIDTH_PX = 132;
/** Card width the window opens at. */
export const CARD_DEFAULT_WIDTH_PX = 100;

/** Gap between columns, as a fraction of the card width. */
export const COLUMN_GAP_RATIO = 0.18;
/** Gap between the top row and the tableau, as a fraction of the card height. */
export const ROW_GAP_RATIO = 0.2;
/** Vertical step between face-down cards in a column, as a fraction of the card height. */
export const FAN_DOWN_RATIO = 0.1;
/** Preferred vertical step between face-up cards, as a fraction of the card height. */
export const FAN_UP_RATIO = 0.25;
/** The face-up step never compresses below this, so a rank stays visible. */
export const FAN_UP_MIN_RATIO = 0.14;
/** Horizontal step of the three visible waste cards in Draw 3, as a fraction of the card width. */
export const WASTE_FAN_RATIO = 0.18;
/** How much taller than two cards the tableau is guaranteed to be, in card heights, for sizing. */
export const TABLEAU_MIN_CARDS = 2.2;

/** Padding around the table in px. */
export const TABLE_PADDING_PX = 16;
/** Height of the toolbar (New game, stats, settings) in px. */
export const TOOLBAR_HEIGHT_PX = 44;

/** One card move, in ms. */
export const MOVE_MS = 260;
/** Delay between cards moving together, in ms. */
export const STAGGER_MS = 35;
/** Delay between cards while dealing, in ms. */
export const DEAL_STAGGER_MS = 28;
/** A card turning over, in ms. */
export const FLIP_MS = 220;
/** Pause between auto-finish moves, in ms. */
export const AUTO_FINISH_STEP_MS = 110;
/** Pointer travel in px before a press becomes a drag. */
export const DRAG_THRESHOLD_PX = 4;

/** Gravity of the win cascade, added to a card's vertical speed each frame, in px per frame squared. */
export const CASCADE_GRAVITY = 0.9;
/** Share of vertical speed a cascade card keeps after hitting the floor. */
export const CASCADE_DAMPING = 0.72;
/** Slowest sideways launch speed of a cascade card, in px per frame. */
export const CASCADE_SPEED_MIN = 2;
/** Fastest sideways launch speed of a cascade card, in px per frame. */
export const CASCADE_SPEED_MAX = 7;
/** Strongest upward launch speed of a cascade card, in px per frame. */
export const CASCADE_LAUNCH_VY_MAX = 8;

/** Windows standard scoring (design D2). */
export const SCORE = {
  wasteToTableau: 5,
  toFoundation: 10,
  turnOver: 5,
  foundationToTableau: -15,
  recycleDrawOne: -100,
  timePenalty: -2,
} as const;
/** The time penalty is charged once per this many seconds of play. */
export const TIME_PENALTY_EVERY_S = 10;
/** The win bonus is this divided by the seconds taken. */
export const TIME_BONUS_NUMERATOR = 700_000;
/** No bonus below this many seconds, as in the original. */
export const TIME_BONUS_MIN_S = 30;

/**
 * Table width for a card width: seven columns, six gaps, padding both sides.
 * @param cardW Card width in px.
 * @returns Content width in px.
 */
export function tableWidthFor(cardW: number): number {
  return SOLITAIRE_COLUMNS * cardW + (SOLITAIRE_COLUMNS - 1) * cardW * COLUMN_GAP_RATIO + TABLE_PADDING_PX * 2;
}

/**
 * Table height for a card width: toolbar, padding, the top row, the row gap and a tableau of
 * {@link TABLEAU_MIN_CARDS} card heights.
 * @param cardW Card width in px.
 * @returns Content height in px.
 */
export function tableHeightFor(cardW: number): number {
  const cardH = cardW * CARD_RATIO;
  return TOOLBAR_HEIGHT_PX + TABLE_PADDING_PX * 2 + cardH + cardH * ROW_GAP_RATIO + cardH * TABLEAU_MIN_CARDS;
}

/** The content box the window opens at (the host adds its chrome). */
export const SOLITAIRE_CONTENT_SIZE = {
  w: Math.ceil(tableWidthFor(CARD_DEFAULT_WIDTH_PX)),
  h: Math.ceil(tableHeightFor(CARD_DEFAULT_WIDTH_PX)),
} as const;

/** The smallest content box: the table at the smallest readable card. */
export const SOLITAIRE_MIN_CONTENT_SIZE = {
  w: Math.ceil(tableWidthFor(CARD_MIN_WIDTH_PX)),
  h: Math.ceil(tableHeightFor(CARD_MIN_WIDTH_PX)),
} as const;
