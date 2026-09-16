/**
 * Renders a contact sheet of the app icon, so it can be judged rather than assumed.
 *
 * This exists because an icon is a drawing, and nothing in `build-appicons.mjs` can tell you a
 * drawing looks right. Two failures it catches that reading the SVG does not:
 *
 * - **A mark that does not survive the mask.** The first draft of this icon looked fine at 512 and
 *   lost the whole left edge of its front window to the maskable crop. The `--masked` sheet shows
 *   exactly what an Android launcher keeps.
 * - **A mark that dissolves when small.** A taskbar button is around 32px. Detail that reads
 *   beautifully at 512 turns to mush there, and the only way to know which is to look at 32.
 *
 * Usage:
 *   node scripts/appicon-sheet.mjs                 # the ordinary mark
 *   node scripts/appicon-sheet.mjs --masked        # the maskable mark, circle-cropped
 *
 * Writes into `appicons-src/`, which now holds nothing but these sheets — the artwork itself is
 * composed in `appicon-art.mjs` from the loader's constants. Gitignored.
 */

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appIconSvg } from './appicon-art.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', 'appicons-src');

const masked = process.argv.includes('--masked');
const outName = masked ? 'sheet-maskable.png' : 'sheet.png';

/**
 * The sizes worth looking at.
 *
 * 512 is the manifest's largest and where the drawing is judged; 192 is the other size Chromium
 * requires; 64 is roughly a desktop shortcut; 32 is a taskbar button, and the one that decides
 * whether the design has too much detail in it.
 */
const SIZES = [512, 192, 64, 32];

/** Gap between tiles, and the margin around them. */
const GAP = 24;

/** Mid-grey, so a light mark and a dark one are both judged against something neutral. */
const BACKDROP = '#8a8a8a';

const svg = Buffer.from(appIconSvg({ maskable: masked }));
const layers = [];
let left = GAP;

for (const size of SIZES) {
  let buf = await sharp(svg).resize(size, size).png().toBuffer();

  if (masked) {
    // The harshest common mask is a circle of radius 40% of the icon size — the guarantee the
    // manifest spec actually makes. Everything outside it is the launcher's to discard.
    const r = Math.round(size * 0.4);
    const circle = Buffer.from(
      `<svg width="${size}" height="${size}">` +
        `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="#fff"/></svg>`,
    );
    buf = await sharp(buf).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
  }

  layers.push({ input: buf, top: GAP, left });
  left += size + GAP;
}

await mkdir(source, { recursive: true });

await sharp({
  create: {
    width: SIZES.reduce((sum, s) => sum + s + GAP, GAP),
    height: 512 + GAP * 2,
    channels: 4,
    background: BACKDROP,
  },
})
  .composite(layers)
  .png()
  .toFile(join(source, outName));

console.log(`appicons: ${outName} — open it and look at the 32px one`);
