import { UmbraDesktopWindowLayoutRestorer } from './layout-restorer';
import { UmbraDesktopWindowLayoutPersistence, browserLayoutCache } from './layout-persistence';
import type { UmbraDesktopApp } from '../types';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import type { UmbraDesktopSettingsContext } from '../settings/settings.context';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import type { Observable } from '@umbraco-cms/backoffice/external/rxjs';

/** What the controller joins together, all provided by the desktop element. */
export interface UmbraDesktopWindowLayoutControllerSources {
  /** The window manager. */
  manager: UmbraDesktopWindowManagerContext;
  /** The desktop settings, for when they have loaded and whether to reopen windows. */
  settings: UmbraDesktopSettingsContext;
  /** The apps this user may open, from the app catalogue. */
  apps: Observable<ReadonlyArray<UmbraDesktopApp>>;
}

/**
 * Wires the window layout into the desktop: once the signed-in user is known and their settings
 * have loaded, it starts a restorer that reopens their windows and keeps the layout saved.
 *
 * Per user: the layout is kept in this browser's `localStorage` under the signed-in user's own key
 * (see `layout-persistence.ts` for why it is not on the account), and when the user changes, the
 * running restorer is stopped before the next user's starts.
 *
 * Settings loading first matters for one reason: whether to reopen at all is a setting, stored on
 * the account with the others, and a restorer started before it resolved would read the default.
 */
export class UmbraDesktopWindowLayoutController extends UmbControllerBase {
  /** What it joins together. */
  #sources: UmbraDesktopWindowLayoutControllerSources;

  /** The signed-in user, once known. */
  #userUnique?: string;

  /** Whether this user's settings have loaded. */
  #settingsLoaded = false;

  /** Whether this user has opted in to reopening their windows. */
  #reopen = false;

  /** The running restorer, if one has started. */
  #restorer?: UmbraDesktopWindowLayoutRestorer;

  /**
   * @param host The desktop element.
   * @param sources What it joins together.
   */
  constructor(host: UmbControllerHost, sources: UmbraDesktopWindowLayoutControllerSources) {
    super(host);
    this.#sources = sources;
    // Observed before `loaded`, so the value is current by the time loading reports done.
    this.observe(sources.settings.reopenWindows, (reopen) => (this.#reopen = reopen === true), '_reopenWindows');
    this.observe(
      sources.settings.loaded,
      (loaded) => {
        this.#settingsLoaded = loaded === true;
        this.#startWhenReady();
      },
      '_settingsLoaded',
    );
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (context) => {
      if (!context) return;
      this.observe(
        context.currentUser,
        (user) => {
          if (!user?.unique || user.unique === this.#userUnique) return;
          this.#userUnique = user.unique;
          this.#stopRestorer();
          this.#startWhenReady();
        },
        '_currentUser',
      );
    });
  }

  /** Start a restorer for this user, once the user is known and their settings have loaded. */
  #startWhenReady(): void {
    if (this.#restorer || !this.#userUnique || !this.#settingsLoaded) return;
    this.#restorer = new UmbraDesktopWindowLayoutRestorer({
      persistence: new UmbraDesktopWindowLayoutPersistence(browserLayoutCache(this.#userUnique)),
      manager: this.#sources.manager,
      apps: this.#sources.apps,
      reopen: this.#reopen,
    });
    this.#restorer.start().catch((error) => {
      // Every port below reports failure rather than throwing; this is the backstop, and the desktop
      // simply opens without its windows.
      // eslint-disable-next-line no-console
      console.error('[UmbraDesktop] Could not reopen your windows.', error);
    });
  }

  /** Stop the running restorer. */
  #stopRestorer(): void {
    this.#restorer?.stop();
    this.#restorer = undefined;
  }

  /** The desktop has gone: stop restoring and saving. */
  override hostDisconnected(): void {
    super.hostDisconnected();
    this.#stopRestorer();
  }
}
