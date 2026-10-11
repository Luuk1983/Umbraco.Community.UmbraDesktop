/**
 * Turns Dmitry Fomin's CC0 English pattern courts (backoffice/art/fomin) into the markup the classic
 * face set draws (design D8): stripped of his corner indices and frame, optimised by svgo, every id
 * prefixed per card so 52 cards can share a shadow root, and every colour mapped onto the Umbraco
 * palette by hue.
 *
 * Run by hand with `npm run courts` when the art changes; the output is committed, as the host's
 * wallpaper catalogue is, because TypeScript imports it.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';

/**
 * The picture area, in the source files' coordinates (they have a width and height of 360 x 540 and
 * no viewBox, so user units are pixels). Fomin's figure fills a 30,30 to 330,510 frame on every card
 * and touches all four edges (crown, sword, hand, base), so the box is that frame grown by one unit
 * on each side to keep the half of the 2-unit outline that lies outside it.
 */
const PICTURE_VIEWBOX = '29 29 302 482';

/** The Umbraco palette the courts are recoloured into. Same values as `faces/classic/suits.ts`. */
const PALETTE = { red: '#c8283f', blue: '#3544b1', gold: '#e0ab45', ink: '#16204a' };

/**
 * The elements of each source card that are not picture, by the `id` Inkscape gave them: the rank
 * letter and suit pip in two corners, the larger suit pip beside each, the two L-shaped frame
 * lines, and the white rounded card outline itself. Our own face draws its corners, border and card,
 * and Fomin's frame has gaps cut out for his indices, so leaving any of these in would show a second
 * set of corners and a broken border inside ours. A crop alone cannot remove them: the big pips and
 * the letters sit inside the frame.
 *
 * The ids differ per file, so they are listed rather than derived. They were found by rendering each
 * card and matching every element's bounding box against the template's fixed index and frame
 * positions (card outline 0,0-360,540; letters 20,30-40,80; small pips 15,90-45,135; big pips
 * 60,45-120,135; frame lines 30,150-300,510 and 60,30-330,390; each rotated 180 degrees about the
 * card centre for the opposite corner). The queens' letter is a taller glyph and was matched by its
 * zone. The sources are pinned, and the build checks every listed id still exists, so a re-downloaded
 * file fails loudly instead of shipping a corner index.
 */
const STRIP = {
  '11C': ['path9015', 'path9017', 'path9019', 'path9793', 'path9815', 'path9817', 'path9819', 'path9821', 'path9011'],
  '11D': ['path11872', 'path11872-9', 'path5865-3', 'path6635-0', 'path6635-8-7', 'path3204-24-49-4', 'path3204-24-49-1', 'path3204-24-49-7', 'path3204-24-49-1-4', 'rect6472-9'],
  '11H': ['path11872-5', 'path11872-9-8', 'path6635-4', 'path5865-7', 'path3126-1-64-0', 'path3126-93-79', 'path3126-1-64-1', 'path3126-93-7', 'rect6472-72'],
  '11S': ['path5865-5', 'path6635-1', 'path11872-56', 'path11872-9-6', 'path3037-7-83-8', 'path3037-7-83-1', 'path3037-7-83-7', 'path3037-7-83-1-4', 'rect6472-19'],
  '12C': ['path17235-1', 'path17235-68', 'path5865', 'path6635', 'path3733', 'path3735', 'path3750', 'path3752', 'rect6472-88'],
  '12D': ['path17235-1-0', 'path17235-68-6', 'path6635-5', 'path5865-09', 'path3204-24-49-72', 'path3204-24-49-1-2', 'path3204-24-49-17', 'path3204-24-49-1-4-8', 'rect6472-23'],
  '12H': ['path17235-1-7', 'path17235-68-9', 'path5865-8', 'path6635-2', 'path3126-1-64-3', 'path3126-93-2', 'path3126-1-64-1-1', 'path3126-93-7-0', 'rect6472-40'],
  '12S': ['path17235-1-1', 'path17235-68-5', 'path6635-3', 'path5865-9', 'path3037-7-83-4', 'path3037-7-83-1-5', 'path3037-7-83-17', 'path3037-7-83-1-4-3', 'rect6472-79'],
  '13C': ['path31-1', 'path31', 'path5865-0', 'path6635-8', 'path3732', 'path3734', 'path3749', 'path3751', 'rect6472-577'],
  '13D': ['path31-1-1', 'path31-7', 'path5865-4', 'path6635-0-9', 'path3204-24-49-44', 'path3204-24-49-1-8', 'path3204-24-49-7-2', 'path3204-24-49-1-7', 'rect6472-2-2'],
  '13H': ['path31-1-5', 'path31-9', 'path5865-78', 'path6635-7', 'path3126-1-64-30', 'path3126-93-76', 'path3126-1-64-1-4', 'path3126-93-7-2', 'rect6472-407'],
  '13S': ['path31-1-9', 'path31-4', 'path5865-1', 'path6635-25', 'path3037-7-83-76', 'path3037-7-83-1-2', 'path3037-7-83-17-1', 'path3037-7-83-1-4-6', 'rect6472-823'],
};

/**
 * A colour's replacement: greys and whites stay, dark goes to ink, and the three chromatic
 * families go to red, gold and blue by hue.
 * @param {string} hex A `#rrggbb` or `#rgb` colour.
 * @returns {string} The replacement.
 */
function recolour(hex) {
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  // Fomin's blacks include near-blacks like #000100 whose saturation maths is meaningless (a chroma of
  // 1/255 reads as fully saturated), so a tiny chroma counts as grey whatever s says.
  if (max - min < 0.05 || s < 0.15) return l < 0.25 ? PALETTE.ink : hex;
  let h = max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min);
  h = (h * 60 + 360) % 360;
  if (h < 20 || h >= 330) return PALETTE.red;
  if (h < 70) return PALETTE.gold;
  if (h >= 190 && h < 260) return PALETTE.blue;
  return hex;
}

/**
 * An svgo plugin that deletes the listed ids. It removes on the parent's way out so svgo is never
 * asked to walk a child list that changes under it, and it runs before anything renames ids.
 * @param {string[]} ids The `id` attributes to delete.
 * @returns {{ name: string, fn: () => object }} The plugin.
 */
function stripIds(ids) {
  const doomed = new Set(ids);
  return {
    name: 'stripIds',
    fn: () => ({
      element: {
        exit: (node) => {
          node.children = node.children.filter((c) => !(c.type === 'element' && doomed.has(c.attributes.id)));
        },
      },
    }),
  };
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const artDir = resolve(scriptDir, '../art/fomin');
const outFile = resolve(scriptDir, '../src/solitaire/faces/classic/courts.generated.ts');

const entries = [];
for (const file of (await readdir(artDir)).filter((f) => f.endsWith('.svg')).sort()) {
  const id = file.replace('.svg', '');
  if (!STRIP[id]) throw new Error(`No strip list for ${file}; add it to STRIP`);
  const source = await readFile(join(artDir, file), 'utf8');
  // stripIds deletes silently, so a source whose ids changed would keep its indices and still exit 0.
  const missing = STRIP[id].filter((stripId) => !source.includes(`id="${stripId}"`));
  if (missing.length > 0) throw new Error(`${file}: STRIP ids not found in source: ${missing.join(', ')}`);
  const { data } = optimize(source, {
    multipass: true,
    plugins: [
      stripIds(STRIP[id]),
      // One decimal is invisible at the largest card (132px wide from a 302-unit picture) and keeps the
      // committed output, which is a TypeScript string, from being over a megabyte.
      { name: 'preset-default', params: { floatPrecision: 1 } },
      { name: 'prefixIds', params: { prefix: `court${id}`, delim: '-' } },
    ],
  });
  const recoloured = data.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (m) => recolour(m));
  // Keep the inner markup; the classic face set supplies its own <svg> wrapper and viewBox.
  const inner = recoloured.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  entries.push(`  '${id}': ${JSON.stringify(inner)},`);
}

await writeFile(
  outFile,
  `// Generated by scripts/build-courts.mjs from backoffice/art/fomin (CC0 1.0, Dmitry Fomin). Do not edit.\n` +
    `/** The picture area of every court, in the source files' coordinates. */\n` +
    `export const COURT_VIEWBOX = '${PICTURE_VIEWBOX}';\n` +
    `/** Each court's recoloured markup, keyed by card id. */\n` +
    `export const COURTS: Readonly<Record<string, string>> = {\n${entries.join('\n')}\n};\n`,
);
console.log(`courts: ${entries.length} written to ${outFile}`);
