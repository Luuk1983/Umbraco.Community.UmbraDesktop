/**
 * Where a view beside the editor finds its owner's frame, now and after every reload (design §4.5).
 *
 * The owner window announces its frame on each load. The view's host watches its owner's
 * announcements and remounts against each new page, because a reload replaces the page the view's
 * data came from, and a view left alone keeps showing values from the dead page, silently.
 *
 * Module state rather than a context, because the two ends are not in one tree: a floating view is
 * a window of its own, beside its owner rather than under it. The window manager would be the other
 * home, and it deliberately holds no DOM.
 */

/** Each window's frame, while it has one loaded. */
const frames = new Map<string, HTMLIFrameElement>();

/** Who is watching each window's frame. */
const watchers = new Map<string, Set<(frame: HTMLIFrameElement | undefined) => void>>();

/**
 * Tell anyone watching that a window's frame has loaded, or loaded again.
 * @param windowId The window.
 * @param frame Its frame, freshly loaded.
 */
export function announceWindowFrame(windowId: string, frame: HTMLIFrameElement): void {
  frames.set(windowId, frame);
  for (const watcher of watchers.get(windowId) ?? []) watcher(frame);
}

/**
 * Tell anyone watching that a window's frame has gone, as it does when the window closes.
 * @param windowId The window.
 */
export function forgetWindowFrame(windowId: string): void {
  if (!frames.delete(windowId)) return;
  for (const watcher of watchers.get(windowId) ?? []) watcher(undefined);
}

/**
 * Follow a window's frame: the one loaded now, straight away, then every later load.
 * @param windowId The window.
 * @param onFrame Called with each frame, or undefined when it goes.
 * @returns Stops watching.
 */
export function watchWindowFrame(windowId: string, onFrame: (frame: HTMLIFrameElement | undefined) => void): () => void {
  let set = watchers.get(windowId);
  if (!set) watchers.set(windowId, (set = new Set()));
  set.add(onFrame);
  const current = frames.get(windowId);
  if (current) onFrame(current);
  return () => {
    set!.delete(onFrame);
    if (set!.size === 0) watchers.delete(windowId);
  };
}

/**
 * The frame a window has loaded now, for routing it from outside (#144): an app's page beside its
 * window is announced under its attached id, as a pane or as a floating window.
 * @param windowId The window, or the attached content's id.
 * @returns The frame, or undefined while none is loaded.
 */
export function currentWindowFrame(windowId: string): HTMLIFrameElement | undefined {
  return frames.get(windowId);
}
