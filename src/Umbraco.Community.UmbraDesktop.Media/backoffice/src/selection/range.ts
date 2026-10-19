/**
 * Shift ranges over the items in the order the collection shows them (design §3). The order is core's
 * own, from its collection context, so grid and table give the same range.
 */

/**
 * The items from an anchor to an item, inclusive, in the collection's order.
 * @param order Every item's key, in the order shown.
 * @param anchor Where the range starts: the item last clicked or toggled. Undefined or gone means the
 * range is the item alone.
 * @param to The item the range ends at.
 * @returns The keys in the range, in order; empty when `to` is not shown.
 */
export function rangeBetween(order: ReadonlyArray<string>, anchor: string | undefined, to: string): string[] {
  const end = order.indexOf(to);
  if (end < 0) return [];
  const start = anchor === undefined ? -1 : order.indexOf(anchor);
  if (start < 0) return [to];
  return order.slice(Math.min(start, end), Math.max(start, end) + 1);
}
