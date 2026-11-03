import type { HealthFolder, HealthItem, HealthKeep, HealthOrphan } from './health.client.js';
import { HEALTH_KINDS } from './health-model.js';
import type { HealthKind, HealthLists } from './health-model.js';

/**
 * The cleanup list's sums (design §16.4, reworked as a table in §16.15): one entry per thing a check
 * found, grouped by folder, filtered by tab, folder and name, sorted, the selection over it, and where
 * the details pane moves on to. Orphaned files form one group of their own (see {@link ORPHAN_GROUP}).
 * Pure, like `health-model.ts`, so the list's arithmetic is tested without rendering; the element only
 * draws what this returns. The file keeps the name it had while the list was a grid of cards.
 */

/** One thing the grid shows: an item, or an orphaned file, under one kind. */
export interface HealthEntry {
  /** The item's key, or `orphan:<relative path>` for an orphaned file, so the two never clash. */
  id: string;
  /** The list it is in. */
  kind: HealthKind;
  /** The item's name, or the file's name. */
  name: string;
  /** Its size, 0 when it has none (see {@link sized}). */
  bytes: number;
  /** Whether it has a size at all; Engage's pictures have none (design §16.10). */
  sized: boolean;
  /** Its file's URL, or null for an item without a file. */
  url: string | null;
  /** The folder it is in, or null at the root and for an orphaned file, which is in no folder. */
  folderKey: string | null;
  /** The folder's names path (`/Products/Archive`), or the orphaned file's directory on disk. */
  folderPath: string;
  /** The item, when it is one. */
  item?: HealthItem;
  /** The orphaned file, when it is one. */
  orphan?: HealthOrphan;
  /**
   * Its keep (design §16.6): one that holds puts the entry under Kept, out of its own list; one that
   * has ended leaves it in its list, where its row says "kept until" with the old note.
   */
  keep?: HealthKeep;
}

/** A tab at the top of the list: one per kind, and Kept, every keep that holds (design §16.6). */
export type HealthChip = HealthKind | 'kept';

/** The tabs, in the order the list draws them: the three kinds, then Kept. */
export const HEALTH_CHIPS: ReadonlyArray<HealthChip> = [...HEALTH_KINDS, 'kept'];

/**
 * The tab an entry is under: Kept while its keep holds, its kind otherwise, an ended keep included.
 * @param entry The entry.
 * @returns The tab.
 */
export const chipOf = (entry: HealthEntry): HealthChip => (entry.keep && !entry.keep.ended ? 'kept' : entry.kind);

/** How the grid is sorted; largest first by default (design §16.4). */
export type HealthSort = 'largest' | 'smallest' | 'name';

/** The sorts, in the order the grid offers them. */
export const HEALTH_SORTS: ReadonlyArray<HealthSort> = ['largest', 'smallest', 'name'];

/** What the grid shows: one chip, optionally one folder, a name search, and a sort. */
export interface HealthGridQuery {
  chip: HealthChip;
  /** A folder's key for it and everything under it, null for the root alone, absent for every folder. */
  folderKey?: string | null;
  /**
   * Only the items directly in the folder, not in the folders under it: the breakdown's line of items
   * directly in a folder opens the list on those (design §16.15).
   */
  exact?: boolean;
  search: string;
  sort: HealthSort;
}

/** One folder's entries in the grid, with what they come to. */
export interface HealthGroup {
  /** The folder's key, {@link ORPHAN_GROUP} for the orphaned files, or empty for the root. */
  key: string;
  /** The folder's path as the grid says it (`Products / Archive`); empty for the root and the orphaned files. */
  label: string;
  entries: HealthEntry[];
  /** The bytes known. */
  bytes: number;
  /** How many have no size, so the group says "at least" as the rows do. */
  unknown: number;
}

/** Whether a group's checkbox is ticked, empty, or in between. */
export type HealthGroupState = 'all' | 'some' | 'none';

/**
 * The one group every orphaned file is in. Umbraco keeps each file in a folder of its own with a random
 * name (`/media/1pjnlrr4/photo.png`), so the plan's group per directory was a group per file: 81 groups
 * of one on the first real run (design §16.14). The names mean nothing to people, and an orphaned file
 * belongs to no folder of the library anyway.
 */
export const ORPHAN_GROUP = 'orphan:';

/**
 * How many rows a page of the list holds (design §16.17), as core's collections page theirs: a library
 * with thousands of unused items draws a hundred rows at a time, each a table row with a thumbnail.
 */
export const PAGE_ROWS = 100;

/** One group's part of a page: the whole group, for its checkbox and its count, and its rows on the page. */
export interface HealthPagePart {
  group: HealthGroup;
  entries: HealthEntry[];
  /** Whether the group began on an earlier page, so its row says it goes on. */
  continued: boolean;
}

/** The id an orphaned file has in the grid. */
const orphanId = (orphan: HealthOrphan): string => `orphan:${orphan.relativePath}`;

/**
 * The directory of an orphaned file's path, which the grid groups it under.
 * @param relativePath The path under the media folder.
 * @returns The directory, empty for a file at the top.
 */
const directoryOf = (relativePath: string): string => {
  const slash = relativePath.lastIndexOf('/');
  return slash > 0 ? relativePath.slice(0, slash) : '';
};

/**
 * The file name at the end of a path.
 * @param relativePath The path.
 * @returns The name.
 */
const fileNameOf = (relativePath: string): string => relativePath.slice(relativePath.lastIndexOf('/') + 1);

/**
 * Every entry of the three lists, in their order (largest first), each carrying its keep when one has
 * ended, for the badge.
 * @param lists The three lists.
 * @param ended The keeps that ended, by entry id (`keepingOf`); none by default.
 * @returns The entries, unused first, then orphaned, then oversized.
 */
export function entriesOf(lists: HealthLists, ended: ReadonlyMap<string, HealthKeep> = new Map()): HealthEntry[] {
  const withKeep = (entry: HealthEntry): HealthEntry => {
    const keep = ended.get(entry.orphan ? entry.id : entry.id.toLowerCase());
    return keep ? { ...entry, keep } : entry;
  };
  const ofItem = (kind: HealthKind) => (item: HealthItem): HealthEntry => withKeep({
    id: item.key,
    kind,
    name: item.name,
    bytes: item.sizeBytes ?? 0,
    sized: item.sizeBytes !== null,
    url: item.url,
    folderKey: item.parentKey,
    folderPath: item.path,
    item,
  });
  return [
    ...lists.unused.map(ofItem('unused')),
    ...lists.orphaned.map(
      (orphan): HealthEntry => withKeep({
        id: orphanId(orphan),
        kind: 'orphaned',
        name: fileNameOf(orphan.relativePath),
        bytes: orphan.sizeBytes,
        sized: true,
        url: orphan.url,
        folderKey: null,
        folderPath: directoryOf(orphan.relativePath),
        orphan,
      }),
    ),
    ...lists.oversized.map(ofItem('oversized')),
  ];
}

/**
 * Whether an entry is in the folder asked for: under it at any depth, found by walking its folder's
 * parents by key, as Where the space goes does, so two folders of the same name stay apart. The root
 * (`null`) is the items directly at the root; an orphaned file is in no folder.
 * @param entry The entry.
 * @param folderKey The folder asked for; undefined for every folder.
 * @param parents Each folder's parent, by key.
 * @param exact Whether only the items directly in it count.
 * @returns True when it is in it.
 */
function inFolder(entry: HealthEntry, folderKey: string | null | undefined, parents: ReadonlyMap<string, string | null>, exact = false): boolean {
  if (folderKey === undefined) return true;
  if (entry.orphan) return false;
  if (folderKey === null || exact) return entry.folderKey === folderKey;
  let key: string | null | undefined = entry.folderKey;
  // Bounded by the folder count, so a parent loop in bad data cannot hang the window.
  for (let hops = 0; key && hops <= parents.size; hops++) {
    if (key === folderKey) return true;
    key = parents.get(key);
  }
  return false;
}

/**
 * Each folder's parent, by key.
 * @param folders The folders.
 * @returns The map.
 */
const parentsOf = (folders: ReadonlyArray<HealthFolder>): Map<string, string | null> => new Map(folders.map((folder) => [folder.key, folder.parentKey]));

/**
 * How many entries each tab has in a folder, for the tabs' counts.
 * @param entries Every entry.
 * @param folderKey The folder the grid shows; undefined for every folder.
 * @param folders Every folder.
 * @param exact Whether only the items directly in the folder count.
 * @returns The count per tab.
 */
export function chipCounts(entries: ReadonlyArray<HealthEntry>, folderKey: string | null | undefined, folders: ReadonlyArray<HealthFolder>, exact = false): Record<HealthChip, number> {
  const parents = parentsOf(folders);
  const counts = Object.fromEntries(HEALTH_CHIPS.map((chip) => [chip, 0])) as Record<HealthChip, number>;
  for (const entry of entries) if (inFolder(entry, folderKey, parents, exact)) counts[chipOf(entry)]++;
  return counts;
}

/**
 * A comparison for a sort, by size and then name, so equal sizes keep a stable order.
 * @param sort The sort.
 * @param size Each thing's size.
 * @param name Each thing's name.
 * @returns The comparison.
 */
function compareBy<T>(sort: HealthSort, size: (each: T) => number, name: (each: T) => string): (a: T, b: T) => number {
  const byName = (a: T, b: T) => name(a).localeCompare(name(b), undefined, { sensitivity: 'base', numeric: true });
  if (sort === 'name') return byName;
  const sign = sort === 'largest' ? -1 : 1;
  return (a, b) => sign * (size(a) - size(b)) || byName(a, b);
}

/**
 * The grid: the chip's entries in the folder asked for whose names match the search, grouped by
 * folder (orphaned files all in {@link ORPHAN_GROUP}), the groups and the entries within each in the
 * sort's order.
 * @param entries Every entry.
 * @param query What the grid shows.
 * @param folders Every folder of the check, for the folder filter.
 * @returns The groups.
 */
export function gridOf(entries: ReadonlyArray<HealthEntry>, query: HealthGridQuery, folders: ReadonlyArray<HealthFolder>): HealthGroup[] {
  const parents = parentsOf(folders);
  const search = query.search.trim().toLocaleLowerCase();
  const groups = new Map<string, HealthGroup>();
  for (const entry of entries) {
    if (chipOf(entry) !== query.chip || !inFolder(entry, query.folderKey, parents, query.exact)) continue;
    if (search && !entry.name.toLocaleLowerCase().includes(search)) continue;
    const key = entry.orphan ? ORPHAN_GROUP : (entry.folderKey ?? '');
    const group = groups.get(key) ?? { key, label: labelOf(entry), entries: [], bytes: 0, unknown: 0 };
    group.entries.push(entry);
    group.bytes += entry.bytes;
    if (!entry.sized) group.unknown++;
    groups.set(key, group);
  }
  const entryOrder = compareBy<HealthEntry>(query.sort, (each) => each.bytes, (each) => each.name);
  for (const group of groups.values()) group.entries.sort(entryOrder);
  return [...groups.values()].sort(compareBy<HealthGroup>(query.sort, (each) => each.bytes, (each) => each.label));
}

/**
 * A group's label: a folder's names path with its parts set apart (`Products / Archive`), as the mock
 * draws it. Empty for the root and for the orphaned files, which the grid names in words.
 * @param entry An entry of the group.
 * @returns The label.
 */
function labelOf(entry: HealthEntry): string {
  if (entry.orphan) return '';
  return entry.folderPath.split('/').filter(Boolean).join(' / ');
}

/**
 * How many pages the groups fill, at least one.
 * @param groups The groups.
 * @returns The page count.
 */
export function pageCount(groups: ReadonlyArray<HealthGroup>): number {
  const rows = groups.reduce((sum, group) => sum + group.entries.length, 0);
  return Math.max(1, Math.ceil(rows / PAGE_ROWS));
}

/**
 * One page of the list: {@link PAGE_ROWS} rows in the groups' order, each group cut where the page
 * cuts it. A page past the end is the last.
 * @param groups The groups.
 * @param page The page, from 1.
 * @returns The groups' parts on that page.
 */
export function pageOf(groups: ReadonlyArray<HealthGroup>, page: number): HealthPagePart[] {
  const last = pageCount(groups);
  const from = (Math.min(Math.max(1, page), last) - 1) * PAGE_ROWS;
  const to = from + PAGE_ROWS;
  const parts: HealthPagePart[] = [];
  let at = 0;
  for (const group of groups) {
    const start = Math.max(from, at);
    const end = Math.min(to, at + group.entries.length);
    if (start < end) parts.push({ group, entries: group.entries.slice(start - at, end - at), continued: start > at });
    at += group.entries.length;
  }
  return parts;
}

/**
 * The page a row is on, so the list turns to the row the details pane shows.
 * @param groups The groups.
 * @param id The entry.
 * @returns The page, from 1, or undefined when the row is not in the list.
 */
export function pageWith(groups: ReadonlyArray<HealthGroup>, id: string): number | undefined {
  const at = orderOf(groups).indexOf(id);
  return at < 0 ? undefined : Math.floor(at / PAGE_ROWS) + 1;
}

/**
 * Every row of the list in its order, over every page: what Previous and Next walk.
 * @param groups The groups.
 * @returns The entries' ids.
 */
export function orderOf(groups: ReadonlyArray<HealthGroup>): string[] {
  return groups.flatMap((group) => group.entries.map((entry) => entry.id));
}

/**
 * Where the details pane goes once rows went (design §16.15: an action works on the current row and
 * moves on): the next row of the list still there, or the one before it at the end, or none. A current
 * row that did not go, or that is not in the list, stays.
 * @param order The list's order.
 * @param current The current row.
 * @param gone The rows that went.
 * @returns The row to show next.
 */
export function nextAfter(order: ReadonlyArray<string>, current: string, gone: ReadonlyArray<string>): string | undefined {
  const went = new Set(gone);
  const at = order.indexOf(current);
  if (!went.has(current) || at < 0) return current;
  const after = order.slice(at + 1).find((id) => !went.has(id));
  return after ?? order.slice(0, at).reverse().find((id) => !went.has(id));
}

/**
 * What is selected in the grid, by entry id. Immutable: every change gives a new selection, so Lit
 * sees it change and nothing is shared by accident.
 */
export class HealthSelection {
  /** The ids selected. */
  readonly ids: ReadonlySet<string>;

  /**
   * @param ids The ids selected; none by default.
   */
  constructor(ids: Iterable<string> = []) {
    this.ids = new Set(ids);
  }

  /** How many are selected. */
  get count(): number {
    return this.ids.size;
  }

  /**
   * Whether an entry is selected.
   * @param id The entry's id.
   */
  has(id: string): boolean {
    return this.ids.has(id);
  }

  /**
   * Select an entry, or unselect it when it is.
   * @param id The entry's id.
   * @returns The new selection.
   */
  toggle(id: string): HealthSelection {
    const next = new Set(this.ids);
    if (!next.delete(id)) next.add(id);
    return new HealthSelection(next);
  }

  /**
   * Select or unselect many at once, as a drag over rows or down the checkbox column does.
   * @param ids The entries.
   * @param on Whether they end up selected.
   * @returns The new selection.
   */
  with(ids: Iterable<string>, on: boolean): HealthSelection {
    const next = new Set(this.ids);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    return new HealthSelection(next);
  }

  /**
   * Tick a group's checkbox: select all of it, or, when all of it is selected, none of it. A group
   * partly selected selects the rest, as a folder checkbox does everywhere.
   * @param group The group.
   * @returns The new selection.
   */
  toggleGroup(group: HealthGroup): HealthSelection {
    const next = new Set(this.ids);
    const all = this.groupState(group) === 'all';
    for (const entry of group.entries) {
      if (all) next.delete(entry.id);
      else next.add(entry.id);
    }
    return new HealthSelection(next);
  }

  /**
   * Whether a group is all, partly or not selected, for its checkbox.
   * @param group The group.
   */
  groupState(group: HealthGroup): HealthGroupState {
    const selected = group.entries.filter((entry) => this.ids.has(entry.id)).length;
    return selected === 0 ? 'none' : selected === group.entries.length ? 'all' : 'some';
  }

  /**
   * What the selected entries come to.
   * @param entries The entries to look in.
   * @returns Their bytes together.
   */
  bytes(entries: ReadonlyArray<HealthEntry>): number {
    return entries.reduce((sum, entry) => sum + (this.ids.has(entry.id) ? entry.bytes : 0), 0);
  }

  /**
   * The selection less whatever is no longer there, as after a verb took entries away.
   * @param entries The entries there now.
   * @returns The new selection.
   */
  within(entries: ReadonlyArray<HealthEntry>): HealthSelection {
    const present = new Set(entries.map((entry) => entry.id));
    return new HealthSelection([...this.ids].filter((id) => present.has(id)));
  }
}
