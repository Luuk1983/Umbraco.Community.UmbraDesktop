import { UmbRequestReloadChildrenOfEntityEvent, UmbRequestReloadStructureForEntityEvent } from '@umbraco-cms/backoffice/entity-action';

/**
 * How much is in the recycle bin, said on its row in the tree (owner's test, 2026-10-18: "you can't see
 * if there are any items in the recycle bin"). The bin's row is core's tree root, which core labels by
 * translating every `#key` in its name, so the count goes in the name and the label stays translated.
 *
 * Core reloads a tree's root only when asked to reload its structure, which nothing asks after a trash,
 * a restore or an empty. So the desktop context watches core's reload events for media and asks every
 * bin row to reload once they settle.
 */

/** How long after the last media change the bin is recounted: one recount for an operation's events. */
export const BIN_RECOUNT_MS = 300;

/** The entity types whose changes can change what is in the bin. */
const MEDIA_TYPES = new Set(['media', 'media-root', 'media-recycle-bin-root']);

/** The bin's root, as core's events name it. */
const BIN_ROOT = 'media-recycle-bin-root';

/**
 * The bin's name with its count.
 * @param name Core's name for it, a `#key`.
 * @param count How many items are at its top.
 * @returns The name, with the count when there is anything in it.
 */
export function binRootName(name: string, count: number): string {
  return count > 0 ? `${name} (${count})` : name;
}

/**
 * Ask every bin row to reload, and so recount, after media changes.
 * @param events Core's action event context.
 * @returns Stops watching.
 */
export function watchBinChanges(events: EventTarget): () => void {
  let timer: number | undefined;
  const onChange = (event: Event) => {
    const change = event as UmbRequestReloadChildrenOfEntityEvent | UmbRequestReloadStructureForEntityEvent;
    const type = change.getEntityType();
    if (!MEDIA_TYPES.has(type)) return;
    // Its own ask, coming back.
    if (event.type === UmbRequestReloadStructureForEntityEvent.TYPE && type === BIN_ROOT) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      events.dispatchEvent(new UmbRequestReloadStructureForEntityEvent({ entityType: BIN_ROOT, unique: null }));
    }, BIN_RECOUNT_MS);
  };
  events.addEventListener(UmbRequestReloadChildrenOfEntityEvent.TYPE, onChange);
  events.addEventListener(UmbRequestReloadStructureForEntityEvent.TYPE, onChange);
  return () => {
    window.clearTimeout(timer);
    events.removeEventListener(UmbRequestReloadChildrenOfEntityEvent.TYPE, onChange);
    events.removeEventListener(UmbRequestReloadStructureForEntityEvent.TYPE, onChange);
  };
}
