/**
 * Every number Calculator needs in more than one place.
 *
 * Separate from both `engine.ts` and `calculator.element.ts` for the reason Minesweeper's
 * `constants.ts` gives: the manifest reads the content size from here, and importing it from the
 * element module instead would pull the whole app into the bundle's main chunk and undo the lazy
 * `element: () => import(...)` loader.
 */

/**
 * How many digits the display takes before it stops accepting more.
 *
 * Sixteen, as the Windows calculator does in Standard mode. It is also one more than
 * {@link CALCULATOR_SIGNIFICANT_DIGITS}, which is the point: a typed entry is shown exactly as typed,
 * and only a *computed* result is rounded.
 */
export const CALCULATOR_MAX_DIGITS = 16;

/**
 * How many significant digits a computed result keeps.
 *
 * A double is good to about seventeen, and its last one or two are where `0.1 + 0.2` becomes
 * `0.30000000000000004`. Fifteen is the usual answer to that, the one spreadsheets use, and it is
 * short enough that every result it rounds fits {@link CALCULATOR_MAX_DIGITS}.
 */
export const CALCULATOR_SIGNIFICANT_DIGITS = 15;

/**
 * The keypad, row by row, as it is drawn.
 *
 * The Windows 11 Standard layout with the three scientific keys taken out (reciprocal, square,
 * root), since nobody opens an accessory for them and each would be a row of keys to maintain. The
 * last row is equals on its own, full width, which is the one departure from that layout: without
 * the scientific row there is one key too many for a 4 by 5 pad, and equals is the key that most
 * deserves to be big.
 *
 * Data rather than markup so the element draws the pad with one loop and the content size below can
 * count its rows and columns rather than having them typed a second time.
 */
export const CALCULATOR_KEYPAD = [
  ['%', 'CE', 'C', 'Backspace'],
  ['7', '8', '9', '/'],
  ['4', '5', '6', '*'],
  ['1', '2', '3', '-'],
  ['Negate', '0', '.', '+'],
  ['='],
] as const;

/** Columns on the keypad: the widest row. */
export const CALCULATOR_COLUMNS = Math.max(...CALCULATOR_KEYPAD.map((row) => row.length));

/**
 * One key's box at the default size, in px.
 *
 * The keypad stretches with the window (a calculator has no reason to stay small when maximized), so
 * these are the size a key starts at and the smallest it may shrink to, not a fixed size. 40px tall
 * clears the WCAG 2.5.8 target minimum of 24 with room for a thumb.
 */
export const CALCULATOR_KEY_SIZE = { w: 56, h: 40 } as const;

/** Space between keys, in px. */
export const CALCULATOR_KEY_GAP_PX = 4;

/** The app's own padding, and the space between the display and the keypad, in px. */
export const CALCULATOR_PADDING_PX = 8;

/** Height of the expression line above the display, in px. */
export const CALCULATOR_EXPRESSION_HEIGHT_PX = 20;

/** Height of the main display, in px. */
export const CALCULATOR_DISPLAY_HEIGHT_PX = 44;

/**
 * The content box Calculator asks the host for. The chrome is the host's to add, so there is no
 * titlebar term here.
 *
 * Across: the columns of keys and the gaps between them, plus padding either side. Down: the
 * padding above, the expression line, the display, the gap to the keypad, every row of keys and the
 * gaps between them, and the padding below.
 */
export const CALCULATOR_CONTENT_SIZE = {
  w:
    CALCULATOR_COLUMNS * CALCULATOR_KEY_SIZE.w +
    (CALCULATOR_COLUMNS - 1) * CALCULATOR_KEY_GAP_PX +
    CALCULATOR_PADDING_PX * 2,
  h:
    CALCULATOR_PADDING_PX * 3 +
    CALCULATOR_EXPRESSION_HEIGHT_PX +
    CALCULATOR_DISPLAY_HEIGHT_PX +
    CALCULATOR_KEYPAD.length * CALCULATOR_KEY_SIZE.h +
    (CALCULATOR_KEYPAD.length - 1) * CALCULATOR_KEY_GAP_PX,
} as const;

/**
 * The smallest content box. The same as the default, because every key is already at the size its
 * label and its target need; the keypad grows, it does not shrink.
 */
export const CALCULATOR_MIN_CONTENT_SIZE = CALCULATOR_CONTENT_SIZE;
