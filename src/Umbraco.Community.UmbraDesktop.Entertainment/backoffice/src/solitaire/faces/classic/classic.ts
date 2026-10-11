/**
 * Classic: the default face set (design D8). Pips in the standard layouts, an outlined
 * rank in two corners, the ace of spades carrying the logomark, and Fomin's CC0 courts recoloured.
 */
import { CARD_RADIUS_RATIO } from '../../constants.js';
import type { SolitaireCardValue, SolitaireFaceSet } from '../../extensions.js';
import { COURTS, COURT_VIEWBOX } from './courts.generated.js';
import { RANKS, RANK_MAX_WIDTH } from './ranks.generated.js';
import { FACE, INK, LOGOMARK, SUIT_INK_BOTTOM, SUIT_INK_TOP, inkFor, suitMarkup } from './suits.js';
import type { Suit } from '../../rules.js';

/** What the corner index says. */
const RANK_LABEL: Readonly<Record<number, string>> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

/**
 * The corner's geometry, in card units, in one place so the drawing and the court frame derive from
 * the same numbers. The rank is an outline (see `ranks.generated.ts`) set `capHeight` tall with its
 * top on `top`; the suit is centred on the same line a fixed `gap` below the rank's ink. Nothing
 * else positions a corner.
 */
export const CORNER = (() => {
  const capHeight = 12.5;
  const margin = 3;
  const boxWidth = RANK_MAX_WIDTH * capHeight;
  return {
    /** Rank height from top of ink to baseline. */
    capHeight,
    /** Distance from the card's left edge to the corner box. */
    margin,
    /** The widest a rank can be: the condensed 10 fills it. */
    boxWidth,
    /** The centre line the rank and suit are both centred on. */
    centreX: margin + boxWidth / 2,
    /** Where the rank's ink starts, from the card's top. */
    top: 5,
    /** Space between the rank's lowest ink and the suit's top. */
    gap: 3.5,
    /** The corner suit's height: a little under the rank's, so it carries the same weight as the bold figure. */
    suitSize: 11.5,
    /** Clear space between the corner box and the court picture's frame. */
    courtGap: 2.5,
  } as const;
})();

/** The court frame's left edge: just past the corner box, so a Q or K index never crowds it. */
const COURT_FRAME_X = CORNER.margin + CORNER.boxWidth + CORNER.courtGap;

/** The size of a pip, in card units: its height, and about its width too. */
const PIP_SIZE = 15;

/**
 * The widest a pip's ink reaches either side of its centre, in the suit's 20-unit box (the club's
 * outer circles), scaled to a pip. Used to keep the left column clear of the corner box.
 */
const PIP_HALF_WIDTH = (9 * PIP_SIZE) / 20;

/**
 * The left pip column's centre x. The standard inset is 32, but it is never closer to the corner
 * box than the corner's own `gap`, so a larger corner pushes the column inward instead of letting a
 * pip touch a rank. The right column mirrors it.
 */
const PIP_COLUMN_LEFT = Math.max(32, CORNER.margin + CORNER.boxWidth + CORNER.gap + PIP_HALF_WIDTH);

/** Column x for each pip column: left, centre, right. */
const PIP_COLUMNS = { L: PIP_COLUMN_LEFT, C: 50, R: 100 - PIP_COLUMN_LEFT } as const;

/**
 * Where each rank's pips sit, as a column and a fraction of the way from the top row (0) to the
 * bottom row (1), the standard deck's layouts. Only the two end rows are anchored to the corners;
 * the rest are fractions of the span between them, so evenly spaced rows stay evenly spaced
 * whatever the corner geometry is. Rows below the middle are drawn upside down.
 */
const PIP_LAYOUTS: Readonly<Record<number, ReadonlyArray<readonly ['L' | 'C' | 'R', number]>>> = {
  2: [['C', 0], ['C', 1]],
  3: [['C', 0], ['C', 1 / 2], ['C', 1]],
  4: [['L', 0], ['R', 0], ['L', 1], ['R', 1]],
  5: [['L', 0], ['R', 0], ['C', 1 / 2], ['L', 1], ['R', 1]],
  6: [['L', 0], ['R', 0], ['L', 1 / 2], ['R', 1 / 2], ['L', 1], ['R', 1]],
  7: [['L', 0], ['R', 0], ['C', 1 / 4], ['L', 1 / 2], ['R', 1 / 2], ['L', 1], ['R', 1]],
  8: [['L', 0], ['R', 0], ['C', 1 / 4], ['L', 1 / 2], ['R', 1 / 2], ['C', 3 / 4], ['L', 1], ['R', 1]],
  9: [
    ['L', 0], ['R', 0], ['L', 1 / 3], ['R', 1 / 3], ['C', 1 / 2],
    ['L', 2 / 3], ['R', 2 / 3], ['L', 1], ['R', 1],
  ],
  10: [
    ['L', 0], ['R', 0], ['C', 1 / 6], ['L', 1 / 3], ['R', 1 / 3],
    ['L', 2 / 3], ['R', 2 / 3], ['C', 5 / 6], ['L', 1], ['R', 1],
  ],
};

/**
 * The pips of a number card. The top row's bottom edge sits on the bottom edge of the top-left
 * corner's suit and the bottom row's top edge on the top edge of the bottom-right corner's suit
 * (its mirror), as on a standard deck, so the pips and the indices line up. Suits differ in how far
 * their ink reaches below the centre, so the row centres are derived per suit.
 * @param card A card of rank 2 to 10.
 * @returns SVG markup.
 */
function pips(card: SolitaireCardValue): string {
  const scale = PIP_SIZE / 20;
  // The corner suit's lowest ink: its centre plus its reach below it. Number ranks do not descend.
  const cornerBottom = suitCentreY(card.suit, 0) + (CORNER.suitSize / 20) * SUIT_INK_BOTTOM[card.suit];
  const top = cornerBottom - scale * SUIT_INK_BOTTOM[card.suit];
  const bottom = 140 - top;
  return PIP_LAYOUTS[card.rank]
    .map(([column, f]) => {
      const y = top + f * (bottom - top);
      return suitMarkup(card.suit, PIP_COLUMNS[column], n(y), PIP_SIZE, y > 70, 'data-pip');
    })
    .join('');
}

/** The art's width over its height, read from its viewBox so a re-cut court cannot drift from it. */
const COURT_ASPECT = (() => {
  const [, , w, h] = COURT_VIEWBOX.split(' ').map(Number);
  return w / h;
})();

/**
 * Where the court picture is drawn, in card units. It takes the art's own aspect, so none of the
 * picture is cropped: as wide as the space between the corner boxes allows, but never taller than
 * the card's inner area, in which case it narrows instead. Centred on the card both ways.
 */
const COURT_ART = (() => {
  const maxHeight = 105;
  const height = Math.min((99 - 2 * COURT_FRAME_X) / COURT_ASPECT, maxHeight);
  const width = height * COURT_ASPECT;
  return { x: 50 - width / 2, y: 70 - height / 2, width, height };
})();

/**
 * The corner suit's centre y: its top edge a fixed `gap` below the rank's lowest ink.
 * @param suit The suit.
 * @param descent How far the rank hangs below its baseline, in cap heights (0 for numbers, the ace
 *   and the king; J and Q hang). The gap is measured from the lowest ink, not the baseline.
 * @returns The y of the suit's centre in card units.
 */
function suitCentreY(suit: Suit, descent: number): number {
  const inkBottom = CORNER.top + CORNER.capHeight * (1 + descent);
  return inkBottom + CORNER.gap + (CORNER.suitSize / 20) * SUIT_INK_TOP[suit];
}

/**
 * The two corner indices.
 * @param card The card.
 * @returns SVG markup.
 */
function corners(card: SolitaireCardValue): string {
  const glyph = RANKS[RANK_LABEL[card.rank] ?? String(card.rank)];
  // A rank outside 1 to 13 has no outline; name the card rather than fail on a missing property.
  if (!glyph) throw new Error(`No rank outline for card ${card.rank}${card.suit}`);
  const fill = inkFor(card.suit);
  const x = CORNER.centreX - (glyph.width * CORNER.capHeight) / 2;
  const rank =
    `<g data-rank=""><path d="${glyph.d}" fill="${fill}" ` +
    `transform="translate(${n(x)} ${CORNER.top}) scale(${CORNER.capHeight})"/></g>`;
  // J and Q hang below the baseline; the gap is measured from their lowest ink, not from the baseline.
  const suitCentre = suitCentreY(card.suit, glyph.descent);
  const suit = `<g data-corner-suit="">${suitMarkup(card.suit, CORNER.centreX, suitCentre, CORNER.suitSize)}</g>`;
  return rank + suit + `<g transform="rotate(180 50 70)">` + rank + suit + `</g>`;
}

/**
 * Format a coordinate without floating-point noise.
 * @param v The number.
 * @returns The number, rounded to three places.
 */
function n(v: number): number {
  return +v.toFixed(3);
}

/**
 * The middle of the card.
 * @param card The card.
 * @returns SVG markup.
 */
function body(card: SolitaireCardValue): string {
  if (card.rank === 1) {
    if (card.suit !== 'S') return suitMarkup(card.suit, 50, 70, 30);
    const logomarkPath =
      `<path data-logomark="" d="${LOGOMARK}" fill="${INK}" ` +
      `transform="translate(42 55) scale(${16 / 315.89})"/>`;
    return suitMarkup('S', 50, 68, 54) + `<circle cx="50" cy="63" r="9.5" fill="${FACE}"/>` + logomarkPath;
  }
  if (card.rank >= 11) {
    const id = `${card.rank}${card.suit}`;
    const art = COURTS[id];
    // An empty frame would ship as a blank court, which no test of "some court rendered" notices.
    if (!art) throw new Error(`No court art for card ${id}`);
    const { x, y, width, height } = COURT_ART;
    return (
      `<rect data-court-frame="" x="${n(x - 0.5)}" y="${n(y - 0.5)}" width="${n(width + 1)}" ` +
      `height="${n(height + 1)}" rx="3" fill="${FACE}" stroke="${inkFor(card.suit)}" stroke-width=".8"/>` +
      `<svg data-court="" x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" ` +
      `viewBox="${COURT_VIEWBOX}" preserveAspectRatio="xMidYMid meet">${art}</svg>`
    );
  }
  return pips(card);
}

/**
 * The card outline's corner radius in card units: the shared ratio times the card's 100-unit width,
 * rounded so floating-point noise does not end up in the markup.
 */
const OUTLINE_RADIUS = +(CARD_RADIUS_RATIO * 100).toFixed(2);

/** The face set. */
const classic: SolitaireFaceSet = {
  render(card) {
    const cornersSvg = corners(card);
    const bodySvg = body(card);
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140">` +
      `<rect x=".5" y=".5" width="99" height="139" rx="${OUTLINE_RADIUS}" fill="${FACE}" ` +
      `stroke="rgba(22,32,74,.14)"/>` +
      `${cornersSvg}${bodySvg}</svg>`
    );
  },
};

export default classic;
