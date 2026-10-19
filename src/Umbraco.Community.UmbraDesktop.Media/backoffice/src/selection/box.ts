/**
 * The selection box: a rubber band dragged from empty space over core's cards or rows (design §3).
 * Core has none, so the geometry is ours, in viewport coordinates, the space `getBoundingClientRect`
 * reports in.
 */

/** A box in viewport coordinates. */
export interface UmbraDesktopBox {
  /** Its left edge. */
  left: number;
  /** Its top edge. */
  top: number;
  /** Its right edge. */
  right: number;
  /** Its bottom edge. */
  bottom: number;
}

/** A point in viewport coordinates. */
export interface UmbraDesktopPoint {
  /** Across. */
  x: number;
  /** Down. */
  y: number;
}

/**
 * The box between where the drag started and where the pointer is, whichever way it was dragged.
 * @param a One corner.
 * @param b The other.
 * @returns The box.
 */
export function boxBetween(a: UmbraDesktopPoint, b: UmbraDesktopPoint): UmbraDesktopBox {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
}

/**
 * The items the box touches: any overlap counts, as in a file manager.
 * @param box The box.
 * @param items The items and where they are drawn.
 * @returns The keys it covers, in the order given.
 */
export function intersecting(
  box: UmbraDesktopBox,
  items: ReadonlyArray<{ unique: string; rect: UmbraDesktopBox }>,
): string[] {
  return items
    .filter(({ rect }) => rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top)
    .map((item) => item.unique);
}
