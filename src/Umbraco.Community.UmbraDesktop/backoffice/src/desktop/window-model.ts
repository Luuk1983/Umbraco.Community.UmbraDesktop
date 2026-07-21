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
