/**
 * The tray's order of appearance (design D14): oldest first, which is nearest the clock.
 *
 * Package items carry no weight, so this is the only order they have: an item that becomes visible
 * joins at the end furthest from the clock and keeps its place while it stays visible, the way a
 * Windows tray icon appears at the far end when its program starts. Not stored: after a reload items
 * take their places as they appear again, which is what Windows does after a restart too.
 */

/**
 * The order after a change in which items are visible.
 * @param order The current order, oldest first.
 * @param visible The aliases visible now, in registry order. Simultaneous arrivals keep that order.
 * @returns The new order: survivors in place, newcomers appended at the far end. An item that hid
 * is gone from it, so when it shows again it rejoins at the far end rather than taking back its seat.
 */
export function nextTrayOrder(order: ReadonlyArray<string>, visible: ReadonlyArray<string>): string[] {
  const kept = order.filter((alias) => visible.includes(alias));
  return [...kept, ...visible.filter((alias) => !kept.includes(alias))];
}

/**
 * The CSS `order` for an item. The tray renders items in DOM order followed by the host's features
 * and the clock at `order: 0`; negative numbers put package items before them, and the newest gets
 * the most negative, which is furthest from the clock. Reordering with `order` instead of moving DOM
 * nodes matters: moving a node disconnects and reconnects it, which would restart a tray item.
 * @param order The current order, oldest first.
 * @param alias The item.
 * @returns Its flex order, always negative for an item in the order.
 */
export function trayFlexOrder(order: ReadonlyArray<string>, alias: string): number {
  return -(order.indexOf(alias) + 1);
}
