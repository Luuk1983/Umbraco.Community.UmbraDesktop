/**
 * A closed tree folder opens when a drag rests on it, so a drop can reach a folder deeper down (design
 * §4, plan task 5.8). Only tree folders: a folder card never opens by itself, because a window that
 * changes folder under the pointer surprises people.
 */

/** How long a drag must rest on a closed tree folder before it opens. */
export const HOVER_EXPAND_MS = 700;

/** Opens the tree folder a drag rests on. */
export class UmbraDesktopHoverExpand {
  /** The tree item the drag rests on. */
  #over?: Element;

  /** The pending opening. */
  #timer?: number;

  /**
   * The drag is over a tree item now, or over none.
   * @param item The tree's menu item, or the link inside it, which is what a real pointer is over;
   * or undefined.
   */
  over(item: Element | undefined): void {
    const menuItem = item ? menuItemOf(item) : undefined;
    if (menuItem === this.#over) return;
    this.cancel();
    this.#over = menuItem;
    // uui keeps `hasChildren` as a property only; it is never reflected to an attribute.
    const folder = menuItem as (Element & { hasChildren?: boolean; showChildren?: boolean }) | undefined;
    if (!folder || !folder.hasChildren || folder.showChildren) return;
    this.#timer = window.setTimeout(() => {
      // The caret is what a person clicks, so core loads and opens the children as it always does.
      const caret = folder.shadowRoot?.querySelector<HTMLElement>('#caret-button, button[aria-label*="expand" i]');
      caret?.click();
    }, HOVER_EXPAND_MS);
  }

  /** Forget the item, as when the drag ends. */
  cancel(): void {
    window.clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#over = undefined;
  }
}

/**
 * The menu item an element belongs to: itself, or the menu item whose shadow root holds it. uui's menu
 * item draws its own link with the item's address, so a pointer over the label is over that link.
 * @param element The element.
 * @returns The menu item, or the element when it is in none.
 */
function menuItemOf(element: Element): Element {
  if (element.tagName === 'UUI-MENU-ITEM') return element;
  const host = (element.getRootNode() as ShadowRoot).host;
  return host?.tagName === 'UUI-MENU-ITEM' ? host : element;
}
