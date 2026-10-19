/**
 * The item a manager window has open beside it (#144, design §8).
 *
 * One item per window, under one key the window asks the desktop for (`umbradesktop-open-attached`),
 * on core's own media workspace route. The desktop reports what is open in the window's `attached`
 * property, and the card of that item gets a pink border: Umbraco's current-item colour, the same as
 * the open folder in the tree. It is needed because selecting never changes what is open, so with
 * several items selected the border is what says which one the pane shows.
 */

/** The key a manager window opens its item under; one item per window. */
export const UMBRADESKTOP_OPEN_ITEM_KEY = 'item';

/** The id of the rule written into each view that draws cards or rows. */
const STYLE_ID = 'umbradesktop-media-open-item';

/** A media key. */
const KEY = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** Core's media edit page, with anything core adds after the key. */
const EDIT = new RegExp(`/workspace/media/edit/(${KEY})(?:[/?#]|$)`, 'i');

/**
 * The page an item opens on: core's media workspace, on the Media section's path, as launcher search
 * opens it. Only ever loaded in a frame beside the window, never in the desktop's address.
 * @param unique The item's key.
 * @returns The path.
 */
export function editPath(unique: string): string {
  return `/umbraco/section/media/workspace/media/edit/${unique}`;
}

/**
 * The key of the item open beside the window, read off its page.
 * @param attached What the desktop says is open beside the window.
 * @returns The key, or undefined when nothing is open or a new item without a key is being created.
 */
export function openKeyFrom(attached: Readonly<Record<string, string>> | undefined): string | undefined {
  const path = attached?.[UMBRADESKTOP_OPEN_ITEM_KEY];
  return path ? EDIT.exec(path)?.[1]?.toLowerCase() : undefined;
}

/**
 * The rule that rings one item: core's grid card by its link, core's table row by its sortable id.
 * Drawn as an outline, so nothing in core's layout moves.
 * @param key The item's key.
 * @returns The CSS.
 */
function ringFor(key: string): string {
  return `
    umb-entity-collection-item-card[href$="/edit/${key}"],
    uui-table-row[data-sortable-id="${key}"] {
      outline: 3px solid var(--uui-color-current, #f5c1bc);
      outline-offset: 2px;
      border-radius: var(--uui-border-radius, 3px);
    }
    uui-table-row[data-sortable-id="${key}"] {
      outline-offset: -3px;
    }
  `;
}

/** Elements whose own shadow roots hold nothing to mark, so the walk does not go into them. */
const MARKED = new Set(['UMB-ENTITY-COLLECTION-ITEM-CARD', 'UUI-TABLE-ROW']);

/**
 * Put the ring on the open item, or take it away.
 * @param root The element core's collection is rendered under.
 * @param key The open item's key, or undefined for none.
 * @returns Whether any cards or rows were found, so a caller knows the view has rendered.
 */
export function markOpenItem(root: Element, key: string | undefined): boolean {
  return writeViewStyle(root, STYLE_ID, key ? ringFor(key) : '');
}

/**
 * The selector for one item in core's views: its grid card by its link, its table row by its sortable
 * id.
 * @param key The item's key.
 * @returns The selector.
 */
export function itemSelector(key: string): string {
  return `umb-entity-collection-item-card[href$="/edit/${key}"], uui-table-row[data-sortable-id="${key}"]`;
}

/**
 * Write a rule into each shadow root under `root` that draws core's cards or rows, which is where a
 * selector can reach them; core's own markup is left alone. Cheap to run again: the walk stops at the
 * cards, and a rule already right is not written.
 * @param root The element core's collection is rendered under.
 * @param id The rule's id, one per purpose.
 * @param css The rule, or an empty string to take it away.
 * @param probe What a shadow root must hold to get the rule: core's cards and rows unless told, the
 * tree's menu items for a rule about the tree.
 * @returns Whether any were found, so a caller knows the view has rendered.
 */
export function writeViewStyle(root: Element, id: string, css: string, probe = 'umb-entity-collection-item-card, uui-table-row'): boolean {
  let found = false;
  const queue: Array<ShadowRoot | Element> = [root.shadowRoot ?? root];
  while (queue.length) {
    const node = queue.shift()!;
    if (node instanceof ShadowRoot && node.querySelector(probe)) {
      found = true;
      let style = node.getElementById(id) as HTMLStyleElement | null;
      if (!style && css) {
        style = document.createElement('style');
        style.id = id;
        node.appendChild(style);
      }
      if (style && style.textContent !== css) style.textContent = css;
    }
    for (const element of node.querySelectorAll('*')) {
      if (element.shadowRoot && !MARKED.has(element.tagName)) queue.push(element.shadowRoot);
    }
  }
  return found;
}
