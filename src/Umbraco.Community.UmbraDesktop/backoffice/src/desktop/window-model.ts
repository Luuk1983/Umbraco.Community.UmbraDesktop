import type { Rect, UmbraDesktopWindow, UmbraDesktopWindowState } from './types';

const CASCADE_STEP = 28;
const CASCADE_WRAP = 6;
const CASCADE_ORIGIN = 40;

/** The z-index a newly focused/opened window should take (front of the stack). */
export function nextZIndex(windows: ReadonlyArray<UmbraDesktopWindow>): number {
  return windows.reduce((max, w) => Math.max(max, w.z), 0) + 1;
}

/** A cascaded rectangle for the Nth opened window, using the app's default size. */
export function nextWindowRect(count: number, size: { w: number; h: number }): Rect {
  const step = (count % CASCADE_WRAP) * CASCADE_STEP;
  return { x: CASCADE_ORIGIN + step, y: CASCADE_ORIGIN + step, w: size.w, h: size.h };
}

/** Return a new list where `id` is active, front-most and un-minimized. */
export function focusWindow(
  windows: ReadonlyArray<UmbraDesktopWindow>,
  id: string,
): UmbraDesktopWindow[] {
  const top = nextZIndex(windows);
  return windows.map((w) =>
    w.id === id
      ? { ...w, active: true, z: top, state: w.state === 'minimized' ? 'normal' : w.state }
      : { ...w, active: false },
  );
}

/** Return a new list without `id`. */
export function removeWindow(
  windows: ReadonlyArray<UmbraDesktopWindow>,
  id: string,
): UmbraDesktopWindow[] {
  return windows.filter((w) => w.id !== id);
}

/** Return a new list with `id`'s rectangle moved to (x, y). */
export function moveWindow(
  windows: ReadonlyArray<UmbraDesktopWindow>,
  id: string,
  x: number,
  y: number,
): UmbraDesktopWindow[] {
  return windows.map((w) => (w.id === id ? { ...w, rect: { ...w.rect, x, y } } : w));
}

/** Return a new list with `id`'s window state set. */
export function setWindowState(
  windows: ReadonlyArray<UmbraDesktopWindow>,
  id: string,
  state: UmbraDesktopWindowState,
): UmbraDesktopWindow[] {
  return windows.map((w) => (w.id === id ? { ...w, state } : w));
}

/**
 * The first open window hosting the given app alias, if any. Used to enforce
 * `allowMultiple: false` by focusing an existing instance instead of duplicating.
 * @param windows The current window list.
 * @param appAlias The app alias to look for.
 * @returns The matching window, or undefined.
 */
export function findAppWindow(
  windows: ReadonlyArray<UmbraDesktopWindow>,
  appAlias: string,
): UmbraDesktopWindow | undefined {
  return windows.find((w) => w.app.alias === appAlias);
}

/**
 * Decide what clicking a window's taskbar button should do, mirroring Windows/KDE tasklist
 * behaviour: clicking the already-focused window minimizes it (a toggle), while clicking any
 * other — inactive or minimized — brings it to the front (`focusWindow` restores minimized ones).
 * @param w The window whose taskbar button was clicked (only its focus + state matter).
 * @returns `'minimize'` to hide the active window, or `'focus'` to surface it.
 */
export function taskActivation(w: Pick<UmbraDesktopWindow, 'active' | 'state'>): 'minimize' | 'focus' {
  return w.active && w.state !== 'minimized' ? 'minimize' : 'focus';
}

/** Which edges of a window a resize drag is pulling. */
export interface UmbraDesktopResizeEdges {
  /** Dragging the left edge (moves the origin). */
  left?: boolean;
  /** Dragging the right edge (grows width only). */
  right?: boolean;
  /** Dragging the top edge (moves the origin). */
  top?: boolean;
  /** Dragging the bottom edge (grows height only). */
  bottom?: boolean;
}

/**
 * Compute a new rectangle when the given edges of `start` are dragged by (dx, dy),
 * clamped so width/height never drop below `min`. Right/bottom edges change size only;
 * left/top edges move the origin (and pin it so the minimum size is never violated). Pure.
 * @param start The rectangle at the moment the resize began.
 * @param edges Which edges are being dragged.
 * @param dx Horizontal pointer delta from the resize start.
 * @param dy Vertical pointer delta from the resize start.
 * @param min Minimum width/height.
 * @returns The new rectangle.
 */
export function resizeRect(
  start: Rect,
  edges: UmbraDesktopResizeEdges,
  dx: number,
  dy: number,
  min: { w: number; h: number },
): Rect {
  let { x, y, w, h } = start;
  if (edges.right) w = Math.max(min.w, start.w + dx);
  if (edges.bottom) h = Math.max(min.h, start.h + dy);
  if (edges.left) {
    w = Math.max(min.w, start.w - dx);
    x = start.x + (start.w - w);
  }
  if (edges.top) {
    h = Math.max(min.h, start.h - dy);
    y = start.y + (start.h - h);
  }
  return { x, y, w, h };
}

/**
 * Clamp a proposed window position so the window can always be dragged back: every real window
 * manager refuses to let a window be lost off-screen. What has to stay reachable is not "some of
 * the window" but the part you can actually grab — the titlebar minus the controls at its right
 * end, which swallow pointerdown so their buttons stay clickable. Keeping only the window's right
 * edge on screen would leave nothing but those buttons: visible, but undraggable. Pure.
 * @param proposed The rectangle the drag is asking for (its `w` decides how far it may hang).
 * @param bounds The desktop surface size in px.
 * @param keep The margins to honour: `grab` px of draggable titlebar, `controls` px of
 * non-draggable buttons at its right end, and `titlebar` px kept above the desktop bottom.
 * @returns The clamped position.
 */
export function clampWindowPosition(
  proposed: Rect,
  bounds: { w: number; h: number },
  keep: { grab: number; controls: number; titlebar: number },
): { x: number; y: number } {
  // The draggable strip runs from the window's left edge to where the controls begin.
  const strip = Math.max(0, proposed.w - keep.controls);
  // Never ask for more than exists: a window with no strip at all (narrower than its own controls)
  // simply stays wholly on screen rather than being shunted inward by an impossible margin.
  const grab = Math.min(keep.grab, strip);
  const lo = strip > 0 ? grab - strip : 0;
  const hi = strip > 0 ? bounds.w - grab : bounds.w - proposed.w;
  return {
    x: clamp(proposed.x, lo, hi),
    y: clamp(proposed.y, 0, bounds.h - Math.min(keep.titlebar, proposed.h)),
  };
}

/**
 * Clamp `value` into [lo, hi], with `lo` winning if the range is inverted (which happens when the
 * desktop is smaller than the margin we want to keep visible).
 * @param value The value to clamp.
 * @param lo The lower bound.
 * @param hi The upper bound.
 * @returns The clamped value.
 */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(lo, hi), Math.max(lo, value));
}

/**
 * Where a maximized window should land when its titlebar is dragged. Dragging a maximized window
 * un-maximizes it, and the restored window has to arrive under the pointer or the drag feels like
 * the window jumped out of your hand: the pointer keeps the same *proportional* grip along the
 * titlebar it had while maximized (Windows and macOS both do this). The window lands flush with the
 * desktop top, so the pointer also keeps its depth into the bar. Pure.
 * @param pointerX The pointer's x position relative to the desktop surface's left edge.
 * @param bounds The desktop surface width in px.
 * @param size The size the window restores to.
 * @returns The position to restore the window at; always fully inside the desktop.
 */
export function restoreDragPosition(
  pointerX: number,
  bounds: { w: number },
  size: { w: number },
): { x: number; y: number } {
  const ratio = bounds.w > 0 ? pointerX / bounds.w : 0;
  return { x: Math.round(pointerX - ratio * size.w), y: 0 };
}

/**
 * Re-clamp every window after the desktop itself changed size. Shrinking the viewport (undocking a
 * monitor, opening devtools, rotating a tablet) can strand a window outside the new surface just as
 * surely as dragging it there, and nothing but this pass would bring it back. Sizes are left alone —
 * only positions move, so an oversized window can still be resized by hand. Pure.
 * @param windows The current window list.
 * @param bounds The new desktop surface size in px.
 * @param keep How much of each window must stay visible; see {@link clampWindowPosition}.
 * @returns A new list, or the input list unchanged when every window is already in reach.
 */
export function clampWindowsToBounds(
  windows: UmbraDesktopWindow[],
  bounds: { w: number; h: number },
  keep: { grab: number; controls: number; titlebar: number },
): UmbraDesktopWindow[] {
  let moved = false;
  const next = windows.map((w) => {
    const pos = clampWindowPosition(w.rect, bounds, keep);
    if (pos.x === w.rect.x && pos.y === w.rect.y) return w;
    moved = true;
    return { ...w, rect: { ...w.rect, ...pos } };
  });
  return moved ? next : windows;
}

/**
 * Keep a resized rectangle's origin inside the desktop's top-left corner, holding the opposite
 * edge still so the resize reads as "the edge stopped at the border". Without this, dragging the
 * top edge upward walks the titlebar off-screen and the window becomes ungrabbable. Pure.
 * @param rect The rectangle produced by {@link resizeRect}.
 * @returns The rectangle with a non-negative origin.
 */
export function clampResizeOrigin(rect: Rect): Rect {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  return { x, y, w: rect.w - (x - rect.x), h: rect.h - (y - rect.y) };
}

/**
 * Return a new list with `id`'s rectangle replaced.
 * @param windows The current window list.
 * @param id The window to update.
 * @param rect The new rectangle.
 * @returns A new list.
 */
export function setWindowRect(
  windows: ReadonlyArray<UmbraDesktopWindow>,
  id: string,
  rect: Rect,
): UmbraDesktopWindow[] {
  return windows.map((w) => (w.id === id ? { ...w, rect } : w));
}
