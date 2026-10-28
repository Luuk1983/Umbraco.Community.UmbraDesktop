import type { HealthFolder, HealthItem, HealthOrphan } from './health.client.js';
import { formatBytes } from '../transfers/transfers-model.js';

/**
 * The sums Media Health does in the browser over the last check's result (design §5, §16.2): the
 * health of each item, the three lists, the bar, what Clean up would do, and where the space goes.
 * Pure functions over the result, so every figure the window shows is tested without rendering and
 * nothing here touches a server.
 */

/** The three things a check finds, each a row on the overview and a list Clean up acts on. */
export type HealthKind = 'unused' | 'orphaned' | 'oversized';

/** The order the rows, the bar and Clean up take: what goes to the bin, what is deleted, what shrinks. */
export const HEALTH_KINDS: ReadonlyArray<HealthKind> = ['unused', 'orphaned', 'oversized'];

/** The three lists of the last check, each largest first. */
export interface HealthLists {
  /** Items no page uses. */
  unused: HealthItem[];
  /** Files on disk no item owns. */
  orphaned: HealthOrphan[];
  /** Used images over {@link OVERSIZED_BYTES}; an unused one is in `unused` only. */
  oversized: HealthItem[];
}

/**
 * The bar, in bytes: the library cut by health (design §16.2). `freeable` is what Clean up of every
 * row would free, with the oversized images at their estimated saving, since optimizing does not
 * free a whole image (plan Decision 4).
 */
export interface HealthBar {
  unused: number;
  orphaned: number;
  oversized: number;
  fine: number;
  freeable: number;
}

/** One row of Clean up: which kind, how many, and how much it frees, `estimate` when that is a guess. */
export interface HealthCleanupRow {
  kind: HealthKind;
  count: number;
  bytes: number;
  /** How many in it have no size, so the sheet says "at least" or "unknown" rather than 0 B. */
  unknown: number;
  estimate: boolean;
}

/** What Clean up would do with the rows ticked: the rows in it, and what they free together. */
export interface HealthCleanup {
  rows: HealthCleanupRow[];
  bytes: number;
}

/**
 * A top-level folder's share of the library, for Where the space goes, split by the same health as
 * the bar. The rest of its bytes are in use and fine.
 */
export interface HealthFolderShare {
  /** The folder's name; empty for the items at the root. */
  name: string;
  /** The folder's key, or null for the items at the root. */
  key: string | null;
  bytes: number;
  unused: number;
  oversized: number;
}

/** How many top-level folders Where the space goes names before "n more" (design §16.2). */
export const SPACE_FOLDERS = 3;

/** Over this, an image is oversized (design §5): 2 MB, the add-on's call. */
export const OVERSIZED_BYTES = 2 * 1024 * 1024;

/**
 * How much of an oversized image's bytes optimizing is expected to save. Optimize images has no
 * estimate of its own before a run (its report comes after), so this is a plain ratio: a camera JPEG
 * resized to 2560 and written as WebP at 80, the run's defaults, comes out at a fifth to a tenth of
 * its size, so three quarters is on the careful side. The app says "about".
 */
export const OPTIMIZE_SAVING_RATIO = 0.75;

/**
 * The extensions an image can have that the Image Editor and Optimize images work on, and the
 * resizer draws; never SVG. Exported so the thumbnails decide by the same list (`health-media.ts`).
 */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'avif', 'heic', 'heif']);

/** Core's own Image media type, by its alias, for an item whose file carries no extension. */
const CORE_IMAGE_TYPE = 'image';

/**
 * The size of an item, zero for one without a file.
 * @param item The item.
 * @returns Its bytes.
 */
const sizeOf = (item: { sizeBytes: number | null }): number => item.sizeBytes ?? 0;

/**
 * Largest first, for items and orphaned files alike.
 * @param items The items.
 * @returns A sorted copy.
 */
const largestFirst = <T extends { sizeBytes: number | null }>(items: ReadonlyArray<T>): T[] => [...items].sort((a, b) => sizeOf(b) - sizeOf(a));

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
 * An item's health, one each (plan Decision 3): unused before oversized, since an unused image goes to
 * the bin and optimizing it would be wasted; otherwise in use and fine.
 * @param item The item.
 * @returns Its health.
 */
export function healthOf(item: HealthItem): Exclude<HealthKind, 'orphaned'> | 'fine' {
  if (!item.used) return 'unused';
  if (isImage(item) && sizeOf(item) > OVERSIZED_BYTES) return 'oversized';
  return 'fine';
}

/**
 * The three lists of a result, each largest first.
 * @param items Every item of the last check.
 * @param orphans Every orphaned file.
 * @returns The lists.
 */
export function listsOf(items: ReadonlyArray<HealthItem>, orphans: ReadonlyArray<HealthOrphan>): HealthLists {
  const sorted = largestFirst(items);
  return {
    unused: sorted.filter((item) => healthOf(item) === 'unused'),
    orphaned: largestFirst(orphans),
    oversized: sorted.filter((item) => healthOf(item) === 'oversized'),
  };
}

/**
 * The bar: the library's bytes cut by health, and what can be freed.
 * @param lists The three lists.
 * @param libraryBytes Every item's bytes together; orphaned files are not items and come on top.
 * @returns The bar.
 */
export function barOf(lists: HealthLists, libraryBytes: number): HealthBar {
  const unused = sizeOfAll(lists.unused);
  const orphaned = sizeOfAll(lists.orphaned);
  const oversized = sizeOfAll(lists.oversized);
  return { unused, orphaned, oversized, fine: libraryBytes - unused - oversized, freeable: unused + orphaned + estimateSaving(oversized) };
}

/**
 * What Clean up would do: one row per ticked kind with anything in it, the oversized one at its
 * estimated saving. Orphaned files are deleted for good, which only an administrator may do, so for
 * anyone else that row is never in it, ticked or not (design §16.3).
 * @param lists The three lists.
 * @param ticked The rows ticked on the overview.
 * @param admin Whether the person is an administrator.
 * @returns The rows, in {@link HEALTH_KINDS} order, and their bytes together.
 */
export function cleanupOf(lists: HealthLists, ticked: ReadonlySet<HealthKind>, admin: boolean): HealthCleanup {
  const rows = HEALTH_KINDS.filter((kind) => ticked.has(kind) && (admin || kind !== 'orphaned'))
    .map((kind): HealthCleanupRow => {
      const list: ReadonlyArray<{ sizeBytes: number | null }> = lists[kind];
      const { bytes, unknown } = sizeOfList(list);
      return kind === 'oversized'
        ? { kind, count: list.length, bytes: estimateSaving(bytes), unknown, estimate: true }
        : { kind, count: list.length, bytes, unknown, estimate: false };
    })
    .filter((row) => row.count > 0);
  return { rows, bytes: rows.reduce((sum, row) => sum + row.bytes, 0) };
}

/**
 * Where the space goes: the library by top-level folder, largest first, each split by health (design
 * §16.2). An item's top-level folder is found by walking its folder's parents by key, so two folders
 * of the same name stay apart and the share carries the key the grid will filter on; items at the
 * root are one share without a key. Orphaned files belong to no folder and are left out (plan
 * Decision 3).
 * @param items Every item of the last check.
 * @param folders Every folder of the last check.
 * @param top How many shares to name.
 * @returns The largest shares, and how many more there are.
 */
export function foldersOf(
  items: ReadonlyArray<HealthItem>,
  folders: ReadonlyArray<HealthFolder>,
  top = SPACE_FOLDERS,
): { folders: HealthFolderShare[]; more: number } {
  const byKey = new Map(folders.map((folder) => [folder.key, folder]));
  const topOf = (key: string | null): HealthFolder | undefined => {
    let folder = key ? byKey.get(key) : undefined;
    // Bounded by the folder count, so a parent loop in bad data cannot hang the window.
    for (let hops = 0; folder?.parentKey && byKey.has(folder.parentKey) && hops < byKey.size; hops++) folder = byKey.get(folder.parentKey);
    return folder;
  };
  const shares = new Map<string, HealthFolderShare>();
  for (const item of items) {
    const folder = topOf(item.parentKey);
    const id = folder?.key ?? '';
    const share = shares.get(id) ?? { name: folder?.name ?? '', key: folder?.key ?? null, bytes: 0, unused: 0, oversized: 0 };
    const health = healthOf(item);
    share.bytes += sizeOf(item);
    if (health === 'unused') share.unused += sizeOf(item);
    if (health === 'oversized') share.oversized += sizeOf(item);
    shares.set(id, share);
  }
  const sorted = [...shares.values()].sort((a, b) => b.bytes - a.bytes);
  return { folders: sorted.slice(0, top), more: Math.max(0, sorted.length - top) };
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

/** A list's size as a row says it: the bytes known, and how many have no size to add. */
export interface HealthListSize {
  /** The bytes of everything with a size. */
  bytes: number;
  /** How many have none. */
  unknown: number;
}

/**
 * A list's size, with what has no size counted apart. Some items carry no `umbracoBytes` (Umbraco
 * Engage's own pictures, design §16.10), and adding them as 0 made a row of them read "0 B", which
 * says the wrong thing: their size is not nothing, it is not known.
 * @param items The items or files.
 * @returns The known bytes, and how many are unknown.
 */
export function sizeOfList(items: ReadonlyArray<{ sizeBytes: number | null }>): HealthListSize {
  return {
    bytes: sizeOfAll(items),
    unknown: items.filter((item) => item.sizeBytes === null).length,
  };
}

/**
 * A size as the overview's rows and the Clean up sheet say it, one rule for both: the size when all
 * of it is known, "at least" the size when some is not, and "Size unknown" when none is.
 * @param size The known bytes, and how many have none.
 * @param count How many there are in all.
 * @param word The screen's words, given a key and the size where the words take one.
 * @returns What to show.
 */
export function sizeText(
  size: HealthListSize,
  count: number,
  word: (key: 'healthSizeUnknown' | 'healthSizeAtLeast', bytes?: string) => string,
): string {
  if (!size.unknown) return formatBytes(size.bytes);
  return size.unknown >= count ? word('healthSizeUnknown') : word('healthSizeAtLeast', formatBytes(size.bytes));
}

/**
 * The note under an "at least" size: how many it could not count, so the caveat has a number. None
 * under a full size, and none under "Size unknown", where the row's own line already counts them.
 * @param size The known bytes, and how many have none.
 * @param count How many there are in all.
 * @param word The screen's words for "%0% of unknown size", given the count.
 * @returns The note, or null for none.
 */
export function sizeNote(size: HealthListSize, count: number, word: (count: number) => string): string | null {
  return size.unknown > 0 && size.unknown < count ? word(size.unknown) : null;
}

/**
 * How old a check may be before Clean up refuses it (Luuk, 2026-10-28): a day. Content changes during
 * the working day, so yesterday's check is a fair line; the result is still shown, only not acted on.
 */
export const HEALTH_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a check is too old to clean up from.
 * @param checkedAt When it finished.
 * @param now The time now.
 * @returns True when it is older than {@link HEALTH_STALE_MS}.
 */
export function isStale(checkedAt: Date, now: Date): boolean {
  return now.getTime() - checkedAt.getTime() > HEALTH_STALE_MS;
}

/** When the last check ran, as the overview says it: "today", "yesterday" or a short date, and the time. */
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
