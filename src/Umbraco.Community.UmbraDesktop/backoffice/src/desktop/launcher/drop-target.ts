/**
 * What is under the pointer during a drag, read from `data-drop` attributes the launcher renders:
 *
 * - `data-drop="tile" data-group data-alias` on a tile
 * - `data-drop="group" data-group` on a group card, and on Pinned with the Pinned id
 * - `data-drop="remove"` on the remove pane, `data-drop="palette"` on arrange mode's palette
 *
 * Attributes rather than a map of elements, so the drag controller needs nothing from the templates
 * beyond what they already render, and a test can build a board out of plain divs.
 */

/** Where a drop would land. */
export type UmbraDesktopDropTarget =
  | { kind: 'tile'; groupId: string; alias: string; after: boolean }
  | { kind: 'group'; groupId: string; after: boolean }
  | { kind: 'remove' }
  | { kind: 'palette' };

/** What is being dragged, which decides whether tiles are targets or only their groups are. */
export type UmbraDesktopDragAccept = 'app' | 'group';

/**
 * Whether the pointer is in the second half of an element: the right half of a tile in a grid, the
 * lower half of a row in a single column. A box more than twice as wide as it is tall is a row,
 * which is what Windows 98 and Umbraco 4 turn tiles and groups into.
 * @param element The element.
 * @param x The pointer's client x.
 * @param y The pointer's client y.
 * @returns True for the second half.
 */
function inSecondHalf(element: Element, x: number, y: number): boolean {
  const box = element.getBoundingClientRect();
  return box.width > box.height * 2 ? y > box.top + box.height / 2 : x > box.left + box.width / 2;
}

/**
 * The drop target at a point in one shadow root.
 * @param root The launcher's shadow root.
 * @param x The pointer's client x.
 * @param y The pointer's client y.
 * @param accept `app` to land on tiles, `group` to look through tiles to their group.
 * @returns The target, or `undefined` over nothing that takes a drop.
 */
export function dropTargetAt(
  root: ShadowRoot,
  x: number,
  y: number,
  accept: UmbraDesktopDragAccept,
): UmbraDesktopDropTarget | undefined {
  const selector = accept === 'group' ? '[data-drop="group"]' : '[data-drop]';
  for (const hit of root.elementsFromPoint(x, y)) {
    const element = hit.closest<HTMLElement>(selector);
    if (!element || !root.contains(element)) continue;
    const { drop, group, alias } = element.dataset;
    if (drop === 'tile' && group && alias) return { kind: 'tile', groupId: group, alias, after: inSecondHalf(element, x, y) };
    if (drop === 'group' && group) return { kind: 'group', groupId: group, after: inSecondHalf(element, x, y) };
    if (drop === 'remove') return { kind: 'remove' };
    if (drop === 'palette') return { kind: 'palette' };
  }
  return undefined;
}

/**
 * The class that shows where a drop would land: a bar before or after a tile, or a highlighted card.
 * Shared by normal mode and arrange mode so the two cannot disagree about what "over" means.
 * @param over The target under the pointer, if any.
 * @param groupId The group being drawn, or the Pinned id.
 * @param alias The tile being drawn; omitted for the card itself.
 * @returns `drop-before`, `drop-after`, `drop`, or an empty string.
 */
export function dropClassFor(over: UmbraDesktopDropTarget | undefined, groupId: string, alias?: string): string {
  if (!over || (over.kind !== 'tile' && over.kind !== 'group') || over.groupId !== groupId) return '';
  if (alias === undefined) return 'drop';
  return over.kind === 'tile' && over.alias === alias ? (over.after ? 'drop-after' : 'drop-before') : '';
}
