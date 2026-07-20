import type { UmbraDesktopApp, UmbraDesktopWindow, UmbraDesktopWindowState } from './types';
import {
  focusWindow,
  moveWindow,
  nextWindowRect,
  nextZIndex,
  removeWindow,
  setWindowState,
} from './window-model';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from './window-manager.context-token';
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

  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT);
  }

  /** Open a new window for the given app and focus it. */
  public open(app: UmbraDesktopApp): void {
    const current = this.#windows.getValue();
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

  /** Set a window's state (normal / minimized / maximized). */
  public setState(id: string, state: UmbraDesktopWindowState): void {
    this.#windows.setValue(setWindowState(this.#windows.getValue(), id, state));
  }
}

export default UmbraDesktopWindowManagerContext;
