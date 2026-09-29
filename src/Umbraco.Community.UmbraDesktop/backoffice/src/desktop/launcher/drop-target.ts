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
  | { kind: 'group'; groupId: string; after: boolean; stacked: boolean; gap: number }
  | { kind: 'remove' }
  | { kind: 'palette' };

/**
 * What is being dragged, which decides whether tiles are targets or only their groups are, and
 * whether a group card under the pointer lights up (an app goes into it) or gets a bar beside it (a
 * group goes next to it).
 */
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
 * Whether a group card sits in a single column with the cards around it, so the next one is below
 * rather than beside it. Read from where its siblings are rather than from its own shape, because a
 * card's shape does not say how the cards are laid out: the Windows 11 theme stacks cards that can
 * be taller than they are wide, and a grid can hold cards wider than they are tall.
 * @param element The card.
 * @returns True when every card beside it starts at the same left edge.
 */
function isStacked(element: Element): boolean {
  const left = element.getBoundingClientRect().left;
  const siblings = element.parentNode ? [...(element.parentNode as ParentNode).children] : [element];
  return siblings.every((sibling) => Math.abs(sibling.getBoundingClientRect().left - left) < 1);
}

/**
 * Whether the pointer is in the second half of a group card, in the direction the next card lies.
 * @param element The card.
 * @param stacked Whether the cards are in one column.
 * @param x The pointer's client x.
 * @param y The pointer's client y.
 * @returns True for the second half.
 */
function inSecondHalfOfCard(element: Element, stacked: boolean, x: number, y: number): boolean {
  const box = element.getBoundingClientRect();
  return stacked ? y > box.top + box.height / 2 : x > box.left + box.width / 2;
}

/**
 * The gap between a card and the next one in the direction they run, in px: the grid's column gap
 * for cards side by side, its row gap for stacked ones, and 0 where the container sets none. Read
 * from the container's computed style rather than from the cards' positions, because the next card
 * along may be on another row, and it is what lets the landing bar sit in the middle of the gap.
 * @param element The card.
 * @param stacked Whether the cards are in one column.
 * @returns The gap, in px.
 */
function gapAround(element: Element, stacked: boolean): number {
  const parent = element.parentElement;
  if (!parent) return 0;
  const style = getComputedStyle(parent);
  return parseFloat(stacked ? style.rowGap : style.columnGap) || 0;
}

/**
 * A group target for a card, with which half the point is in and the gap the bar sits in.
 * @param element The card.
 * @param group Its group id.
 * @param x The pointer's client x.
 * @param y The pointer's client y.
 * @returns The target.
 */
function groupTarget(element: Element, group: string, x: number, y: number): UmbraDesktopDropTarget {
  const stacked = isStacked(element);
  return { kind: 'group', groupId: group, after: inSecondHalfOfCard(element, stacked, x, y), stacked, gap: gapAround(element, stacked) };
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
    if (drop === 'group' && group) return groupTarget(element, group, x, y);
    if (drop === 'remove') return { kind: 'remove' };
    if (drop === 'palette') return { kind: 'palette' };
  }
  return undefined;
}

/**
 * The class that shows where a drop would land: a bar before or after a tile, a highlighted card for
 * an app going into it, or a bar before or after a card for a group going next to it, with
 * `drop-stacked` when that bar runs across rather than down. Shared by normal mode and arrange mode
 * so the two cannot disagree about what "over" means.
 * @param over The target under the pointer, if any.
 * @param groupId The group being drawn, or the Pinned id.
 * @param alias The tile being drawn; omitted for the card itself.
 * @param dragging What is being dragged; an app when omitted.
 * @returns `drop-before`, `drop-after` (either with ` drop-stacked` on a card), `drop`, or an empty string.
 */
export function dropClassFor(
  over: UmbraDesktopDropTarget | undefined,
  groupId: string,
  alias?: string,
  dragging: UmbraDesktopDragAccept = 'app',
): string {
  if (!over || (over.kind !== 'tile' && over.kind !== 'group') || over.groupId !== groupId) return '';
  if (alias === undefined && dragging === 'group' && over.kind === 'group') {
    return `${over.after ? 'drop-after' : 'drop-before'}${over.stacked ? ' drop-stacked' : ''}`;
  }
  if (alias === undefined) return 'drop';
  return over.kind === 'tile' && over.alias === alias ? (over.after ? 'drop-after' : 'drop-before') : '';
}

/**
 * For a group being dragged over no group card: the group nearest the pointer, so the landing bar
 * never goes out while the pointer is still in the layout. Over the gap between two cards, or above
 * the first group, where Pinned is and a group cannot go, there was no target at all, and a drag to
 * the top of the list showed no marker and dropped nowhere. Only inside the layout pane, so a drag
 * taken out of it still cancels.
 * @param root The launcher's shadow root.
 * @param x The pointer's client x.
 * @param y The pointer's client y.
 * @param exclude Groups that cannot be the target: Pinned, and the group being dragged.
 * @returns The target, or `undefined` outside the layout pane or with no group to land beside.
 */
export function nearestGroupTarget(root: ShadowRoot, x: number, y: number, exclude: ReadonlyArray<string>): UmbraDesktopDropTarget | undefined {
  const pane = root.querySelector('.layout-pane');
  if (!pane) return undefined;
  const area = pane.getBoundingClientRect();
  if (x < area.left || x > area.right || y < area.top || y > area.bottom) return undefined;
  let nearest: { element: HTMLElement; distance: number } | undefined;
  for (const element of pane.querySelectorAll<HTMLElement>('[data-drop="group"]')) {
    const group = element.dataset.group;
    if (!group || exclude.includes(group)) continue;
    const box = element.getBoundingClientRect();
    const dx = Math.max(box.left - x, 0, x - box.right);
    const dy = Math.max(box.top - y, 0, y - box.bottom);
    const distance = Math.hypot(dx, dy);
    if (!nearest || distance < nearest.distance) nearest = { element, distance };
  }
  return nearest ? groupTarget(nearest.element, nearest.element.dataset.group!, x, y) : undefined;
}
