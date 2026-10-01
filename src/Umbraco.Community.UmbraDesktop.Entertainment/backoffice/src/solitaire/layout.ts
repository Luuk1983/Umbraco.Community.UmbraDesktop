/**
 * Where every card sits, as pure maths over the element's size and the game, so it is tested
 * without rendering and the element only has to copy numbers into styles.
 */
import {
  CARD_MAX_WIDTH_PX,
  CARD_MIN_WIDTH_PX,
  CARD_RATIO,
  COLUMN_GAP_RATIO,
  FAN_DOWN_RATIO,
  FAN_UP_MIN_RATIO,
  FAN_UP_RATIO,
  ROW_GAP_RATIO,
  SOLITAIRE_COLUMNS,
  TABLEAU_MIN_CARDS,
  TABLE_PADDING_PX,
  TOOLBAR_HEIGHT_PX,
  WASTE_FAN_RATIO,
} from './constants.js';
import type { KlondikeGame, PileId } from './rules.js';

/** A position in px, relative to the element's top-left corner. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A card's position and stacking order. */
export interface CardPosition extends Point {
  readonly z: number;
}

/** The table's geometry at one size. */
export interface TableLayout {
  readonly width: number;
  readonly height: number;
  readonly cardW: number;
  readonly cardH: number;
  /** Where a pile's bottom card sits. */
  slot(id: PileId): Point;
}

/**
 * The geometry for an element of this size. Computes the card width to fit the element, within
 * the minimum and maximum bounds, then sizes the table accordingly.
 * @param width Element width in px.
 * @param height Element height in px.
 * @returns The layout.
 */
export function computeLayout(width: number, height: number): TableLayout {
  const byWidth = (width - TABLE_PADDING_PX * 2) / (SOLITAIRE_COLUMNS + (SOLITAIRE_COLUMNS - 1) * COLUMN_GAP_RATIO);
  const byHeight =
    (height - TOOLBAR_HEIGHT_PX - TABLE_PADDING_PX * 2) / (CARD_RATIO * (1 + ROW_GAP_RATIO + TABLEAU_MIN_CARDS));
  const cardW = Math.min(CARD_MAX_WIDTH_PX, Math.max(CARD_MIN_WIDTH_PX, Math.min(byWidth, byHeight)));
  const cardH = cardW * CARD_RATIO;
  const gap = cardW * COLUMN_GAP_RATIO;
  const used = SOLITAIRE_COLUMNS * cardW + (SOLITAIRE_COLUMNS - 1) * gap;
  const left = (width - used) / 2;
  const top = TOOLBAR_HEIGHT_PX + TABLE_PADDING_PX;
  /**
   * Left edge of the nth column (stock=0, waste=1, f0-3=3-6, t0-6=0-6 in the tableau).
   */
  const column = (n: number) => left + n * (cardW + gap);
  const tableauY = top + cardH + cardH * ROW_GAP_RATIO;

  return {
    width,
    height,
    cardW,
    cardH,
    slot(id) {
      if (id === 'stock') return { x: column(0), y: top };
      if (id === 'waste') return { x: column(1), y: top };
      const n = Number(id.slice(1));
      return id[0] === 'f' ? { x: column(3 + n), y: top } : { x: column(n), y: tableauY };
    },
  };
}

/**
 * Vertical offsets of a column's cards from its slot. Each card is offset from the bottom of
 * the column by a step that depends on whether the card is face-down (tighter) or face-up.
 * If the column is long, face-up steps compress, but never below the minimum.
 * @param cards The column, bottom first (only `faceUp` is read).
 * @param cardH Card height in px.
 * @param available Height from the column's slot to the bottom of the table, in px.
 * @returns One offset per card.
 */
export function fanOffsets(
  cards: ReadonlyArray<{ faceUp: boolean }>,
  cardH: number,
  available: number,
): number[] {
  const down = cardH * FAN_DOWN_RATIO;
  const downs = cards.filter((c) => !c.faceUp).length;
  const ups = cards.length - downs;
  let up = cardH * FAN_UP_RATIO;
  if (ups > 1) {
    const room = (available - cardH - downs * down) / (ups - 1);
    up = Math.max(cardH * FAN_UP_MIN_RATIO, Math.min(up, room));
  }
  const offsets: number[] = [];
  let y = 0;
  cards.forEach((card, i) => {
    offsets.push(y);
    const next = cards[i + 1];
    if (next) y += card.faceUp ? up : down;
  });
  return offsets;
}

/**
 * Every card's position: stock and foundations stacked, the waste fanned sideways in Draw 3,
 * the columns fanned down. `z` is the global paint order. The piles are read bottom-first
 * (top card is the last element), so we iterate in order and increment z for depth.
 * @param game The game.
 * @param layout The geometry.
 * @returns Positions keyed by card id.
 */
export function cardPositions(
  game: KlondikeGame,
  layout: TableLayout,
): Map<string, CardPosition> {
  const out = new Map<string, CardPosition>();
  let z = 0;

  // Stack piles (all cards on top of each other).
  /**
   * Add a pile's cards to the position map, all at the same x/y with increasing z.
   */
  const stack = (id: PileId, cards: KlondikeGame['stock']) => {
    const at = layout.slot(id);
    for (const card of cards) out.set(card.id, { x: at.x, y: at.y, z: z++ });
  };

  stack('stock', game.stock);

  // Waste fanned sideways: only the top one (Draw 1) or three (Draw 3) are offset, but never more
  // cards than exist.
  const waste = layout.slot('waste');
  const fanned = Math.min(game.drawCount === 3 ? 3 : 1, game.waste.length);
  game.waste.forEach((card, i) => {
    const fromTop = game.waste.length - 1 - i;
    const step = fromTop < fanned ? fanned - 1 - fromTop : 0;
    out.set(card.id, { x: waste.x + step * layout.cardW * WASTE_FAN_RATIO, y: waste.y, z: z++ });
  });

  // Foundations stacked.
  game.foundations.forEach((cards, f) => stack(`f${f}`, cards));

  // Tableau columns fanned down.
  game.tableau.forEach((cards, t) => {
    const at = layout.slot(`t${t}`);
    const offsets = fanOffsets(cards, layout.cardH, layout.height - TABLE_PADDING_PX - at.y);
    cards.forEach((card, i) => out.set(card.id, { x: at.x, y: at.y + offsets[i], z: z++ }));
  });

  return out;
}
