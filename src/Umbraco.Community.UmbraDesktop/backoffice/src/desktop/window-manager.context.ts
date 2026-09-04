import type { UmbraDesktopApp, UmbraDesktopWindow, UmbraDesktopWindowState, Rect } from './types';
import {
  focusWindow,
  moveWindow,
  nextWindowRect,
  nextZIndex,
  removeWindow,
  setWindowState,
  findAppWindow,
  setWindowRect,
  clampWindowsToBounds,
} from './window-model';
import { UMBRADESKTOP_WINDOW_KEEP_VISIBLE } from './constants';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from './window-manager.context-token';
import type { UmbraDesktopThemeMetrics } from './theme/types';
import type { UmbraDesktopKeepVisible } from './window-model';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

const DEFAULT_SIZE = { w: 800, h: 600 };

/**
 * Owns the list of open desktop windows and the operations on it. Provided by
 * the desktop element so it is scoped to the desktop subtree.
 */
export class UmbraDesktopWindowManagerContext extends UmbContextBase {
  #windows = new UmbArrayState<UmbraDesktopWindow>([], (w) => w.id);

  /** Observable list of open windows. */
  public readonly windows = this.#windows.asObservable();

  /**
   * What must stay reachable while dragging, under the active theme. Defaults to the Umbraco
   * theme's geometry until the theme context resolves one.
   */
  #keep: UmbraDesktopKeepVisible = UMBRADESKTOP_WINDOW_KEEP_VISIBLE;

  /** The last desktop size seen, so a theme change can re-clamp without waiting for a resize. */
  #bounds?: { w: number; h: number };

  /**
   * The active theme's keep-visible margins. Read by the window element, which clamps live during
   * a drag rather than going through this context.
   *
   * `Readonly` because this hands out the live object: a caller that wrote to it would corrupt the
   * clamp for every window, and there is nothing else to stop them.
   * @returns The margins in force.
   */
  public get keep(): Readonly<UmbraDesktopKeepVisible> {
    return this.#keep;
  }

  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT);
  }

  /**
   * Open a new window for the given app and focus it. If the app forbids multiple
   * instances and one is already open, focus that instead of opening another.
   * @param app The app to open.
   */
  public open(app: UmbraDesktopApp): void {
    const current = this.#windows.getValue();
    if (app.allowMultiple === false) {
      const existing = findAppWindow(current, app.alias);
      if (existing) {
        this.focus(existing.id);
        return;
      }
    }
    const rect = nextWindowRect(current.length, app.defaultSize ?? DEFAULT_SIZE);
    const win: UmbraDesktopWindow = {
      id: crypto.randomUUID(),
      app,
      rect,
      z: nextZIndex(current),
      active: true,
      state: 'normal',
    };
    this.#windows.setValue(focusWindow([...current, win], win.id));
  }

  /** Bring a window to the front and activate it. */
  public focus(id: string): void {
    this.#windows.setValue(focusWindow(this.#windows.getValue(), id));
  }

  /** Close a window. */
  public close(id: string): void {
    this.#windows.setValue(removeWindow(this.#windows.getValue(), id));
  }

  /** Move a window to an absolute desktop position. */
  public move(id: string, x: number, y: number): void {
    this.#windows.setValue(moveWindow(this.#windows.getValue(), id, x, y));
  }

  /**
   * Resize a window to an absolute rectangle (already clamped by the caller).
   * @param id The window to resize.
   * @param rect The new rectangle.
   */
  public resize(id: string, rect: Rect): void {
    this.#windows.setValue(setWindowRect(this.#windows.getValue(), id, rect));
  }

  /**
   * Un-maximize a window straight to a given position, in one update. Dragging a maximized window
   * restores it, and doing that as a state change followed by a move would paint the window
   * full-size for a frame before it snapped under the pointer.
   * @param id The window to restore.
   * @param x The position to restore it at.
   * @param y The position to restore it at.
   */
  public restoreTo(id: string, x: number, y: number): void {
    const restored = setWindowState(this.#windows.getValue(), id, 'normal');
    this.#windows.setValue(moveWindow(restored, id, x, y));
  }

  /**
   * Re-clamp every window into the desktop's current size. Called when the desktop surface itself
   * resizes — a viewport that shrinks under a window would otherwise strand it out of reach with no
   * way to drag it back. Skips the update entirely when nothing had to move, so a resize that
   * affects no window costs no re-render.
   *
   * Also **remembers** `bounds`, so that switching theme — which can move the window controls to
   * the other end of the titlebar and change what "reachable" means — can re-clamp immediately
   * instead of waiting for the next resize that may never come. See {@link setMetrics}.
   * @param bounds The new desktop surface size in px.
   */
  public clampToBounds(bounds: { w: number; h: number }): void {
    this.#bounds = bounds;
    const current = this.#windows.getValue();
    const next = clampWindowsToBounds(current, bounds, this.#keep);
    if (next !== current) this.#windows.setValue(next);
  }

  /**
   * Adopt the active theme's geometry, then pull any window the new chrome has stranded back into
   * reach — a window parked against the right edge under trailing controls sits outside the clamp
   * once those controls move to the left.
   * @param metrics The active theme's metrics.
   */
  public setMetrics(metrics: UmbraDesktopThemeMetrics): void {
    this.#keep = {
      grab: metrics.grab,
      leading: metrics.leadingControlsWidth,
      trailing: metrics.trailingControlsWidth,
      titlebar: metrics.titlebarHeight,
    };
    if (this.#bounds) this.clampToBounds(this.#bounds);
  }

  /** Set a window's state (normal / minimized / maximized). */
  public setState(id: string, state: UmbraDesktopWindowState): void {
    this.#windows.setValue(setWindowState(this.#windows.getValue(), id, state));
  }
}

export default UmbraDesktopWindowManagerContext;
