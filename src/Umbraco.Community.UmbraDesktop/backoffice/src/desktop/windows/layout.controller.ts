import { UmbraDesktopWindowLayoutRestorer } from './layout-restorer';
import { windowLayoutStore } from './layout-persistence';
import type { UmbraDesktopWindowLayoutStorages, UmbraDesktopWindowLayoutStore } from './layout-persistence';
import type { UmbraDesktopApp } from '../types';
import type { UmbraDesktopReopenWindows } from '../settings/types';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { UMBRADESKTOP_BOOT_STATUS_DELAY_MS } from '../boot/constants';
import { setBootSplashStatus } from '../boot/splash';
import { delayedBootStatus } from '../boot/splash-status';
import type { UmbraDesktopBootStatus } from '../boot/splash-status';
import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import type { Observable } from '@umbraco-cms/backoffice/external/rxjs';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { UmbBooleanState } from '@umbraco-cms/backoffice/observable-api';

/** What the controller joins together, all provided by the desktop element. */
export interface UmbraDesktopWindowLayoutControllerSources {
  /** The window manager. */
  manager: UmbraDesktopWindowManagerContext;
  /** The two things it needs from the desktop settings: when they have loaded, and the mode. */
  settings: {
    readonly loaded: Observable<boolean>;
    readonly reopenWindows: Observable<UmbraDesktopReopenWindows>;
  };
  /** The apps this user may open, from the app catalogue. */
  apps: Observable<ReadonlyArray<UmbraDesktopApp>>;
  /** How to reach the storages. This tab's and this browser's unless a test says otherwise. */
  storage?: UmbraDesktopWindowLayoutStorages;
  /** How long a saved window waits for its app; see `layout-restorer.ts`. */
  deadlineMs?: number;
  /** How long the layout must stay still before it is saved; see `layout-restorer.ts`. */
  saveDelayMs?: number;
  /** How long a restore runs before the splash says so. Defaults to the boot's own floor. */
  statusDelayMs?: number;
}

/**
 * Wires the window layout into the desktop: once the signed-in user is known and their settings
 * have loaded, it reopens their windows and keeps the layout saved, in whichever places the user's
 * mode says (see `layout-persistence.ts`).
 *
 * **It holds the desktop while windows reopen.** {@link restoring} is true from the moment a
 * restore starts until every window is back or given up on, and the desktop keeps its first paint
 * back until then, behind the boot splash when there is one. So nobody starts using a desktop that
 * windows are still appearing on. The windows' own frames are not waited for: each has its own
 * loader. The flag goes up in the same tick as the settings report, which is what stops the desktop
 * getting a frame in between.
 *
 * **A change of mode applies at once** to where the layout is kept: switching off forgets both
 * copies and stops saving, switching to `session` forgets the copy kept between visits, and
 * switching to `persistent` writes it straight away. Whether windows come back is next time's
 * business; the ones open now stay open either way.
 *
 * Settings loading first matters because the mode is a setting, stored on the account with the
 * others, and a restorer started before it resolved would read the default.
 */
export class UmbraDesktopWindowLayoutController extends UmbControllerBase {
  /** What it joins together. */
  #sources: UmbraDesktopWindowLayoutControllerSources;

  /** For the splash's status line. */
  #localize = new UmbLocalizationController(this);

  /** Whether a restore is running; see {@link restoring}. */
  #restoring = new UmbBooleanState(false);

  /**
   * Whether windows are being reopened, which the desktop holds its first paint for. False when
   * there is nothing to reopen, including before settings have loaded, when the settings' own hold
   * is the one that applies.
   */
  public readonly restoring = this.#restoring.asObservable();

  /** The signed-in user, once known. */
  #userUnique?: string;

  /** Whether this user's settings have loaded. */
  #settingsLoaded = false;

  /** The user's current mode. Read by the store at every call, so a change applies at once. */
  #mode: UmbraDesktopReopenWindows = 'session';

  /** This user's store, once they are known and their settings have loaded. */
  #store?: UmbraDesktopWindowLayoutStore;

  /**
   * Whether this user's windows have been reopened already on this desktop. Only the first start
   * reopens: a restorer started later (reopening switched back on, or this same desktop connected
   * again) finds a desktop already in use and only keeps it saved. Exit and back is neither: that
   * builds a new desktop, with a new controller, which reopens from the tab's copy.
   */
  #reopened = false;

  /** The running restorer, if one has started. */
  #restorer?: UmbraDesktopWindowLayoutRestorer;

  /** The splash's status line while a restore runs. */
  #status?: UmbraDesktopBootStatus;

  /**
   * @param host The desktop element.
   * @param sources What it joins together.
   */
  constructor(host: UmbControllerHost, sources: UmbraDesktopWindowLayoutControllerSources) {
    super(host);
    this.#sources = sources;
    // Observed before `loaded`, so the mode is current by the time loading reports done.
    this.observe(sources.settings.reopenWindows, (mode) => this.#changeMode(mode ?? 'session'), '_reopenWindows');
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
          this.#stopRestorer();
          this.#userUnique = user.unique;
          this.#store = undefined;
          this.#reopened = false;
          this.#startWhenReady();
        },
        '_currentUser',
      );
    });
  }

  /**
   * Start for this user once the user is known and their settings have loaded: forget whatever the
   * mode does not keep, then, unless the mode is off, reopen (the first time only) and keep saved.
   */
  #startWhenReady(): void {
    if (this.#restorer || !this.#userUnique || !this.#settingsLoaded) return;
    this.#store ??= windowLayoutStore(this.#userUnique, () => this.#mode, this.#sources.storage);
    this.#store.forgetUnkept();
    if (this.#mode === 'off') return;

    const reopen = !this.#reopened;
    this.#reopened = true;
    const restorer = new UmbraDesktopWindowLayoutRestorer({
      store: this.#store,
      manager: this.#sources.manager,
      apps: this.#sources.apps,
      reopen,
      deadlineMs: this.#sources.deadlineMs,
      saveDelayMs: this.#sources.saveDelayMs,
    });
    this.#restorer = restorer;
    if (reopen) this.#holdWhileRestoring();
    restorer
      .start()
      .catch((error) => {
        // The store reports failure rather than throwing; this is the backstop, and the desktop
        // simply opens without its windows.
        // eslint-disable-next-line no-console
        console.error('[UmbraDesktop] Could not reopen your windows.', error);
      })
      .finally(() => {
        if (reopen) this.#releaseHold();
      });
  }

  /**
   * Hold the desktop for a restore, and have the splash explain it if it runs long. Synchronous, so
   * the flag is up before the desktop renders the settings report that started this.
   */
  #holdWhileRestoring(): void {
    this.#restoring.setValue(true);
    this.#status = delayedBootStatus({
      delayMs: this.#sources.statusDelayMs ?? UMBRADESKTOP_BOOT_STATUS_DELAY_MS,
      show: (text) => setBootSplashStatus(text),
    });
    this.#status.set(() => this.#localize.term('umbraDesktop_bootReopeningWindows'));
  }

  /** Let the desktop paint: the restore has finished, or was stopped. */
  #releaseHold(): void {
    this.#status?.stop();
    this.#status = undefined;
    this.#restoring.setValue(false);
  }

  /**
   * Take a new mode, and once started, apply it to where the layout is kept: see the class doc.
   * @param mode The user's new choice.
   */
  #changeMode(mode: UmbraDesktopReopenWindows): void {
    const previous = this.#mode;
    this.#mode = mode;
    if (mode === previous || !this.#store) return;
    this.#store.forgetUnkept();
    if (mode === 'off') {
      this.#stopRestorer();
      return;
    }
    if (!this.#restorer) {
      this.#startWhenReady();
      return;
    }
    if (mode === 'persistent') this.#restorer.saveNow();
  }

  /** Stop the running restorer, releasing the desktop if it was holding for it. */
  #stopRestorer(): void {
    this.#restorer?.stop();
    this.#restorer = undefined;
    if (this.#status) this.#releaseHold();
  }

  /**
   * This desktop is connected again: keep its layout saved again. Exit and back does not come
   * through here (it builds a new desktop), but the app catalogue allows for the same element being
   * mounted twice, and a desktop that stopped saving then would reopen a stale layout on the next F5.
   */
  override hostConnected(): void {
    super.hostConnected();
    this.#startWhenReady();
  }

  /** The desktop has gone: write what is pending, then stop restoring and saving. */
  override hostDisconnected(): void {
    super.hostDisconnected();
    this.#restorer?.saveNow();
    this.#stopRestorer();
  }
}
