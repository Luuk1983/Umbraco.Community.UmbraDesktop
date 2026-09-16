/**
 * The app icon, composed from the loader's own constants.
 *
 * **Why this is generated rather than a drawn SVG file.** The icon is the boot splash standing
 * still: the Umbraco mark inside a ring, which is the one image this package actually shows people.
 * An earlier hand-drawn window glyph was competent and recognisable as nothing, because it appeared
 * nowhere else in the product.
 *
 * **Why it has no square tile.** Every platform that shows an installed app's icon supplies its own
 * container — Android an adaptive shape, Windows and macOS their own surface. A painted tile would
 * sit that container inside another one, which is what makes an icon look imported rather than
 * native. The canvas is transparent; the artwork is the mark itself.
 *
 * **Why the mark is a solid disc rather than a ring around a gap.** Two attempts at this looked
 * undersized on a real taskbar while measuring 94% of their box, because a bounding box is not what
 * the eye reads. A thin ring with a transparent gap inside it puts very little ink on screen, so it
 * sits among solid neighbours like Slack and WhatsApp looking like a smaller icon. Filling the disc
 * and drawing the ring *inside* it keeps the loader's composition and roughly triples the ink.
 *
 * Being the same image means being the same numbers. `desktop/loader-ring.ts` already owns the mark
 * path, the ring radius and the mark's share of the box, so those are read out of it here instead
 * of copied — the repo's derive-never-type rule, applied across a language boundary where a shared
 * constant is not available. A copy would drift the first time somebody nudged the loader, and the
 * failure would be an icon that is *almost* the splash, which reads as sloppiness rather than as a
 * bug and so never gets reported.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', 'src', 'desktop', 'loader-ring.ts');

/**
 * Pull one exported constant out of the loader module's source.
 *
 * A regex rather than an import because this is a `.ts` file and node will not load it. Deliberately
 * strict: a miss throws rather than falling back to a literal, so a rename in `loader-ring.ts`
 * breaks the icon build loudly instead of silently reverting the artwork to numbers nobody chose.
 * @param {string} text The module's source.
 * @param {string} name The exported constant's name.
 * @returns {string} The literal's contents, unquoted.
 */
function constant(text, name) {
  const match = text.match(new RegExp(`export const ${name} =\\s*\\n?\\s*'([^']*)'|export const ${name} = ([\\d.]+)`));
  if (!match) throw new Error(`appicon-art: ${name} not found in loader-ring.ts`);
  return match[1] ?? match[2];
}

const moduleText = await readFile(source, 'utf8');

/** The Umbraco mark, as core's `icon-umbraco` draws it. */
const MARK_PATH = constant(moduleText, 'UMBRADESKTOP_MARK_PATH');

/** The mark's own viewBox side. Not a round number, and not roundable without shifting the mark. */
const MARK_VIEWBOX = Number(constant(moduleText, 'UMBRADESKTOP_MARK_VIEWBOX').split(' ')[2]);

/**
 * The icon's own box. 512 because that is the largest size a manifest asks for.
 */
const SIZE = 512;

/**
 * Umbraco blue, as the desktop's default theme and the manifest's `theme_color` use it.
 *
 * The one thing here not taken from the loader, because the loader has no colour of its own — it
 * takes `currentColor` from whatever surrounds it, and an icon has nothing around it.
 */
const BLUE = '#3544B1';

/**
 * The disc behind the mark.
 *
 * Not decoration: it is what lets the icon be transparent at all. The logo path is a disc with the
 * U cut out of it, so on its own the U is a hole showing whatever is behind the icon — and the icon
 * has to work on a light taskbar, a dark one, and a wallpaper. Measured on all three: a white mark
 * disappears against light, and an all-blue one goes muddy against dark. Filling the hole means the
 * mark carries its own contrast and stops depending on what it lands on.
 */
const DISC = '#ffffff';

/**
 * The fraction of the icon a mask is guaranteed to keep: a centred circle of this radius.
 *
 * 40% is what the manifest spec guarantees, and the maskable variant is built around it rather than
 * around a scale factor chosen to look safe.
 */
const SAFE_RADIUS = 0.4;

/**
 * Where the ring's outer edge sits on the ordinary icon, as a fraction of the box.
 *
 * Exactly half, so the disc touches all four edges and the icon has no padding of its own. A taskbar
 * draws an icon at the size of its box, and every pixel held back is a pixel the neighbours use —
 * which is how this ended up looking undersized beside WhatsApp and Slack at 0.47 and again at
 * {@link SAFE_RADIUS}. Whatever breathing room the icon needs is the platform's to add, and every
 * platform does add it.
 *
 * The safe boundary is a constraint on the *maskable* variant, not on this one. Applying it here
 * pays the cost of a crop that never happens.
 */
const RING_OUTER = 0.5;

/**
 * Where the ring's outer edge sits on the maskable variant: the safe boundary itself.
 *
 * This is the render a launcher is allowed to crop, so it ends exactly where the guarantee does —
 * no further in, which would waste room, and no further out, which would risk the mark.
 */
const MASKABLE_RING_OUTER = SAFE_RADIUS;

/**
 * The ring's stroke, as a fraction of the disc's radius.
 *
 * The loader's ring is a deliberate 2px hairline, which an icon cannot use: at 32px a hairline is
 * gone and at 512 it is a wire. Expressed as a share of the radius so it stays the same *visual*
 * weight in both the ordinary and the maskable render, which are drawn at different radii.
 */
const RING_STROKE_OF_RADIUS = 0.062;

/**
 * How far inside the disc's edge the ring sits, as a fraction of the radius.
 */
const RING_INSET = 0.1;

/**
 * The mark's diameter as a fraction of the *ring's inner* diameter.
 *
 * Measured against the ring rather than the disc, and that distinction cost a round: re-basing it on
 * the disc while the disc was being enlarged shrank the mark at the same time, so the logo ended up
 * adrift in a field of blue and read as the wrong icon rather than a bigger one. The ring's interior
 * is the space the mark actually occupies, so it is the thing to be a fraction of.
 *
 * Close to 1 on purpose. The gap inside the ring is what the loader's arc travels through; a static
 * icon has no arc, so the gap is empty pixels spent on nothing while the logo — the only part anyone
 * recognises at 32px — goes small.
 */
const MARK_OF_RING_INNER = 0.9;

/**
 * Compose the icon.
 * @param {object} options Options.
 * @param {boolean} options.maskable Whether to draw the maskable variant.
 * @returns {string} The SVG source.
 */
export function appIconSvg({ maskable = false } = {}) {
  // The two variants differ only in how close to the edge the artwork runs. The ordinary icon fills
  // its box so it is not dwarfed by its neighbours; the maskable one stops on the boundary a
  // launcher promises to keep.
  const radius = (maskable ? MASKABLE_RING_OUTER : RING_OUTER) * SIZE;

  const stroke = radius * RING_STROKE_OF_RADIUS;
  const ringRadius = radius - radius * RING_INSET;

  // The clear space inside the ring's stroke, which is what the mark has to live in.
  const ringInner = ringRadius - stroke / 2;
  const markSide = ringInner * 2 * MARK_OF_RING_INNER;
  const markScale = markSide / MARK_VIEWBOX;
  const markOffset = (SIZE - markSide) / 2;

  // Four layers, in this order: the solid disc, the ring drawn inside it, the white disc that fills
  // the U-shaped hole in the logo, then the logo itself. Reversing the last two would paint over the
  // mark.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${radius.toFixed(2)}" fill="${BLUE}"/>
  <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${ringRadius.toFixed(2)}"
          fill="none" stroke="${DISC}" stroke-width="${stroke.toFixed(2)}"/>
  <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${(markSide / 2 - 1).toFixed(2)}" fill="${DISC}"/>
  <g transform="translate(${markOffset.toFixed(2)} ${markOffset.toFixed(2)}) scale(${markScale.toFixed(5)})">
    <path d="${MARK_PATH}" fill="${BLUE}"/>
  </g>
</svg>
`;
}
