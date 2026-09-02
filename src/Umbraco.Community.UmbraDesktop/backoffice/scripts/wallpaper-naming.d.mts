/** Types for `wallpaper-naming.mjs`, which is plain JS so the node build script can import it. */

/** Whether a filename in `wallpapers-src/` should be treated as a wallpaper source. */
export declare function isWallpaperSource(file: string): boolean;

/** Derive a wallpaper's stable id from its source filename. */
export declare function wallpaperSlugFromFile(file: string): string;

/** Derive the display name shown in the picker from a slug. */
export declare function wallpaperNameFromSlug(slug: string): string;
