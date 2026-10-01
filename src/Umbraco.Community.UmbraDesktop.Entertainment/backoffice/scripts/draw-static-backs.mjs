/**
 * Draws the one card back that is committed as SVG rather than cut from a wallpaper: the Windows 98
 * pixel-art back (design D8).
 *
 * Run by hand (`npm run backs`) when the artwork changes; the output is committed, so a build never
 * needs it. It exists, rather than a hand-written file, because the pixel grid is computed, not drawn.
 *
 * The SVG is `viewBox="0 0 90 130"`: the 9:13 inner area the element shows inside the card's
 * white frame. A 100 x 140 box would be cropped by `object-fit: cover` on its sides.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/solitaire/backs');
const W = 90;
const H = 130;
const CX = W / 2;
const CY = H / 2;
const wrap = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${inner}</svg>\n`;
const n = (v) => +v.toFixed(2);

/** Windows 98: a navy dither, a thin white double border and a 16 x 16 pixel logomark, as in the approved mock. */
function win98() {
  let px = '';
  const s = 2.2;
  const ox = CX - 8 * s;
  const oy = CY - 8 * s;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let on = Math.hypot(x - 7.5, y - 7.5) < 7.9;
      const arm = (x === 4 || x === 5 || x === 10 || x === 11) && y >= 4 && y <= 9;
      const bottom = (y === 10 && x >= 4 && x <= 11) || (y === 11 && x >= 5 && x <= 10);
      if (arm || bottom) on = false;
      if (on) px += `<rect x="${n(ox + x * s)}" y="${n(oy + y * s)}" width="${s + 0.02}" height="${s + 0.02}"/>`;
    }
  }
  return wrap(
    `<defs><pattern id="d" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#000080"/>` +
      `<rect width="1" height="1" fill="#1084d0"/><rect x="2" y="2" width="1" height="1" fill="#1084d0"/></pattern></defs>` +
      `<rect width="${W}" height="${H}" fill="url(#d)"/>` +
      `<rect x="3" y="3" width="84" height="124" fill="none" stroke="#fff" stroke-width=".8"/>` +
      `<rect x="5" y="5" width="80" height="120" fill="none" stroke="#fff" stroke-width=".4"/>` +
      `<g fill="#fff">${px}</g>`,
  );
}

writeFileSync(join(outDir, 'win98.svg'), win98());
console.log('drew win98');
