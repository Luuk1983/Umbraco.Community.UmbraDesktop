import { isFolder } from '../manager/media-source.js';

/**
 * The rules of the folders-only tree beside a manager window (design §17), kept apart from core so a
 * test can run them on a stand-in server: find a parent's folders, and give each an arrow only when a
 * folder is inside it.
 *
 * Both questions are about folders, and the tree's API can only list all of a parent's children, images
 * included. So each starts with one page of children read directly, which answers it exactly for any
 * folder that fits in the page, and that is nearly every folder. For a bigger one it asks Umbraco's
 * media search, which can filter by media type, so the cost stays the same whatever the folder holds.
 * The search reads the Examine index, which runs about a second behind the database (measured
 * 2026-10-18), so only a folder bigger than a page can briefly show a stale arrow or miss a new
 * subfolder. When the search does not answer at all, the children are read directly to the end.
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
  mediaType: { collection: unknown };
}

/**
 * Read one page: of a parent's children, or of the search's folders under it.
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
 * The folders under a parent, in the server's order: the first page's directly, then the search's for
 * a parent bigger than a page, each once.
 * @param page Reads one page of the parent's children.
 * @param search Reads one page of the search's folders under the parent.
 * @returns The folders, or undefined when the server did not answer.
 */
export async function foldersIn<T extends UmbraDesktopTreeItem>(page: UmbraDesktopTreePage<T>, search: UmbraDesktopTreePage<T>): Promise<T[] | undefined> {
  const first = await page(0, FOLDER_TREE_PAGE);
  if (!first) return undefined;
  const folders = first.items.filter((item) => isFolder(item));
  if (first.items.length >= first.total) return folders;
  const rest = (await readAll(search)) ?? (await readAll(page, first.items.length));
  if (!rest) return undefined;
  const seen = new Set(folders.map((item) => item.unique));
  return [...folders, ...rest.filter((item) => isFolder(item) && !seen.has(item.unique))];
}

/**
 * Whether a parent has a folder inside: from its first page of children, or from one search for a
 * parent bigger than a page.
 * @param page Reads one page of the parent's children.
 * @param search Reads one page of the search's folders under the parent.
 * @returns True when one is a folder; false when none is, or the server did not answer.
 */
export async function hasFolder<T extends UmbraDesktopTreeItem>(page: UmbraDesktopTreePage<T>, search: UmbraDesktopTreePage<T>): Promise<boolean> {
  const first = await page(0, FOLDER_TREE_PAGE);
  if (!first) return false;
  if (first.items.some((item) => isFolder(item))) return true;
  if (first.items.length >= first.total) return false;
  const searched = await search(0, 1);
  if (searched) return searched.total > 0;
  const rest = await readAll(page, first.items.length);
  return !!rest?.some((item) => isFolder(item));
}

/**
 * The folders among a parent's children, in the server's order, each with an arrow only when a folder
 * is inside it. A folder the server says is empty is not asked about; the others are asked at once.
 * @param children The parent's children.
 * @param hasSubfolder Whether a folder has a folder inside.
 * @returns The folders.
 */
export async function foldersOf<T extends UmbraDesktopTreeItem>(children: ReadonlyArray<T>, hasSubfolder: (unique: string) => Promise<boolean>): Promise<T[]> {
  const folders = children.filter((item) => isFolder(item));
  return Promise.all(folders.map(async (item) => ({ ...item, hasChildren: item.hasChildren && (await hasSubfolder(item.unique)) })));
}
