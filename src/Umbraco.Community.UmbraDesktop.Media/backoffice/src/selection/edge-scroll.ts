/**
 * How fast a list scrolls while a selection box is dragged near its top or bottom edge (Media Cleanup,
 * design §16.15), as in a file manager: nothing away from the edges, faster the deeper into an edge,
 * and full speed past it. The Media Manager's box has no edge scrolling, since core's collection
 * scrolls its own way; this is the list's. Pure, so the curve is tested without a pointer.
 */

/** How deep the zone at each edge is, in CSS pixels. */
export const EDGE_SCROLL_ZONE = 32;

/** The fastest it scrolls, in CSS pixels a frame: reached at the edge and past it. */
export const EDGE_SCROLL_MAX = 18;

/**
 * The scroll for a pointer at a height, a frame.
 * @param y The pointer, in viewport coordinates.
 * @param top The list's visible top edge, in viewport coordinates.
 * @param bottom Its visible bottom edge.
 * @returns Pixels to scroll this frame: negative up, positive down, 0 for none.
 */
export function edgeScrollSpeed(y: number, top: number, bottom: number): number {
  // A list shorter than two zones splits at its middle, so no point is in both.
  const zone = Math.min(EDGE_SCROLL_ZONE, (bottom - top) / 2);
  if (zone <= 0) return 0;
  const speed = (depth: number) => Math.round(Math.min(1, depth / zone) * EDGE_SCROLL_MAX) || 1;
  const up = top + zone - y;
  if (up > 0 && y <= top + (bottom - top) / 2) return -speed(up);
  const down = y - (bottom - zone);
  if (down > 0) return speed(down);
  return 0;
}
