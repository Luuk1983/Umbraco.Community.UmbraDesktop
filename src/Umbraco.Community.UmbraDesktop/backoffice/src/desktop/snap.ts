import type { Rect } from './types';

/**
 * Where a drag into a desktop edge puts a window.
 *
 * Three, not eight: no corners and no quarters. The desktop's whole argument for existing is a
 * backoffice you can see two of at once, and a quarter of a laptop screen is not a backoffice. See
 * the design note on `snapRect` for what happens when even a half is not.
 */
export type UmbraDesktopSnapTarget = 'left' | 'right' | 'top';

/**
 * Which snap, if any, a pointer at this position is asking for.
 *
 * The zone is a band `edge` px wide along the inside of each edge and **unbounded outwards**: a
 * drag is held by pointer capture, so the pointer routinely overshoots the surface it is snapping
 * into, and reading that overshoot as "no longer in the zone" would cancel the one snap the user is
 * most plainly asking for.
 *
 * Sides are tested before the top, which is the only judgement call here. The drag clamp pins a
 * dragged titlebar to `y >= 0`, so a pointer heading for the left edge spends much of the trip
 * within a few pixels of the top one, and a corner that maximized would turn "put this on the left"
 * into "fill the screen" at random. The top edge still offers maximize along its whole length
 * between the two side bands, which is the whole of it in any desktop wide enough to snap into.
 * Pure.
 * @param pointer The pointer position, relative to the desktop surface's top-left corner.
 * @param bounds The desktop surface size in px.
 * @param edge How far into the surface a snap zone reaches; see `UMBRADESKTOP_SNAP_EDGE`.
 * @returns The snap on offer, or undefined away from every edge.
 */
export function snapTargetAt(
  pointer: { x: number; y: number },
  bounds: { w: number; h: number },
  edge: number,
): UmbraDesktopSnapTarget | undefined {
  if (pointer.x <= edge) return 'left';
  if (pointer.x >= bounds.w - edge) return 'right';
  if (pointer.y <= edge) return 'top';
  return undefined;
}

/**
 * The rectangle a snap lands a window in.
 *
 * **The halves are allowed to overlap.** A window is snapped to half the desktop unless half is
 * below what that window can work in, and then it keeps its own minimum and the two halves grow
 * into each other. This is deliberate and it is the whole of the policy issue #13 asks for: the
 * apps most likely to be snapped are `full-section` ones, which declare no minimum of their own and
 * so sit on `UMBRADESKTOP_WINDOW_MIN_SIZE`'s 320px floor — and a content window snapped to 320px
 * satisfies every constraint in sight while being of no use to anybody. Tiling is the illusion;
 * a window you can work in is the point.
 *
 * The one thing it will not do is ask for a window wider than the desktop. Past that point the
 * window's own inline `min-width` is what is actually in force, exactly as it is for a maximized
 * window, and adding an `x` on top of it would only hang the titlebar off an edge as well.
 *
 * The two halves are derived from one rounding so that they tile exactly on an odd width rather
 * than leaving a pixel of wallpaper down the middle or overlapping by one. Pure.
 * @param target Which snap.
 * @param bounds The desktop surface size in px.
 * @param min The smallest window this particular window may be, chrome included.
 * @returns The rectangle to put the window in.
 */
export function snapRect(
  target: UmbraDesktopSnapTarget,
  bounds: { w: number; h: number },
  min: { w: number; h: number },
): Rect {
  if (target === 'top') return { x: 0, y: 0, w: bounds.w, h: bounds.h };
  const split = Math.round(bounds.w / 2);
  const half = target === 'left' ? split : bounds.w - split;
  const w = Math.min(bounds.w, Math.max(half, min.w));
  return { x: target === 'left' ? 0 : bounds.w - w, y: 0, w, h: bounds.h };
}
