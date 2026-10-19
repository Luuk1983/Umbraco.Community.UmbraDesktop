/**
 * Which media item a press, a click or a drag is on, in views the manager did not write (hosting
 * spike, "Dragging between windows"). Read off the composed event path, inside out, with the first of
 * three rules that matches on an element:
 *
 * 1. an element with `.item.unique`: core's entity collection item contract, which grid cards have;
 * 2. an element with `data-sortable-id`: every row of core's `umb-table`;
 * 3. a link to an item's edit page, or anything else carrying one as its `href`, as core's cards do.
 */

/** A media item found under the pointer. */
export interface UmbraDesktopMediaItemRef {
  /** Its key. */
  unique: string;
  /** Its entity type: `media`, unless core's item says otherwise. */
  entityType: string;
}

/** An item's edit page, with the key after it. */
const EDIT = /\/edit\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i;

/**
 * The item a composed path is on.
 * @param path The event's composed path, innermost first.
 * @param boundary Where to stop looking, such as the manager element, so nothing outside counts.
 * @returns The item, or undefined over empty space.
 */
export function itemAt(path: ReadonlyArray<EventTarget>, boundary?: EventTarget): UmbraDesktopMediaItemRef | undefined {
  for (const node of path) {
    if (node === boundary) return undefined;
    const item = (node as { item?: { unique?: unknown; entityType?: unknown } }).item;
    if (item && typeof item.unique === 'string' && item.unique) {
      return { unique: item.unique, entityType: typeof item.entityType === 'string' ? item.entityType : 'media' };
    }
    if (!(node instanceof Element)) continue;
    const sortable = node.getAttribute('data-sortable-id');
    if (sortable) return { unique: sortable, entityType: 'media' };
    // A link, or core's grid card, which carries its link's `href` itself.
    const key = EDIT.exec(node.getAttribute('href') ?? '')?.[1];
    if (key) return { unique: key, entityType: 'media' };
  }
  return undefined;
}
