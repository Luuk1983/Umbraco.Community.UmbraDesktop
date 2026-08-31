/**
 * Naming rules shared by the wallpaper build script and its tests.
 *
 * Kept as plain JS (rather than TypeScript under `src/`) because `build-wallpapers.mjs` runs
 * under bare node with no compile step. The accompanying `.d.ts` gives the test file types.
 */

/** Source extensions the build can decode. AVIF is excluded: it is only ever build output. */
const SOURCE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

/**
 * Whether a filename in `wallpapers-src/` should be treated as a wallpaper source.
 * @param {string} file Filename, without any directory part.
 * @returns {boolean} True when the build should encode it.
 */
export function isWallpaperSource(file) {
  const lower = file.toLowerCase();
  return SOURCE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Derive a wallpaper's stable id from its source filename. The slug is what ends up in the
 * output filenames, the URLs and the persisted setting, so it is normalised rather than trusted:
 * a source may be named `Golden Valley.PNG` and still yield `golden-valley`.
 * @param {string} file Filename, without any directory part.
 * @returns {string} Lowercase, hyphen-separated slug.
 */
export function wallpaperSlugFromFile(file) {
  return file
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Derive the display name shown in the picker from a slug. Title-cased rather than localized —
 * these are proper nouns, like the app names in the launcher.
 * @param {string} slug A slug from {@link wallpaperSlugFromFile}.
 * @returns {string} Human-readable name, e.g. `Aurora Flow`.
 */
export function wallpaperNameFromSlug(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
