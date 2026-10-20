import { UMBRADESKTOP_DEFAULT_MEDIA_LIST_VIEW, isFolder } from '../manager/media-source.js';

/**
 * The rules of the places-only tree beside a manager window (design §17, §19), kept apart from core
 * so a test can run them on a stand-in server: find a parent's places, and give each an arrow only
 * when a place is inside it. A place is a folder, or any item that can hold items (`isPlace` in
 * `manager/media-source.ts`); out of the box only folders are, so the usual tree is folders only.
 * Which items are places is the caller's to say, since it takes each type's insert options.
 *
 * Both questions are about places, and the tree's API can only list all of a parent's children, images
 * included. So each starts with one page of children read directly, which answers it exactly for any
 * folder that fits in the page, and that is nearly every folder. For a bigger one it asks Umbraco's
 * media search, which can filter by media type, so the cost stays the same whatever the folder holds.
 * The search reads the Examine index, which runs about a second behind the database (measured
 * 2026-10-18), so only a folder bigger than a page can briefly show a stale arrow or miss a new
 * subfolder. When the search does not answer at all, the children are read directly to the end.
 * The search is limited to the types that make places, so past the first page an item that is a place
 * only because it holds items, its type no longer allowing any, is not found (design §19).
 */

/**
 * How many children one direct read takes: what decides which folders the search is needed for, and
 * how many results one search page takes.
 */
export const FOLDER_TREE_PAGE = 200;

/** A tree item, as far as these rules read it. */
export interface UmbraDesktopTreeItem {
  /** Its key. */
  unique: string;
  /** Whether the server says it has children: of any kind, images included. */
  hasChildren: boolean;
  /** Its media type; a type with a collection is a folder. */
  mediaType: { collection: { unique: string } | null };
}

/**
 * Read one page: of a parent's children, or of the search's places under it.
 * @param skip How many to skip.
 * @param take How many to read.
 * @returns The page and the total, or undefined when the server did not answer.
 */
export type UmbraDesktopTreePage<T> = (skip: number, take: number) => Promise<{ items: T[]; total: number } | undefined>;

/**
 * Every item a pager has, page after page.
 * @param page Reads one page.
 * @param from Where to start, when the first pages are already read.
 * @returns The items from there, or undefined when a page failed.
 */
export async function readAll<T>(page: UmbraDesktopTreePage<T>, from = 0): Promise<T[] | undefined> {
  const all: T[] = [];
  for (;;) {
    const read = await page(from + all.length, FOLDER_TREE_PAGE);
    if (!read) return undefined;
    all.push(...read.items);
    if (read.items.length === 0 || from + all.length >= read.total) return all;
  }
}

/**
 * The places under a parent, in the server's order: the first page's directly, then the search's for
 * a parent bigger than a page, each once.
 * @param page Reads one page of the parent's children.
 * @param search Reads one page of the search's places under the parent.
 * @param isPlace Whether an item is a place.
 * @returns The places, or undefined when the server did not answer.
 */
export async function placesIn<T extends UmbraDesktopTreeItem>(
  page: UmbraDesktopTreePage<T>,
  search: UmbraDesktopTreePage<T>,
  isPlace: (item: T) => boolean,
): Promise<T[] | undefined> {
  const first = await page(0, FOLDER_TREE_PAGE);
  if (!first) return undefined;
  const places = first.items.filter(isPlace);
  if (first.items.length >= first.total) return places;
  const rest = (await readAll(search)) ?? (await readAll(page, first.items.length));
  if (!rest) return undefined;
  const seen = new Set(places.map((item) => item.unique));
  return [...places, ...rest.filter((item) => isPlace(item) && !seen.has(item.unique))];
}

/**
 * Whether a parent has a place inside: from its first page of children, or from one search for a
 * parent bigger than a page.
 * @param page Reads one page of the parent's children.
 * @param search Reads one page of the search's places under the parent.
 * @param isPlace Whether an item is a place.
 * @returns True when one is a place; false when none is, or the server did not answer.
 */
export async function hasPlace<T extends UmbraDesktopTreeItem>(
  page: UmbraDesktopTreePage<T>,
  search: UmbraDesktopTreePage<T>,
  isPlace: (item: T) => boolean,
): Promise<boolean> {
  const first = await page(0, FOLDER_TREE_PAGE);
  if (!first) return false;
  if (first.items.some(isPlace)) return true;
  if (first.items.length >= first.total) return false;
  const searched = await search(0, 1);
  if (searched) return searched.total > 0;
  const rest = await readAll(page, first.items.length);
  return !!rest?.some(isPlace);
}

/**
 * The places among a parent's children, in the server's order, each with an arrow only when a place
 * is inside it. One the server says is empty is not asked about; the others are asked at once. A place
 * that is no folder gets the default media list view as its collection, which is what core's tree item
 * draws its collection badge from: it opens in a window as a virtual folder (design §19).
 * @param children The parent's children.
 * @param hasSubplace Whether a place has a place inside.
 * @param isPlace Whether an item is a place.
 * @returns The places.
 */
export async function placesOf<T extends UmbraDesktopTreeItem>(
  children: ReadonlyArray<T>,
  hasSubplace: (unique: string) => Promise<boolean>,
  isPlace: (item: T) => boolean,
): Promise<T[]> {
  return Promise.all(
    children.filter(isPlace).map(async (item) => ({
      ...item,
      hasChildren: item.hasChildren && (await hasSubplace(item.unique)),
      mediaType: isFolder(item) ? item.mediaType : { ...item.mediaType, collection: { unique: UMBRADESKTOP_DEFAULT_MEDIA_LIST_VIEW } },
    })),
  );
}
