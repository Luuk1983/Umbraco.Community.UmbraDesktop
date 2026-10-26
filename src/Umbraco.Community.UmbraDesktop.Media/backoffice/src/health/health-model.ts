import type { HealthItem } from './health.client.js';

/**
 * The sums Media Health does in the browser over the last check's items (design §5): the library
 * line, the bar of top-level folders, the unused and oversized lists, and what optimizing might save.
 * Pure functions over the result, so nothing here touches a server.
 */

/** The library in one line: how big, how many items, how many folders. */
export interface HealthLibrary {
  sizeBytes: number;
  items: number;
  folders: number;
}

/** One segment of the bar: a top-level folder's name and size, or the rest as Other. */
export interface HealthSegment {
  /** The folder's name; empty for Other. */
  name: string;
  sizeBytes: number;
  /** Whether this is the rest: smaller folders and items at the root. */
  other: boolean;
}

/** How many top-level folders the bar names before the rest fold into Other. */
export const TOP_FOLDERS = 4;

/** Over this, an image is oversized (design §5): 2 MB, the add-on's call. */
export const OVERSIZED_BYTES = 2 * 1024 * 1024;

/**
 * How much of an oversized image's bytes optimizing is expected to save. Optimize images has no
 * estimate of its own before a run (its report comes after), so this is a plain ratio: a camera JPEG
 * resized to 2560 and written as WebP at 80, the run's defaults, comes out at a fifth to a tenth of
 * its size, so three quarters is on the careful side. The app says "about".
 */
export const OPTIMIZE_SAVING_RATIO = 0.75;

/** The extensions an image can have that the Image Editor and Optimize images work on; never SVG. */
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'avif', 'heic', 'heif']);

/** Core's own Image media type, by its alias, for an item whose file carries no extension. */
const CORE_IMAGE_TYPE = 'image';

/**
 * The size of an item, zero for one without a file.
 * @param item The item.
 * @returns Its bytes.
 */
const sizeOf = (item: HealthItem): number => item.sizeBytes ?? 0;

/**
 * Largest first.
 * @param items The items.
 * @returns A sorted copy.
 */
const largestFirst = (items: ReadonlyArray<HealthItem>): HealthItem[] => [...items].sort((a, b) => sizeOf(b) - sizeOf(a));

/**
 * The library in one line.
 * @param items Every item of the last check.
 * @param folders How many folders the check found.
 * @returns The line.
 */
export function libraryOf(items: ReadonlyArray<HealthItem>, folders: number): HealthLibrary {
  return { sizeBytes: items.reduce((sum, item) => sum + sizeOf(item), 0), items: items.length, folders };
}

/**
 * The bar: the top-level folders by size, largest first, and the rest, with items at the root, as
 * Other. A top-level folder is the first segment of an item's names path.
 * @param items Every item of the last check.
 * @returns The segments, Other last when there is anything in it.
 */
export function topFoldersOf(items: ReadonlyArray<HealthItem>): HealthSegment[] {
  const byFolder = new Map<string, number>();
  let root = 0;
  for (const item of items) {
    const top = item.path.split('/').find((part) => part.length) ?? '';
    if (!top) root += sizeOf(item);
    else byFolder.set(top, (byFolder.get(top) ?? 0) + sizeOf(item));
  }
  const sorted = [...byFolder.entries()].sort((a, b) => b[1] - a[1]);
  const segments: HealthSegment[] = sorted.slice(0, TOP_FOLDERS).map(([name, sizeBytes]) => ({ name, sizeBytes, other: false }));
  const rest = sorted.slice(TOP_FOLDERS).reduce((sum, [, size]) => sum + size, root);
  if (rest > 0) segments.push({ name: '', sizeBytes: rest, other: true });
  return segments;
}

/**
 * The unused items, largest first.
 * @param items Every item of the last check.
 * @returns The unused ones.
 */
export function unusedOf(items: ReadonlyArray<HealthItem>): HealthItem[] {
  return largestFirst(items.filter((item) => !item.used));
}

/**
 * Whether an item is a raster image, by its file's extension: what Edit image and Optimize can work
 * on. A site's own image types copy core's, so the extension is the one fact every image carries. An
 * item with no extension at all, as a package can install (Umbraco Engage's journey images carry
 * neither `umbracoExtension` nor `umbracoBytes`, measured 2026-10-26), is an image when it is of
 * core's own Image type.
 * @param item The item.
 * @returns True for a raster image.
 */
export function isImage(item: HealthItem): boolean {
  if (item.extension) return IMAGE_EXTENSIONS.has(item.extension.toLowerCase());
  return item.mediaTypeAlias.toLowerCase() === CORE_IMAGE_TYPE;
}

/**
 * The oversized images, largest first: raster images over {@link OVERSIZED_BYTES}.
 * @param items Every item of the last check.
 * @returns The oversized ones.
 */
export function oversizedOf(items: ReadonlyArray<HealthItem>): HealthItem[] {
  return largestFirst(items.filter((item) => isImage(item) && sizeOf(item) > OVERSIZED_BYTES));
}

/**
 * What optimizing a set of oversized images is expected to save, rounded.
 * @param sizeBytes Their size together.
 * @returns About how many bytes.
 */
export function estimateSaving(sizeBytes: number): number {
  return Math.round(sizeBytes * OPTIMIZE_SAVING_RATIO);
}

/**
 * The sum of a list's sizes.
 * @param items The items.
 * @returns Their bytes.
 */
export function sizeOfAll(items: ReadonlyArray<{ sizeBytes: number | null }>): number {
  return items.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);
}

/** When the last check ran, as the footer says it: "today", "yesterday" or a short date, and the time. */
export interface HealthCheckedOn {
  /** `today`, `yesterday`, or a short date in the person's language. */
  day: 'today' | 'yesterday' | string;
  /** The time, in the person's language. */
  time: string;
}

/**
 * When the last check ran, for "Checked today, 3:12 PM".
 * @param checked When it finished.
 * @param now The time now.
 * @param locale The person's language; the browser's unless given.
 * @returns The day and the time.
 */
export function checkedOn(checked: Date, now: Date, locale?: string): HealthCheckedOn {
  const time = checked.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const dayOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((dayOf(now) - dayOf(checked)) / 86_400_000);
  if (days === 0) return { day: 'today', time };
  if (days === 1) return { day: 'yesterday', time };
  return { day: checked.toLocaleDateString(locale, { month: 'short', day: 'numeric' }), time };
}
