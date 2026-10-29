import type { HealthItem, HealthKeep, HealthKeepKind } from './health.client.js';
import type { HealthKind, HealthLists } from './health-model.js';
import type { HealthEntry } from './health-grid.js';

/**
 * Keeps in the browser (design §16.6): the server stores them and says which have ended; here they
 * are applied to the lists, since the oversized list is decided in the browser and one rule belongs in
 * one place (plan Decision 5). An active keep takes its thing out of every list (Decision 6) and puts
 * it under Kept; an ended one leaves it in its list, with the keep on its row for the badge. Pure, as
 * the rest of the model is.
 */

/** The lists with keeps applied, what is kept, what was kept, and how many each list lost to a keep. */
export interface HealthKeeping {
  /** The three lists less everything kept now. */
  lists: HealthLists;
  /** An entry per active keep whose thing the result still has, each carrying its keep. */
  kept: HealthEntry[];
  /** Each keep that has ended, by its entry's id, so its row can say "kept until". */
  ended: Map<string, HealthKeep>;
  /** Per list, how many kept things would otherwise be in it, for the overview's "n kept". */
  keptCount: Record<HealthKind, number>;
}

/** Each server kind as the window's list names it. */
const KINDS: Record<HealthKeepKind, HealthKind> = { Unused: 'unused', Orphaned: 'orphaned', Oversized: 'oversized' };

/** Each list as the server names the kind a keep is made from. */
export const KEEP_KINDS: Record<HealthKind, HealthKeepKind> = { unused: 'Unused', orphaned: 'Orphaned', oversized: 'Oversized' };

/**
 * The id the entry of a keep's thing has: an item's key, or `orphan:` and the path for an orphaned
 * file, as `entriesOf` names them. A keep on a file is always made from the orphaned list, and one on an
 * item never is, so the kind tells which.
 * @param keep The keep.
 * @returns The entry's id.
 */
export function entryIdOfKeep(keep: HealthKeep): string {
  return keep.kind === 'Orphaned' ? `orphan:${keep.target}` : keep.target.toLowerCase();
}

/**
 * When a keep ends.
 * @param keep The keep.
 * @returns The date, or null for a keep that lasts until someone stops it.
 */
export function keepEndsOn(keep: HealthKeep): Date | null {
  return keep.untilUtc ? new Date(keep.untilUtc) : null;
}

/**
 * Apply keeps to a result's lists.
 * @param lists The three lists as the check found them, nothing left out.
 * @param items Every item of the result, so a kept item no longer in any list is still found for Kept.
 * @param keeps Every keep, as the server lists them.
 * @returns The lists, the kept entries, the ended keeps and the counts.
 */
export function keepingOf(lists: HealthLists, items: ReadonlyArray<HealthItem>, keeps: ReadonlyArray<HealthKeep>): HealthKeeping {
  const active = new Map<string, HealthKeep>();
  const ended = new Map<string, HealthKeep>();
  for (const keep of keeps) {
    const id = entryIdOfKeep(keep);
    // The server keeps one per thing; were there two, the first listed (the newest) wins.
    if (active.has(id) || ended.has(id)) continue;
    (keep.ended ? ended : active).set(id, keep);
  }
  const keptItem = (item: HealthItem) => active.has(item.key.toLowerCase());
  const keptCount: Record<HealthKind, number> = {
    unused: lists.unused.filter(keptItem).length,
    orphaned: lists.orphaned.filter((orphan) => active.has(`orphan:${orphan.relativePath}`)).length,
    oversized: lists.oversized.filter(keptItem).length,
  };
  const kept: HealthEntry[] = [];
  const byKey = new Map(items.map((item) => [item.key.toLowerCase(), item]));
  const byPath = new Map(lists.orphaned.map((orphan) => [`orphan:${orphan.relativePath}`, orphan]));
  for (const [id, keep] of active) {
    const kind = KINDS[keep.kind];
    const orphan = byPath.get(id);
    const item = orphan ? undefined : byKey.get(id);
    if (orphan) {
      const name = orphan.relativePath.slice(orphan.relativePath.lastIndexOf('/') + 1);
      const slash = orphan.relativePath.lastIndexOf('/');
      kept.push({ id, kind, name, bytes: orphan.sizeBytes, sized: true, url: orphan.url, folderKey: null, folderPath: slash > 0 ? orphan.relativePath.slice(0, slash) : '', orphan, keep });
    } else if (item) {
      kept.push({ id: item.key, kind, name: item.name, bytes: item.sizeBytes ?? 0, sized: item.sizeBytes !== null, url: item.url, folderKey: item.parentKey, folderPath: item.path, item, keep });
    }
  }
  return {
    lists: {
      unused: lists.unused.filter((item) => !keptItem(item)),
      orphaned: lists.orphaned.filter((orphan) => !active.has(`orphan:${orphan.relativePath}`)),
      oversized: lists.oversized.filter((item) => !keptItem(item)),
    },
    kept,
    ended,
    keptCount,
  };
}
