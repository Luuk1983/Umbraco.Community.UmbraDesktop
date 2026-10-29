import type { HealthFolder, HealthItem } from './health.client.js';
import { healthOf } from './health-model.js';

/**
 * Where the space goes, one folder at a time (design §16.15, mock scene 2), like a phone's or a Mac's
 * storage screen: a folder's own figures, the folders directly under it largest first, each with what
 * in it can go, and the items directly in it. Orphaned files belong to no folder and are left out, as
 * the overview's folders leave them out. Pure, so the sums are tested without drawing.
 */

/** What a folder holds, with everything under it, cut by health. */
export interface HealthFolderFigures {
  /** The bytes known. */
  bytes: number;
  /** How many items. */
  count: number;
  /** How many have no size, so the figure is "at least". */
  unknown: number;
  /** The bytes of unused items. */
  unused: number;
  /** The bytes of oversized images. */
  oversized: number;
  /** The bytes of everything else: in use and fine. */
  fine: number;
  /** How many items are unused. */
  unusedCount: number;
  /** How many images are oversized. */
  oversizedCount: number;
}

/** A folder directly under the one shown. */
export interface HealthFolderChild extends HealthFolderFigures {
  /** Its key, what the breakdown and the list open it by. */
  key: string;
  /** Its name. */
  name: string;
  /** Whether it has folders of its own, so clicking it goes a level further. */
  folders: boolean;
}

/** One step of the path back up: a folder, or the library itself (`key` null). */
export interface HealthFolderStep {
  key: string;
  name: string;
}

/** The breakdown of one folder, or of the library. */
export interface HealthBreakdown extends HealthFolderFigures {
  /** The folder's key; null for the library. */
  key: string | null;
  /** Its name; empty for the library, which the view names in words. */
  name: string;
  /** The folders from the top down to this one, this one last; empty for the library. */
  path: HealthFolderStep[];
  /** The folders directly under it, largest first, then by name. */
  children: HealthFolderChild[];
  /** The items directly in it rather than in a folder under it, or undefined when there are none. */
  direct: HealthFolderFigures | undefined;
}

/**
 * Every place of the library: its folders, and every item with items under it (design §16.17). A
 * folder means nothing to Umbraco but its icon and that it may hold items; the Media Manager's tree
 * counts any item that holds items as a place (`isPlace`), and so does Where the space goes. The check
 * reads folders by Umbraco's Folder type, so the rest are found here, by the items that name them as
 * their parent.
 * @param items Every item of the check.
 * @param folders Every folder of the check.
 * @returns The folders, then the items that hold items, as folders.
 */
export function placesOf(items: ReadonlyArray<HealthItem>, folders: ReadonlyArray<HealthFolder>): HealthFolder[] {
  const parents = new Set(items.map((item) => item.parentKey));
  const known = new Set(folders.map((folder) => folder.key));
  const holders = items
    .filter((item) => parents.has(item.key) && !known.has(item.key))
    .map((item) => ({ key: item.key, name: item.name, parentKey: item.parentKey, path: `${item.path.replace(/\/$/, '')}/${item.name}` }));
  return [...folders, ...holders];
}

/**
 * Empty figures, to add items to.
 * @returns Figures of nothing.
 */
const none = (): HealthFolderFigures => ({ bytes: 0, count: 0, unknown: 0, unused: 0, oversized: 0, fine: 0, unusedCount: 0, oversizedCount: 0 });

/**
 * Add one item to some figures.
 * @param figures The figures, changed in place.
 * @param item The item.
 */
function add(figures: HealthFolderFigures, item: HealthItem): void {
  const bytes = item.sizeBytes ?? 0;
  figures.bytes += bytes;
  figures.count++;
  if (item.sizeBytes === null) figures.unknown++;
  const health = healthOf(item);
  if (health === 'unused') {
    figures.unused += bytes;
    figures.unusedCount++;
  } else if (health === 'oversized') {
    figures.oversized += bytes;
    figures.oversizedCount++;
  } else figures.fine += bytes;
}

/**
 * The breakdown of a folder: every item under it summed, the folders directly under it, and the
 * items directly in it. A folder no longer in the check falls back to the library, so a breakdown left
 * open over a new result never shows a folder that has gone.
 * @param items Every item of the check.
 * @param folders Every folder of the check.
 * @param key The folder, or null for the library.
 * @returns The breakdown.
 */
export function breakdownOf(items: ReadonlyArray<HealthItem>, folders: ReadonlyArray<HealthFolder>, key: string | null): HealthBreakdown {
  const byKey = new Map(folders.map((folder) => [folder.key, folder]));
  const shown = key !== null && byKey.has(key) ? byKey.get(key)! : undefined;
  const here = shown?.key ?? null;
  const parentOf = (folderKey: string | null) => (folderKey ? (byKey.get(folderKey)?.parentKey ?? null) : null);
  const childOf = new Map<string, HealthFolderChild>();
  for (const folder of folders) {
    if (folder.parentKey === here) childOf.set(folder.key, { ...none(), key: folder.key, name: folder.name, folders: false });
  }
  for (const folder of folders) {
    const parent = folder.parentKey ? childOf.get(folder.parentKey) : undefined;
    if (parent) parent.folders = true;
  }
  const total = none();
  const direct = none();
  for (const item of items) {
    // Walk up from the item's folder to the folder shown; the step just under it is the child it is in.
    let folder: string | null = item.parentKey;
    let child: string | null = null;
    let inside = here === null;
    for (let hops = 0; hops <= byKey.size; hops++) {
      if (folder === here) {
        inside = true;
        break;
      }
      if (folder === null) break;
      child = folder;
      folder = parentOf(folder);
    }
    if (!inside) continue;
    add(total, item);
    if (item.parentKey === here) add(direct, item);
    else if (child && childOf.has(child)) add(childOf.get(child)!, item);
  }
  const path: HealthFolderStep[] = [];
  for (let step = shown, hops = 0; step && hops <= byKey.size; step = step.parentKey ? byKey.get(step.parentKey) : undefined, hops++) {
    path.unshift({ key: step.key, name: step.name });
  }
  const children = [...childOf.values()].sort((a, b) => b.bytes - a.bytes || b.count - a.count || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return { ...total, key: here, name: shown?.name ?? '', path, children, direct: direct.count ? direct : undefined };
}
