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
  setWindowDirty,
  unsavedWindows,
  clampWindowsToBounds,
} from './window-model';
import { UMBRADESKTOP_DEFAULT_METRICS, UMBRADESKTOP_WINDOW_KEEP_VISIBLE } from './constants';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from './window-manager.context-token';
import { windowSizeForContent } from './window-chrome';
import type { UmbraDesktopThemeMetrics } from './theme/types';
import type { UmbraDesktopKeepVisible } from './window-model';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UMB_DISCARD_CHANGES_MODAL, umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The **content** box a window opens at when its app names no `defaultSize`.
 *
 * Content and not window, like every size an app declares: the active theme's chrome is added on
 * top, so an app with no opinion opens with the same amount of usable room under all five themes
 * rather than losing a taller theme's caption out of the bottom of it.
 */
const DEFAULT_CONTENT_SIZE = { w: 800, h: 600 };

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

  /**
   * The active theme's full geometry, which is what {@link open} needs: sizing a window around an
   * app's content box takes the theme's chrome cost, and that is not one of the four fields
   * {@link keep} carries.
   *
   * Defaults to the base chrome's own metrics, which is the same object the Umbraco theme
   * publishes — so "before a theme resolves" and "under the identity theme" are one state rather
   * than two that happen to agree.
   */
  #metrics: UmbraDesktopThemeMetrics = UMBRADESKTOP_DEFAULT_METRICS;

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
   *
   * `defaultSize` is the app's **content** box, so the active theme's chrome is added here rather
   * than being the app's problem: the app cannot read a titlebar height from another package, and
   * the one that tried guessed a single allowance for five different titlebars.
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
    const rect = nextWindowRect(
      current.length,
      windowSizeForContent(app.defaultSize ?? DEFAULT_CONTENT_SIZE, this.#metrics),
    );
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

  /** Close a window, unconditionally. Prefer {@link requestClose}, which guards unsaved work. */
  public close(id: string): void {
    this.#windows.setValue(removeWindow(this.#windows.getValue(), id));
  }

  /**
   * Record whether a window's frame is holding unsaved changes. Written by the window element's
   * dirty watcher; read by the titlebar marker and by every guard below.
   * @param id The window to mark.
   * @param dirty Whether it holds unsaved changes.
   */
  public setDirty(id: string, dirty: boolean): void {
    this.#windows.setValue(setWindowDirty(this.#windows.getValue(), id, dirty));
  }

  /**
   * Every open window holding unsaved changes. Exit warns from this; see the taskbar.
   * @returns The marked windows, in list order.
   */
  public unsavedWindows(): ReadonlyArray<UmbraDesktopWindow> {
    return unsavedWindows(this.#windows.getValue());
  }

  /**
   * Open the backoffice's own discard-changes dialog.
   *
   * Split out as its own method purely so it can be substituted in tests — a modal manager context
   * only resolves inside a booted backoffice, and the guard's decisions are worth testing without
   * one. Resolving the modal means discard; rejecting it means the user chose to stay.
   * @returns True when the user chose to discard.
   */
  protected async _askToDiscard(): Promise<boolean> {
    try {
      await umbOpenModal(this, UMB_DISCARD_CHANGES_MODAL);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ask, if there is anything to lose, whether a window's unsaved changes may be discarded.
   *
   * Answers without a dialog for a window that is clean — or one that is no longer open, so a
   * caller racing a close is not stranded. Reused rather than inlined into {@link requestClose}
   * because the titlebar's reload button needs the same question and then does something else
   * entirely with the answer: it reloads the frame in place rather than closing the window.
   *
   * The dialog is core's `UMB_DISCARD_CHANGES_MODAL`, the same token `entity-detail-workspace-base`
   * opens when you navigate away from a dirty workspace. Reusing the token is what makes this *the
   * same wording* the backoffice uses elsewhere, rather than a copy of it that drifts.
   * @param id The window whose changes are at stake.
   * @returns True when the window may be discarded.
   */
  public async confirmDiscard(id: string): Promise<boolean> {
    const target = this.#windows.getValue().find((w) => w.id === id);
    if (!target?.dirty) return true;
    return this._askToDiscard();
  }

  /**
   * Close a window, asking first when it holds unsaved changes. Cancelling leaves the window open
   * with its edits still in it. This is what the titlebar's close button calls.
   * @param id The window to close.
   */
  public async requestClose(id: string): Promise<void> {
    if (await this.confirmDiscard(id)) this.close(id);
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
   *
   * The whole object is kept, not only the four fields the clamp reads: {@link open} sizes a window
   * around an app's content box and needs this theme's chrome cost to do it. Windows already open
   * keep the size they have, which is the same decision the clamp makes — a theme change moves a
   * window only when the new chrome would otherwise put it out of reach.
   * @param metrics The active theme's metrics.
   */
  public setMetrics(metrics: UmbraDesktopThemeMetrics): void {
    this.#metrics = metrics;
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
