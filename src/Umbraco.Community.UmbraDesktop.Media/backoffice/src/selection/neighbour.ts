/**
 * Where the arrow keys move the focus among core's cards or rows (design §3), from where they are
 * drawn. Left and right follow the collection's order, so they run along a row and wrap; up and down
 * go to the nearest item on the row above or below, as in a file manager's icon view; in a table each
 * row is a row of its own.
 */

/** Which way a key moves. */
export type UmbraDesktopMoveDirection = 'up' | 'down' | 'left' | 'right' | 'first' | 'last';

/** An item as drawn: its key and its box on screen. */
export interface UmbraDesktopPlacedItem {
  /** The item's key. */
  unique: string;
  /** Where it is drawn. */
  rect: { left: number; top: number; width: number; height: number };
}

/**
 * The item a key moves to.
 * @param items The items, in the collection's order.
 * @param from The item with the focus, or undefined when none has it.
 * @param direction Which way.
 * @returns The item to focus: the first one when none has the focus, the same one at an edge,
 * undefined when there are none.
 */
export function neighbour(
  items: ReadonlyArray<UmbraDesktopPlacedItem>,
  from: string | undefined,
  direction: UmbraDesktopMoveDirection,
): string | undefined {
  if (!items.length) return undefined;
  const index = from === undefined ? -1 : items.findIndex((item) => item.unique === from);
  if (index < 0 || direction === 'first') return items[0].unique;
  if (direction === 'last') return items[items.length - 1].unique;
  if (direction === 'left') return items[Math.max(0, index - 1)].unique;
  if (direction === 'right') return items[Math.min(items.length - 1, index + 1)].unique;

  const current = items[index].rect;
  const centre = (r: UmbraDesktopPlacedItem['rect']) => r.left + r.width / 2;
  // Another row is one whose top is at least half a row away, so a card a pixel lower in the same
  // row does not count as below.
  const half = current.height / 2;
  const rows = items.filter((item) =>
    direction === 'down' ? item.rect.top > current.top + half : item.rect.top < current.top - half,
  );
  if (!rows.length) return items[index].unique;
  const nearestTop = rows.reduce(
    (best, item) => (Math.abs(item.rect.top - current.top) < Math.abs(best - current.top) ? item.rect.top : best),
    rows[0].rect.top,
  );
  const row = rows.filter((item) => Math.abs(item.rect.top - nearestTop) < half);
  return row.reduce((best, item) =>
    Math.abs(centre(item.rect) - centre(current)) < Math.abs(centre(best.rect) - centre(current)) ? item : best,
  ).unique;
}
