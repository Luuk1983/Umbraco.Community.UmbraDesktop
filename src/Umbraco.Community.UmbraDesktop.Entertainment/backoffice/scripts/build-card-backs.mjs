/**
 * Cuts Solitaire's per-theme card backs from the host's wallpaper sources (design D8): a portrait
 * crop of each theme's default wallpaper, centred on its focal point, as AVIF in
 * `public/solitaire/backs/`. The macOS and Windows 11 wallpapers carry their own logos, which a
 * plain crop cut through, so those two are cut from a logo-free texture region and get a crisp
 * Umbraco overlay (a glass disc, an acrylic tile) composited on top.
 *
 * Reads the host's committed PNGs in `../../Umbraco.Community.UmbraDesktop/backoffice/wallpapers-src/`
 * rather than its encoded AVIFs, because those are gitignored build output and may not exist yet on
 * a clean checkout. The crops written here are gitignored too and rebuilt by `npm run build`, which
 * CI runs before `dotnet pack`, exactly as the host does for its wallpapers.
 *
 * Output goes to `public/` rather than straight to `wwwroot/` because vite.config.ts empties the
 * plugin folder on every build, whereas `public/` is copied in verbatim.
 *
 * Idempotent by mtime, like `build-wallpapers.mjs`: a crop newer than its source is skipped. Git does
 * not preserve mtimes, so a fresh clone re-encodes once, and sharp is deterministic so the result is
 * the same bytes.
 */
import { existsSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { logomark } from './logomark.mjs';

/** Output width in px: the card's inner 90 x 130 area at about 2.3x the largest card (132px wide), so it stays sharp on high-density screens. */
const OUT_W = 300;

/** Output height in px, keeping the 90:130 aspect of the card's inner area. */
const OUT_H = 434;

/** AVIF quality; the host uses 55 for its full-size wallpapers, which is visually transparent on this artwork. */
const QUALITY = 55;

/** The card's inner area in the units the overlays are drawn in (90 x 130, the 9:13 the element shows). */
const AREA = { w: 90, h: 130 };

/**
 * A glass disc with the logomark: macOS's translucent material, which suits a wallpaper that has no
 * logo of its own to spare. White gradient from .7 to .18 with a thin rim, as in the approved mock.
 * @returns An SVG in the inner area's units.
 */
const glassDisc = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}" viewBox="0 0 ${AREA.w} ${AREA.h}">` +
  `<defs><radialGradient id="g" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".7"/>` +
  `<stop offset="1" stop-color="#fff" stop-opacity=".18"/></radialGradient></defs>` +
  `<circle cx="45" cy="65" r="21" fill="url(#g)" stroke="rgba(255,255,255,.7)" stroke-width=".8"/>` +
  `${logomark(45, 65, 15, '#fff', 'opacity=".95"')}</svg>`;

/**
 * A rounded acrylic tile with the logomark: Windows 11's material. The radius is 9 of the tile's 38.
 * @returns An SVG in the inner area's units.
 */
const acrylicTile = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}" viewBox="0 0 ${AREA.w} ${AREA.h}">` +
  `<rect x="26" y="46" width="38" height="38" rx="9" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.35)" stroke-width=".6"/>` +
  `${logomark(45, 65, 13, '#fff')}</svg>`;

/**
 * Each back: its wallpaper, the focal point (as fractions of the image) the crop centres on, how much
 * of the wallpaper's height the crop takes, and an optional overlay drawn over it.
 * The focal point is the part of the artwork that identifies the theme, so the crop keeps it even
 * though the portrait window discards most of a landscape wallpaper. For the two overlaid backs it
 * is instead a region with no logo, and the smaller fraction is the zoom: the mock's 150 / 230 and
 * 130 / 190 of the approved composition.
 */
const BACKS = [
  { out: 'aurora-flow', source: 'aurora-flow', fx: 0.5, fy: 0.45, fraction: 130 / 150 },
  { out: 'retro-swoosh', source: 'retro-swoosh', fx: 0.36, fy: 0.46, fraction: 130 / 150 },
  { out: 'first-light', source: 'first-light', fx: 0.3, fy: 0.62, fraction: 130 / 230, overlay: glassDisc },
  { out: 'cobalt-beacon', source: 'cobalt-beacon', fx: 0.35, fy: 0.5, fraction: 130 / 190, overlay: acrylicTile },
];

/**
 * The original backs are the repository owner's own artwork, committed as webp files in `art/backs/`
 * rather than cut from a wallpaper. Each carries its own decorative frame (a white rounded line,
 * and for some a coloured line inside it), which the game would draw a second time inside its own
 * white frame, so only the art inside the frame is kept.
 *
 * `edges` is where the white line's inner edge sits on the source, measured in pixels (left, right,
 * top, bottom). `inset` is how far inside that edge the crop starts: a little for a soft line with
 * rounded corners, more where a coloured line sits inside the white one and must stay out of the
 * crop. The crop is the largest 300:434 box that fits inside the inset edges, centred on the art.
 *
 * | back       | source         | frame                                     |
 * | ---------- | -------------- | ----------------------------------------- |
 * | rabbit     | 1049 x 1499    | white line, blue border outside it        |
 * | codegarden | 1060 x 1484    | white line, light blue line inside it     |
 * | codecabin  | 1060 x 1484    | white line, teal line inside it           |
 * | dutch-umbraco-alliance | 1060 x 1484    | white line only                           |
 */
const ART_BACKS = [
  { out: 'rabbit', edges: { left: 57, right: 991, top: 59, bottom: 1434 }, inset: 9 },
  { out: 'codegarden', edges: { left: 121, right: 941, top: 122, bottom: 1346 }, inset: 28 },
  { out: 'codecabin', edges: { left: 117, right: 944, top: 125, bottom: 1345 }, inset: 28 },
  { out: 'dutch-umbraco-alliance', edges: { left: 27, right: 1033, top: 28, bottom: 1454 }, inset: 34 },
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backofficeDir = resolve(scriptDir, '..');
const sourceDir = resolve(backofficeDir, '../../Umbraco.Community.UmbraDesktop/backoffice/wallpapers-src');
const outputDir = join(backofficeDir, 'public', 'solitaire', 'backs');

await mkdir(outputDir, { recursive: true });
for (const back of BACKS) {
  const source = join(sourceDir, `${back.source}.png`);
  const target = join(outputDir, `${back.out}.avif`);
  if (!existsSync(source)) throw new Error(`Missing wallpaper source ${source}`);
  // This script is an input too: changing a crop or an overlay must re-cut, not wait for a new wallpaper.
  const newest = Math.max((await stat(source)).mtimeMs, (await stat(fileURLToPath(import.meta.url))).mtimeMs);
  if (existsSync(target) && (await stat(target)).mtimeMs >= newest) continue;
  const { width, height } = await sharp(source).metadata();
  const cropH = Math.round(height * back.fraction);
  const cropW = Math.round((cropH * OUT_W) / OUT_H);
  // Clamp so a focal point near an edge shifts the crop inward instead of running off the image.
  const left = Math.min(width - cropW, Math.max(0, Math.round(back.fx * width - cropW / 2)));
  const top = Math.min(height - cropH, Math.max(0, Math.round(back.fy * height - cropH / 2)));
  const cut = await sharp(source)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(OUT_W, OUT_H)
    .toBuffer();
  await sharp(cut)
    .composite(back.overlay ? [{ input: Buffer.from(back.overlay()) }] : [])
    .avif({ quality: QUALITY })
    .toFile(target);
  console.log(`card back ${back.out}: ${cropW}x${cropH} at ${left},${top}`);
}

// The owner's artwork: a crop inside each source's own frame, no overlay. Same mtime rule as above.
for (const back of ART_BACKS) {
  const source = join(backofficeDir, 'art', 'backs', `${back.out}.webp`);
  const target = join(outputDir, `${back.out}.avif`);
  if (!existsSync(source)) throw new Error(`Missing artwork ${source}`);
  const newest = Math.max((await stat(source)).mtimeMs, (await stat(fileURLToPath(import.meta.url))).mtimeMs);
  if (existsSync(target) && (await stat(target)).mtimeMs >= newest) continue;
  const { width, height } = await sharp(source).metadata();
  const { left, right, top, bottom } = back.edges;
  const availW = right - left - 2 * back.inset;
  const availH = bottom - top - 2 * back.inset;
  // The largest 300:434 box that fits inside the inset frame, whichever side is the limit.
  const cropW = Math.min(availW, Math.floor((availH * OUT_W) / OUT_H));
  const cropH = Math.round((cropW * OUT_H) / OUT_W);
  const cropLeft = Math.round(left + back.inset + (availW - cropW) / 2);
  const cropTop = Math.round(top + back.inset + (availH - cropH) / 2);
  if (cropLeft < 0 || cropTop < 0 || cropLeft + cropW > width || cropTop + cropH > height) {
    throw new Error(`${back.out} crop runs off the artwork`);
  }
  await sharp(source)
    .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
    .resize(OUT_W, OUT_H)
    .avif({ quality: QUALITY })
    .toFile(target);
  console.log(`card back ${back.out}: ${cropW}x${cropH} at ${cropLeft},${cropTop}`);
}
