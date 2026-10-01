/**
 * Turns the rank letters and figures of Roboto Slab Bold into the vector paths the classic face
 * set draws in its corners (design D8). Drawing them as outlines rather than `<text>` means every
 * rank comes from one font whatever the player has installed, and, because the figures are the
 * font's LINING ones, every rank shares one cap height and one baseline, so the suit below it sits
 * a fixed gap away. The previous Georgia text had old-style figures: 6 and 8 rose, 3 4 5 7 9
 * descended, and the 10 was squeezed with negative letter-spacing, so the gap to the suit wandered.
 *
 * Font: Roboto Slab Bold (700), latin subset, from `@fontsource/roboto-slab` (the version
 * is written into the output header). Licence: Apache License 2.0, Copyright 2018 The Roboto Slab
 * Project Authors (https://github.com/googlefonts/robotoslab); the package's LICENSE file and its
 * package.json both state it. Apache 2.0 allows embedding derived outlines like these in a larger
 * work, provided the licence and copyright notice are kept; no font file is shipped, only
 * outlines, and this notice and the generated file's header name the origin.
 *
 * Run by hand with `npm run ranks`; the output is committed, as `npm run courts` output is.
 *
 * Normalisation: every path lives in a box whose height is 1 (the rank's ink, top at y=0, baseline
 * at y=1) and whose left ink edge is x=0. Figures and K/A/Q-body are stretched by at most 5% to land
 * exactly on those lines, which removes the font's round-glyph overshoot (a 6 reaching 13 units
 * below the baseline) so a corner's edges are exact. J and Q are the exception: they keep their
 * descender, scaled by their cap height, because cutting it would no longer be Roboto Slab's letter;
 * their `descent` says how far the ink hangs below the baseline.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

/**
 * The widest a rank may be, in cap heights. Only the 10 is ever wider than this naturally (two
 * figures); it is condensed horizontally to fit, so the corner box is one width for every rank.
 * Roboto Slab's 10 is 1.246 cap heights wide naturally; 1.15 squeezes it by about 8%, which its
 * slab serifs hide, and keeps the corner box (and so the court frame's room) as narrow as the K,
 * the next widest rank at 1.0. Written into the output so the face set derives its corner box from
 * the same number.
 */
const MAX_WIDTH = 1.15;

/** Lining figures are separate glyphs in this font, `one.lf`, and are selected by name. */
const GLYPH_FOR = { A: 'A', 2: 'two.lf', 3: 'three.lf', 4: 'four.lf', 5: 'five.lf', 6: 'six.lf',
  7: 'seven.lf', 8: 'eight.lf', 9: 'nine.lf', J: 'J', Q: 'Q', K: 'K' };

const here = dirname(fileURLToPath(import.meta.url));
const fontPackage = resolve(here, '../../node_modules/@fontsource/roboto-slab');
const buffer = await readFile(resolve(fontPackage, 'files/roboto-slab-latin-700-normal.woff'));
const version = JSON.parse(await readFile(resolve(fontPackage, 'package.json'), 'utf8')).version;
const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
const glyphByName = (name) => {
  for (let i = 0; i < font.glyphs.length; i++) if (font.glyphs.get(i).name === name) return font.glyphs.get(i);
  throw new Error(`No glyph ${name}`);
};

/** Format a number compactly. */
const n = (v) => String(+v.toFixed(3));

/**
 * Build one rank's path.
 * @param parts The glyphs, each with an x offset in font units.
 * @param descends Whether the ink may hang below the baseline (J, Q).
 * @returns The normalised path and its dimensions.
 */
function build(parts, descends) {
  const boxes = parts.map(({ glyph, dx }) => {
    const b = glyph.getBoundingBox();
    return { x1: b.x1 + dx, x2: b.x2 + dx, y1: b.y1, y2: b.y2 };
  });
  const x1 = Math.min(...boxes.map((b) => b.x1));
  const x2 = Math.max(...boxes.map((b) => b.x2));
  const top = Math.max(...boxes.map((b) => b.y2));
  // J and Q: the baseline is y=0 in font units; everything else lands on its own ink bottom.
  const bottom = descends ? 0 : Math.min(...boxes.map((b) => b.y1));
  const scale = 1 / (top - bottom);
  const descent = descends ? -Math.min(...boxes.map((b) => b.y1)) * scale : 0;
  let sx = scale;
  if ((x2 - x1) * scale > MAX_WIDTH) sx = MAX_WIDTH / (x2 - x1);
  const d = parts.map(({ glyph, dx }) => glyph.path.commands.map((c) => {
    const px = (v) => n((v + dx - x1) * sx);
    const py = (v) => n((top - v) * scale);
    switch (c.type) {
      case 'M': case 'L': return `${c.type}${px(c.x)} ${py(c.y)}`;
      case 'Q': return `Q${px(c.x1)} ${py(c.y1)} ${px(c.x)} ${py(c.y)}`;
      case 'C': return `C${px(c.x1)} ${py(c.y1)} ${px(c.x2)} ${py(c.y2)} ${px(c.x)} ${py(c.y)}`;
      case 'Z': return 'Z';
      default: throw new Error(`Unknown command ${c.type}`);
    }
  }).join('')).join('');
  return { d, width: +((x2 - x1) * sx).toFixed(4), descent: +descent.toFixed(4) };
}

const ranks = {};
for (const [label, name] of Object.entries(GLYPH_FOR)) {
  ranks[label] = build([{ glyph: glyphByName(name), dx: 0 }], label === 'J' || label === 'Q');
}
const one = glyphByName('one.lf');
const zero = glyphByName('zero.lf');
const kern = font.getKerningValue(one, zero) || 0;
const naturalTen = (() => { const b1 = one.getBoundingBox(); const b0 = zero.getBoundingBox(); const dx = one.advanceWidth + kern; return +(((b0.x2 + dx - b1.x1) / (zero.getBoundingBox().y2 - Math.min(b1.y1, b0.y1))).toFixed(3)); })();
ranks['10'] = build([{ glyph: one, dx: 0 }, { glyph: zero, dx: one.advanceWidth + kern }], false);

const order = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const out =
  // The Apache 2.0 notice, as a `/*! ... */` block that must stay the file's first thing:
  // vite.config.ts reads it from here and stamps it as a banner on the output chunk that holds the
  // outlines, because the bundler drops the comment itself. The full licence text ships beside it
  // in THIRD-PARTY-NOTICES.md.
  `/*! Card rank outlines derived from Roboto Slab Bold ${version}, Copyright 2018 The Roboto Slab\n` +
  ` *  Project Authors (https://github.com/googlefonts/robotoslab), licensed under the Apache License,\n` +
  ` *  Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0). Modified: glyphs converted to\n` +
  ` *  outlines, normalised to the cap height, and the 10 condensed. See THIRD-PARTY-NOTICES.md. */\n` +
  `// Generated by scripts/build-ranks.mjs from @fontsource/roboto-slab. Do not edit.\n` +
  `/** One rank drawn as outlines: a path in a box one unit tall, ink top at y=0, baseline at y=1, left at x=0. */\n` +
  `export interface RankGlyph {\n  /** The path data. */\n  readonly d: string;\n` +
  `  /** The ink width, in units of the rank's height. */\n  readonly width: number;\n` +
  `  /** How far the ink hangs below y=1 (J and Q only), in the same units. */\n  readonly descent: number;\n}\n` +
  `/** The widest any rank is, in units of its height. The 10 is condensed to this. */\n` +
  `export const RANK_MAX_WIDTH = ${MAX_WIDTH};\n` +
  `/** Every rank's outline, keyed by the label the corner shows. */\n` +
  `export const RANKS: Readonly<Record<string, RankGlyph>> = {\n` +
  order.map((k) => `  '${k}': ${JSON.stringify(ranks[k])},`).join('\n') + `\n};\n`;
await writeFile(resolve(here, '../src/solitaire/faces/classic/ranks.generated.ts'), out);
console.log('natural 10 width in cap heights:', naturalTen);
console.log(order.map((k) => `${k}: w=${ranks[k].width} desc=${ranks[k].descent}`).join('\n'));
