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
