/**
 * Encodes the built-in desktop wallpapers and regenerates their catalogue.
 *
 * Drop a PNG/JPEG/WebP into `wallpapers-src/` and run `npm run build`. For each source this
 * emits a full-size and a thumbnail AVIF into `public/wallpapers/`, then rewrites
 * `src/desktop/settings/wallpapers.generated.ts`.
 *
 * Output goes to `public/` rather than straight to `wwwroot/` because vite.config.ts sets
 * `emptyOutDir: true` on the wwwroot plugin folder — anything placed there by hand is wiped on
 * the next build, whereas `public/` is copied into the output verbatim.
 *
 * Encoding is idempotent: a source whose outputs are both newer than it is skipped, so a local
 * rebuild costs nothing. The check is mtime-based and git does not preserve mtimes, so a fresh
 * clone re-encodes everything once — harmless, since sharp is deterministic and the result is
 * byte-identical.
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { isWallpaperSource, wallpaperNameFromSlug, wallpaperSlugFromFile } from './wallpaper-naming.mjs';

/**
 * The wallpaper shown on a fresh install and used as the fallback whenever a stored preference
 * cannot be resolved. The build fails if no source produces this slug, so the default can never
 * silently disappear in an upgrade.
 */
const DEFAULT_WALLPAPER_ID = 'aurora-flow';

/** Width of the picker thumbnails, in pixels. */
const THUMB_WIDTH = 480;

/** AVIF quality for the full-size image. Visually transparent on this artwork at roughly a fifth of the PNG. */
const FULL_QUALITY = 55;

/** AVIF quality for thumbnails, which are never shown larger than a picker tile. */
const THUMB_QUALITY = 50;

/** Where the built files are served from once the RCL is packed as static web assets. */
const PUBLIC_URL_BASE = '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backofficeDir = resolve(scriptDir, '..');
const sourceDir = join(backofficeDir, 'wallpapers-src');
const outputDir = join(backofficeDir, 'public', 'wallpapers');
const catalogueFile = join(backofficeDir, 'src', 'desktop', 'settings', 'wallpapers.generated.ts');

/**
 * Whether an output file is present and no older than its source.
 * @param {string} sourcePath Absolute path of the source image.
 * @param {string} outputPath Absolute path of the encoded output.
 * @returns {Promise<boolean>} True when the output can be reused.
 */
async function isUpToDate(sourcePath, outputPath) {
  if (!existsSync(outputPath)) return false;
  const [source, output] = await Promise.all([stat(sourcePath), stat(outputPath)]);
  return output.mtimeMs >= source.mtimeMs;
}

/**
 * The image's mean colour, painted underneath the wallpaper so there is no flash before the
 * AVIF decodes.
 * @param {import('sharp').Sharp} image The source image pipeline.
 * @returns {Promise<string>} A `#rrggbb` colour.
 */
async function averageColour(image) {
  const { channels } = await image.stats();
  const [r, g, b] = channels.map((channel) => Math.round(channel.mean));
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Encode one source image into its full-size and thumbnail AVIFs and describe it for the
 * catalogue. Never upscales: the sources are smaller than a large monitor, and inventing pixels
 * would only add bytes.
 * @param {string} file Filename within `wallpapers-src/`.
 * @returns {Promise<{id: string, name: string, url: string, thumbUrl: string, averageColour: string}>} The catalogue entry.
 */
async function buildWallpaper(file) {
  const id = wallpaperSlugFromFile(file);
  const sourcePath = join(sourceDir, file);
  const fullPath = join(outputDir, `${id}.avif`);
  const thumbPath = join(outputDir, `${id}.thumb.avif`);

  const colour = await averageColour(sharp(sourcePath));

  if (await isUpToDate(sourcePath, fullPath)) {
    console.log(`  = ${id} (up to date)`);
  } else {
    await sharp(sourcePath).avif({ quality: FULL_QUALITY, effort: 4 }).toFile(fullPath);
    console.log(`  + ${id}.avif`);
  }

  if (!(await isUpToDate(sourcePath, thumbPath))) {
    await sharp(sourcePath)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .avif({ quality: THUMB_QUALITY, effort: 4 })
      .toFile(thumbPath);
    console.log(`  + ${id}.thumb.avif`);
  }

  return {
    id,
    name: wallpaperNameFromSlug(id),
    url: `${PUBLIC_URL_BASE}/${id}.avif`,
    thumbUrl: `${PUBLIC_URL_BASE}/${id}.thumb.avif`,
    averageColour: colour,
  };
}

/**
 * Render the generated catalogue module.
 * @param {Array<{id: string, name: string, url: string, thumbUrl: string, averageColour: string}>} wallpapers Catalogue entries, already sorted.
 * @returns {string} TypeScript source.
 */
function renderCatalogue(wallpapers) {
  const entries = wallpapers
    .map(
      (w) => `  {
    id: '${w.id}',
    name: '${w.name}',
    url: '${w.url}',
    thumbUrl: '${w.thumbUrl}',
    averageColour: '${w.averageColour}',
  },`,
    )
    .join('\n');

  return `/**
 * GENERATED FILE — do not edit.
 *
 * Written by \`scripts/build-wallpapers.mjs\` from the images in \`wallpapers-src/\`.
 * To change this list, add or remove a source image and run \`npm run build\`.
 */

/** One wallpaper shipped inside the package. */
export interface UmbraDesktopBuiltInWallpaper {
  /** Stable id, derived from the source filename. Persisted in the user's settings. */
  id: string;
  /** Display name shown in the picker. */
  name: string;
  /** Absolute URL of the full-size image. */
  url: string;
  /** Absolute URL of the picker thumbnail. */
  thumbUrl: string;
  /** Mean colour of the image, painted underneath it while it decodes. */
  averageColour: string;
}

/** Every wallpaper shipped inside the package, ordered by id. */
export const UMBRADESKTOP_BUILTIN_WALLPAPERS: ReadonlyArray<UmbraDesktopBuiltInWallpaper> = [
${entries}
];

/** The wallpaper used on a fresh install, and whenever a stored preference cannot be resolved. */
export const UMBRADESKTOP_DEFAULT_WALLPAPER_ID = '${DEFAULT_WALLPAPER_ID}';
`;
}

/** Encode every source image and rewrite the catalogue. */
async function main() {
  if (!existsSync(sourceDir)) {
    throw new Error(`No wallpaper source folder at ${sourceDir}`);
  }

  await mkdir(outputDir, { recursive: true });

  // Only the top level: a subfolder is a safe place to stage work in progress.
  const files = (await readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && isWallpaperSource(entry.name))
    .map((entry) => entry.name)
    .sort();

  console.log(`Building ${files.length} wallpaper(s) from wallpapers-src/`);

  const wallpapers = [];
  for (const file of files) {
    wallpapers.push(await buildWallpaper(file));
  }
  wallpapers.sort((a, b) => a.id.localeCompare(b.id));

  if (!wallpapers.some((w) => w.id === DEFAULT_WALLPAPER_ID)) {
    throw new Error(
      `The default wallpaper '${DEFAULT_WALLPAPER_ID}' has no source image in wallpapers-src/. ` +
        `Restore it, or point DEFAULT_WALLPAPER_ID at one of: ${wallpapers.map((w) => w.id).join(', ')}.`,
    );
  }

  await writeFile(catalogueFile, renderCatalogue(wallpapers), 'utf8');
  console.log(`Wrote ${wallpapers.length} entries to src/desktop/settings/wallpapers.generated.ts`);
}

await main();
