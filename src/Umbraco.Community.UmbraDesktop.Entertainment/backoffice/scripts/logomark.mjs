/**
 * Umbraco's logomark path for the build scripts.
 *
 * The one place it lives is `faces/classic/suits.ts`, which the card faces import. The scripts are
 * plain Node and cannot import TypeScript, so this reads the constant out of that file rather than
 * keeping a second copy that could drift from the one on the cards.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const suits = resolve(dirname(fileURLToPath(import.meta.url)), '../src/solitaire/faces/classic/suits.ts');
const found = /export const LOGOMARK = '([^']+)'/.exec(readFileSync(suits, 'utf8'));
if (!found) throw new Error(`LOGOMARK not found in ${suits}`);

/** The `d` of the logomark, drawn in a square of {@link LOGOMARK_SIZE} units. */
export const LOGOMARK = found[1];

/** Side of the square the logomark is drawn in. */
export const LOGOMARK_SIZE = 315.89;

/**
 * The logomark as an SVG path centred on a point.
 * @param cx Centre x.
 * @param cy Centre y.
 * @param r Half the mark's width.
 * @param fill Fill colour.
 * @param extra Extra attributes, such as an opacity.
 * @returns A `<path>` element.
 */
export function logomark(cx, cy, r, fill, extra = '') {
  return `<path d="${LOGOMARK}" fill="${fill}" ${extra} transform="translate(${cx - r} ${cy - r}) scale(${(2 * r) / LOGOMARK_SIZE})"/>`;
}
