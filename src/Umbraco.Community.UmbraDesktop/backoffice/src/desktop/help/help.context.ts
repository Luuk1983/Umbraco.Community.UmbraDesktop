import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import type { Observable } from '@umbraco-cms/backoffice/observable-api';
import type { UmbraDesktopApp } from '../types';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { UMBRADESKTOP_HELP_CONTEXT } from './help.context-token';
import { formatHelpTarget, parseHelpTarget } from './help-target';
import { UMBRADESKTOP_HELP_APP_ALIAS } from './manifest';
import { UMBRADESKTOP_OPEN_HELP_EVENT } from '../constants';

/** What the Help context needs from the desktop, handed over by the desktop element that owns both. */
export interface UmbraDesktopHelpContextDeps {
  /** Opens and finds windows. */
  manager: UmbraDesktopWindowManagerContext;
  /** The apps this user may open, from the catalogue, so Help is opened the way its tile opens it. */
  apps: Observable<ReadonlyArray<UmbraDesktopApp>>;
}

/**
 * Opens Help at a page: the one door the desktop's own code, the `umbradesktop-open-help` event and
 * the `?help=` deep link all go through (Help design §6.2).
 *
 * The reuse rule (D6) lives here: a Help window already showing exactly that location comes to the
 * front, anything else opens a new window there. A window's location is what the Help app last
 * reported, so a window someone has moved on from is left alone. Targets are written in canonical
 * form before comparing, so a hand-typed `UmbraDesktop/Snapping/` finds the window reporting
 * `umbradesktop/snapping`.
 */
export class UmbraDesktopHelpContext extends UmbContextBase {
  /** Opens and finds windows. */
  #manager: UmbraDesktopWindowManagerContext;

  /** The Help app as the catalogue has it, or undefined when this user may not open it. */
  #app?: UmbraDesktopApp;

  /** A request made before the catalogue had the Help app, opened as soon as it does. */
  #pending?: string;

  /**
   * @param host The desktop element, whose subtree this context is provided to. The
   *   `umbradesktop-open-help` event is answered on it.
   * @param deps What the context works with.
   */
  constructor(host: UmbControllerHost, deps: UmbraDesktopHelpContextDeps) {
    super(host, UMBRADESKTOP_HELP_CONTEXT);
    this.#manager = deps.manager;
    this.observe(
      deps.apps,
      (apps) => {
        this.#app = apps.find((app) => app.alias === UMBRADESKTOP_HELP_APP_ALIAS);
        const pending = this.#pending;
        if (pending && this.#app) {
          this.#pending = undefined;
          this.open(pending);
        }
      },
      '_helpApp',
    );
    this.getHostElement().addEventListener(UMBRADESKTOP_OPEN_HELP_EVENT, this.#onOpenHelp);
  }

  /** Stops answering the event. */
  override destroy(): void {
    this.getHostElement()?.removeEventListener(UMBRADESKTOP_OPEN_HELP_EVENT, this.#onOpenHelp);
    super.destroy();
  }

  /**
   * Answers the published event (Help design D9). Stopped once answered, so a desktop inside
   * something else that also listens does not open Help twice.
   * @param event The event, with `{ target }` in `detail`.
   */
  #onOpenHelp = (event: Event): void => {
    const target = (event as CustomEvent<{ target?: unknown }>).detail?.target;
    if (typeof target !== 'string') return;
    event.stopPropagation();
    this.open(target);
  };

  /**
   * Opens Help at a target now, or as soon as the catalogue has the Help app. For the deep link,
   * which is taken while the desktop starts and may arrive before the catalogue has finished.
   * @param target A target string.
   */
  public openWhenReady(target: string): void {
    if (this.#app) this.open(target);
    else this.#pending = target;
  }

  /**
   * Opens Help at a target, or brings forward the Help window already showing it.
   * @param target A target string: `product`, `product/page` or `product/page/heading`.
   * @returns False when the target is malformed or Help is not available, and nothing happened.
   */
  public open(target: string): boolean {
    const parsed = parseHelpTarget(target);
    if (!parsed || !this.#app) return false;
    const location = formatHelpTarget(parsed);
    const showing = this.#manager
      .getWindows()
      .find((w) => w.app.alias === UMBRADESKTOP_HELP_APP_ALIAS && !w.owner && w.location === location);
    if (showing) this.#manager.focus(showing.id);
    else this.#manager.open(this.#app, { location });
    return true;
  }
}
