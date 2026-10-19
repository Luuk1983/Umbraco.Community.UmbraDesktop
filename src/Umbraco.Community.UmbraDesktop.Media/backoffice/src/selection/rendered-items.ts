import { itemAt } from './item-at.js';

/**
 * The media items core has drawn in a window: grid cards and table rows, each in its view's own
 * shadow root (plan task 3.5). What the arrow keys, the selection box and the focus work from.
 */

/** One item as core drew it. */
export interface UmbraDesktopRenderedItem {
  /** Its key. */
  unique: string;
  /** The card or row. */
  element: HTMLElement;
  /** Where it is drawn now, in viewport coordinates. */
  rect: DOMRect;
}

/** Core's grid card and table row: what is collected, and what the walk does not go into. */
const ITEM_TAGS = new Set(['UMB-ENTITY-COLLECTION-ITEM-CARD', 'UUI-TABLE-ROW']);

/**
 * Every item drawn under an element, in document order. The walk goes through shadow roots and stops
 * at each card or row, so a card's own link is not counted again and the walk stays short.
 * @param root The element core's collection is rendered under, such as the folder host.
 * @returns The items, each once.
 */
export function renderedItems(root: Element): UmbraDesktopRenderedItem[] {
  const found: UmbraDesktopRenderedItem[] = [];
  const seen = new Set<string>();
  const walk = (node: ParentNode) => {
    for (const element of node.querySelectorAll('*')) {
      if (ITEM_TAGS.has(element.tagName)) {
        const unique = itemAt([element])?.unique;
        if (unique && !seen.has(unique)) {
          seen.add(unique);
          found.push({ unique, element: element as HTMLElement, rect: element.getBoundingClientRect() });
        }
        continue;
      }
      if (element.shadowRoot) walk(element.shadowRoot);
    }
  };
  walk(root.shadowRoot ?? root);
  return found;
}
