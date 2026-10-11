/**
 * The classic face set's drawing parts: suit shapes in a 20-unit box centred on 0,0, the two ink
 * colours, and Umbraco's logomark. The suit paths are this package's own, drawn for it.
 */
import type { Suit } from '../../rules.js';

/** Red suits' ink. */
export const RED = '#c8283f';
/** Black suits' ink: Umbraco's navy, not black, so the deck reads as Umbraco's. */
export const INK = '#16204a';
/** The card face. */
export const FACE = '#fffdf8';

/**
 * Umbraco's logomark, the `d` of `umbraco_logomark_white.svg` in the Umbraco.Cms.StaticAssets
 * package (viewBox 315.89 square). Copied verbatim.
 */
export const LOGOMARK = 'M0 157.74a157.95 157.95 0 11158 158.15A157.95 157.95 0 010 157.74zm154.74 54.09a155.41 155.41 0 01-36.5-3.29 27.92 27.92 0 01-19.94-16q-5.35-12.34-5.21-38.1a243 243 0 011.69-26.84q1.55-13 3.09-21.46l1.07-5.59a2 2 0 000-.49 3.2 3.2 0 00-2.65-3.17l-20.37-3.22h-.44a3.19 3.19 0 00-3.11 2.48c-.35 1.31-.56 2.27-1.17 5.38-1.16 6-2.24 11.85-3.43 20.38a264.17 264.17 0 00-2.3 27.94 145.24 145.24 0 000 19.57q.72 25.94 8.9 41.42t27.72 22.3q19.53 6.81 54.43 6.66h2.91q34.94.15 54.41-6.66t27.71-22.3q8.17-15.53 8.91-41.42a145.24 145.24 0 000-19.57 266.84 266.84 0 00-2.3-27.94c-1.2-8.44-2.27-14.26-3.44-20.38-.61-3.11-.81-4.07-1.16-5.38a3.21 3.21 0 00-3.12-2.48h-.52l-20.38 3.18a3.2 3.2 0 00-2.68 3.17 4 4 0 000 .49l1.08 5.59q1.55 8.48 3.12 21.46a245.68 245.68 0 011.65 26.84q.27 25.69-5.21 38.07a27.9 27.9 0 01-19.76 16.07 155.19 155.19 0 01-36.48 3.29z';

/**
 * Path data for the three suits drawn as one path. Clubs are three circles and a stem, see
 * {@link suitMarkup}.
 */
const PATHS: Partial<Record<Suit, string>> = {
  H: 'M0,8 C-4,4 -9,0.5 -9,-3.5 C-9,-6.8 -6.6,-9 -4.3,-9 C-2.3,-9 -0.8,-7.8 0,-6.2 C0.8,-7.8 2.3,-9 4.3,-9 C6.6,-9 9,-6.8 9,-3.5 C9,0.5 4,4 0,8Z',
  D: 'M0,-9.5 C1.8,-6 4.6,-2.6 7.5,0 C4.6,2.6 1.8,6 0,9.5 C-1.8,6 -4.6,2.6 -7.5,0 C-4.6,-2.6 -1.8,-6 0,-9.5Z',
  S: 'M0,-9 C-4,-5 -9,-1.5 -9,2.5 C-9,5.8 -6.6,7.6 -4.3,7.6 C-2.6,7.6 -1.2,6.8 -0.5,5.6 C-0.6,7.4 -1.4,8.6 -3,9.5 L3,9.5 C1.4,8.6 0.6,7.4 0.5,5.6 C1.2,6.8 2.6,7.6 4.3,7.6 C6.6,7.6 9,5.8 9,2.5 C9,-1.5 4,-5 0,-9Z',
};

/**
 * How far above its centre each suit's ink reaches, in the 20-unit box, so a caller can put a suit's
 * top edge (rather than its centre) a fixed distance below something. Checked against the rendered
 * shapes by the corner-gap test in `classic.test.ts`, so a redrawn suit that changes it fails there.
 */
export const SUIT_INK_TOP: Readonly<Record<Suit, number>> = { H: 9, D: 9.5, S: 9, C: 8.9 };

/**
 * How far below its centre each suit's ink reaches, in the 20-unit box: the counterpart of
 * {@link SUIT_INK_TOP}, so a pip's bottom edge (rather than its centre) can be put on a line. The
 * heart's point stops short of the box at 8; the others reach 9.5.
 */
export const SUIT_INK_BOTTOM: Readonly<Record<Suit, number>> = { H: 8, D: 9.5, S: 9.5, C: 9.5 };

/**
 * The ink colour a suit is drawn in.
 * @param suit The suit.
 * @returns {@link RED} for hearts and diamonds, {@link INK} for spades and clubs.
 */
export function inkFor(suit: Suit): string {
  return suit === 'H' || suit === 'D' ? RED : INK;
}

/**
 * One suit symbol.
 * @param suit The suit.
 * @param x Centre x.
 * @param y Centre y.
 * @param size Height in card units.
 * @param flip Upside down, for the lower half of a card.
 * @param attrs Extra attribute name, e.g. `data-pip`.
 * @returns SVG markup.
 */
export function suitMarkup(
  suit: Suit,
  x: number,
  y: number,
  size: number,
  flip = false,
  attrs = '',
): string {
  const t = `translate(${x} ${y}) scale(${size / 20})${flip ? ' rotate(180)' : ''}`;
  const fill = inkFor(suit);
  const attr = attrs ? ` ${attrs}=""` : '';
  if (suit === 'C') {
    return (
      `<g${attr} transform="${t}" fill="${fill}">` +
      `<circle cx="0" cy="-4.6" r="4.3"/><circle cx="-4.7" cy="1.7" r="4.3"/>` +
      `<circle cx="4.7" cy="1.7" r="4.3"/><circle cx="0" cy="0.6" r="2.2"/>` +
      `<path d="M-0.9,1 C-0.9,5 -1.8,7.8 -3.4,9.5 L3.4,9.5 C1.8,7.8 0.9,5 0.9,1Z"/></g>`
    );
  }
  return `<path${attr} d="${PATHS[suit]}" fill="${fill}" transform="${t}"/>`;
}
