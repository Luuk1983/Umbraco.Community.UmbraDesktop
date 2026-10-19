import { itemAt } from '../selection/item-at.js';
import type { UmbraDesktopMediaPlace } from '../manager/location.js';

/**
 * Where a drag would land (design §4, plan task 5.4): one target only, the innermost under the pointer.
 * A folder card or table row of a folder, then a folder in the tree (or the tree's Media root), then
 * the tree's recycle bin, then the folder the window shows. A card that is not a folder is no target of
 * its own: a drop on it lands in its window's folder.
 */

/** A manager window, as a drag sees it. */
export interface UmbraDesktopDragWindow {
  /** The window's element. */
  element: Element;
  /** The place it shows. */
  place(): UmbraDesktopMediaPlace;
}

/**
 * A target.
 * @typeParam W The window, as the caller knows it.
 */
export type UmbraDesktopDropTarget<W extends UmbraDesktopDragWindow = UmbraDesktopDragWindow> =
  /** A folder: its card or row, or its tree item; null is the Media root. */
  | { kind: 'folder'; unique: string | null; via: 'card' | 'tree'; element: Element; window: W }
  /** The folder a window shows, dropped on its open space; null is the Media root. */
  | { kind: 'window'; unique: string | null; window: W }
  /** The recycle bin, in the tree or in a window showing it. */
  | { kind: 'bin'; element?: Element; window: W };

/** The tree's link to the Media root and to the recycle bin. */
const ROOT_LINK = /\/workspace\/media-root(?:\/|$)/;
const BIN_LINK = /\/workspace\/media-recycle-bin-root(?:\/|$)/;

/** Core's grid card and table row, as opposed to a tree item. */
const COLLECTION_TAGS = new Set(['UMB-ENTITY-COLLECTION-ITEM-CARD', 'UUI-TABLE-ROW']);

/**
 * The target under the pointer.
 * @typeParam W The window, as the caller knows it.
 * @param path The drag event's composed path, innermost first.
 * @param windows The manager windows open.
 * @param isFolder Whether an item is a folder: true, false, or undefined while not yet known, which
 * counts as no target of its own until it is.
 * @returns The target, or undefined outside every manager window.
 */
export function targetAt<W extends UmbraDesktopDragWindow>(
  path: ReadonlyArray<EventTarget>,
  windows: ReadonlyArray<W>,
  isFolder: (unique: string) => boolean | undefined,
): UmbraDesktopDropTarget<W> | undefined {
  const window = windows.find((each) => path.includes(each.element));
  if (!window) return undefined;
  for (const node of path) {
    if (node === window.element) break;
    if (!(node instanceof Element)) continue;
    const href = node.getAttribute('href') ?? '';
    if (BIN_LINK.test(href)) return { kind: 'bin', element: node, window };
    if (ROOT_LINK.test(href)) return { kind: 'folder', unique: null, via: 'tree', element: node, window };
    const item = itemAt([node]);
    if (item && isFolder(item.unique)) {
      return { kind: 'folder', unique: item.unique, via: COLLECTION_TAGS.has(node.tagName) ? 'card' : 'tree', element: node, window };
    }
  }
  const place = window.place();
  if (place.kind === 'bin') return { kind: 'bin', window };
  return { kind: 'window', unique: place.kind === 'folder' ? place.unique : null, window };
}

/**
 * The keys of the items a tree shows, read off its links.
 * @param tree The tree host.
 * @returns The keys.
 */
export function treeKeys(tree: Element): string[] {
  const keys: string[] = [];
  const walk = (root: ParentNode) => {
    for (const element of root.querySelectorAll('*')) {
      const key = itemAt([element])?.unique;
      if (key && element.hasAttribute('href')) keys.push(key);
      if (element.shadowRoot) walk(element.shadowRoot);
    }
  };
  walk(tree.shadowRoot ?? tree);
  return keys;
}
