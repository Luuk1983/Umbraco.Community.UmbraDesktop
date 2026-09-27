import type {
  UmbraDesktopClockCycle,
  UmbraDesktopLauncherLayout,
  UmbraDesktopLocaleSource,
  UmbraDesktopSettings,
  UmbraDesktopWallpaperRef,
} from './types';
import type { UmbraDesktopWallpaperView } from './wallpaper-view';
import { resolveWallpaper, wallpaperThumbUrl } from './wallpaper';
import { withFeatureEnabled } from '../taskbar/features/enabled';
import { UMBRADESKTOP_DEFAULT_SETTINGS } from './settings-store';
import { browserSettingsCache } from './settings-cache';
import { UmbraDesktopSettingsPersistence } from './settings-persistence';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from './settings.context-token';
import { UMBRADESKTOP_MIGRATION_TIMEOUT_MS } from '../constants';
import { UMBRADESKTOP_USER_DATA_GROUP } from '../user-data/constants';
import { UmbraDesktopUserDataRepository } from '../user-data/user-data.repository';
import { UmbraDesktopUserDataServerClient } from '../user-data/server.client';
import { UmbraDesktopStoredMigrationLedger } from '../migrations/ledger';
import { umbraDesktopMigrations } from '../migrations/index';
import type { UmbraDesktopMigrationScreenState } from '../migrations/types';
import { UMBRADESKTOP_BOOT_STATUS_DELAY_MS } from '../boot/constants';
import { setBootSplashStatus } from '../boot/splash';
import { delayedBootStatus } from '../boot/splash-status';
import {
  UMBRADESKTOP_MEDIA_THUMB_SIZE,
  UMBRADESKTOP_MEDIA_WALLPAPER_SIZE,
  mediaImagingRequest,
} from './media-imaging';
import { themeWallpaper } from '../theme/theme-wallpaper';
import { UMBRADESKTOP_THEMES } from '../theme/themes/index';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbBooleanState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import { UmbImagingRepository } from '@umbraco-cms/backoffice/imaging';
import { UmbLocalizationController } from '@umbraco-cms/backoffice/localization-api';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';

/**
 * Owns the current user's desktop settings: the persisted preference, and the resolved view the
 * desktop and the settings dialog actually paint. Provided by the desktop element, so it is
 * scoped to the desktop subtree the same way the window manager and app catalogue are.
 *
 * Persistence is the user's Umbraco account, in `umbracoUserData`, with `localStorage` kept as a
 * cache of it. Everything about that relationship lives in {@link UmbraDesktopSettingsPersistence};
 * what matters here is that both ends are best-effort, exactly as storage alone used to be. A
 * browser that refuses storage, or a server that cannot be reached, still gets a working desktop for
 * the session — one that forgets.
 */
export class UmbraDesktopSettingsContext extends UmbContextBase {
  #settings = new UmbObjectState<UmbraDesktopSettings>(UMBRADESKTOP_DEFAULT_SETTINGS);

  #view = new UmbObjectState<UmbraDesktopWallpaperView>({
    ref: UMBRADESKTOP_DEFAULT_SETTINGS.wallpaper,
    background: resolveWallpaper(UMBRADESKTOP_DEFAULT_SETTINGS.wallpaper),
    thumbUrl: wallpaperThumbUrl(UMBRADESKTOP_DEFAULT_SETTINGS.wallpaper),
  });

  /** The persisted settings. */
  public readonly settings = this.#settings.asObservable();

  /** The current wallpaper, resolved to paintable URLs. */
  public readonly wallpaper = this.#view.asObservable();

  /** Aliases of the apps pinned to Favourites, in pin order. */
  public readonly pinned = this.#settings.asObservablePart((settings) => settings.pinned);

  /** The user's changes to the launcher; `undefined` when they have never arranged it. */
  public readonly layout = this.#settings.asObservablePart((settings) => settings.layout);

  /** Id of the user's chosen chrome theme. */
  public readonly theme = this.#settings.asObservablePart((settings) => settings.theme);

  /**
   * Which fixed taskbar features this user has switched on or off, keyed by feature id.
   *
   * Only the ones they have an opinion about; anything absent takes the feature's own default. Read
   * through `isFeatureEnabled` rather than indexed directly, so that rule lives in one place.
   */
  public readonly taskbarFeatures = this.#settings.asObservablePart((settings) => settings.taskbarFeatures);

  /** Whether landing on the backoffice root should open the desktop. */
  public readonly bootIntoDesktop = this.#settings.asObservablePart((settings) => settings.bootIntoDesktop);

  /**
   * How this user wants dates and times formatted: which culture, and any clock override.
   *
   * One observable for both fields rather than one each, because every reader needs both to format
   * anything — a source without a cycle cannot answer what the time looks like.
   */
  public readonly locale = this.#settings.asObservablePart((settings) => settings.locale);

  /** Whether changing the theme also changes the wallpaper to that theme's match. */
  public readonly wallpaperFollowsTheme = this.#settings.asObservablePart(
    (settings) => settings.wallpaperFollowsTheme,
  );

  /**
   * Whether this user's stored settings have been read and their wallpaper resolved.
   *
   * The value seeded above is a placeholder, not a preference. Until this is true, the desktop is
   * *holding* rather than painting the defaults, which is the difference between a boot and a flash
   * of somebody else's desktop: without it a fresh load paints the default theme and the default
   * wallpaper for as long as the current-user request takes, then swaps to the user's own.
   *
   * Only flips once the paintable view is final, because a Media Library wallpaper needs an imaging
   * round trip after the payload is parsed. Reporting "loaded" before that would just move the
   * flash later.
   */
  #loaded = new UmbBooleanState(false);

  /** Whether the stored settings have been read and their wallpaper resolved. */
  public readonly loaded = this.#loaded.asObservable();

  /**
   * Whether a one-time migration is showing a screen over the desktop, and which one.
   *
   * Idle almost always. It leaves idle only for somebody whose settings are still in this browser
   * rather than on their account, which is once per person, ever.
   */
  #migration = new UmbObjectState<UmbraDesktopMigrationScreenState>({ phase: 'idle' });

  /** The migration screen's state, for the desktop to render. */
  public readonly migration = this.#migration.asObservable();

  #imaging: UmbImagingRepository;

  /** Resolves the strings the boot splash and the failure notification show. */
  #localize: UmbLocalizationController;

  /** The host, kept so the user-data client can be built once the user is known. */
  #host: UmbControllerHost;

  /** The current user's id, once known. Until then nothing is persisted. */
  #userUnique?: string;

  /**
   * Account-and-cache persistence for the current user, built once they are known.
   *
   * Absent until then, which is what stops anything being written against the wrong account — and
   * why every write goes through {@link #persist} rather than touching storage directly.
   */
  #persistence?: UmbraDesktopSettingsPersistence;

  /**
   * The account store behind {@link #persistence}, kept only so it can be retired when the user
   * changes. See {@link UmbraDesktopUserDataRepository.abandon}.
   */
  #store?: UmbraDesktopUserDataRepository;

  /**
   * The boot splash's status line while a load is in flight, or undefined when none is.
   *
   * Only the load drives it. Migrations used to as well, back when they ran behind the boot splash;
   * they have their own screen now, so the splash says nothing about them and this exists purely to
   * explain a load that is taking longer than it should.
   */
  #status?: ReturnType<typeof delayedBootStatus>;

  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_SETTINGS_CONTEXT);
    this.#host = host;
    this.#imaging = new UmbImagingRepository(host);
    this.#localize = new UmbLocalizationController(host);

    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.currentUser, (user) => {
        if (!user?.unique || user.unique === this.#userUnique) return;
        this.#userUnique = user.unique;
        this.#persistence = this.#buildPersistence(user.unique);
        void this.#load();
      });
    });
  }

  /**
   * Wire up persistence for one user: their account rows, their browser cache, and the migrations
   * that move one to the other.
   *
   * All of it per user, and rebuilt when the user changes, because two accounts sharing a browser
   * must not inherit each other's desktop — the same reason the cache key has always been scoped.
   *
   * The repository is shared between the settings and the ledger deliberately: it fetches the whole
   * group once and serves both from that, so a load is one request rather than two.
   * @param userUnique The current user's unique id.
   * @returns Persistence for that user.
   */
  #buildPersistence(userUnique: string): UmbraDesktopSettingsPersistence {
    // Retire the outgoing one first. Writes are queued, so a save for the person who just signed
    // out can still be waiting, and it would go out carrying the new user's token — see
    // `UmbraDesktopUserDataRepository.abandon`.
    this.#store?.abandon();

    const store = new UmbraDesktopUserDataRepository(
      UMBRADESKTOP_USER_DATA_GROUP,
      new UmbraDesktopUserDataServerClient(this.#host),
    );
    this.#store = store;
    const cache = browserSettingsCache(userUnique);

    return new UmbraDesktopSettingsPersistence({
      store,
      cache,
      ledger: new UmbraDesktopStoredMigrationLedger(store),
      migrations: umbraDesktopMigrations({ store, readLegacySettings: () => cache.read() }),
    });
  }

  /**
   * Choose a built-in wallpaper, or none. Applies immediately and persists.
   * @param wallpaper The wallpaper to use.
   */
  public setWallpaper(wallpaper: UmbraDesktopWallpaperRef): void {
    // Picking an image by hand takes the wallpaper off the theme's leash. Choosing one is about as
    // explicit as a person gets, and the alternative is throwing that choice away the next time
    // they try a theme. There is no separate control for it: the toggle simply comes back off, and
    // turning it on again reapplies the current theme's match.
    this.#paintWallpaper(wallpaper, { wallpaperFollowsTheme: false });
  }

  /**
   * Choose a Media Library image.
   *
   * The URLs are resolved *before* anything is stored, so picking a PDF — or anything else
   * Umbraco cannot render as an image — changes nothing and reports failure, rather than
   * persisting a preference that silently resolves to the default forever after.
   * @param unique The media item's key.
   * @returns True when the item is usable as a wallpaper and has been applied.
   */
  public async setMediaWallpaper(unique: string): Promise<boolean> {
    const ref: UmbraDesktopWallpaperRef = { kind: 'media', unique };
    const [url, thumbUrl] = await Promise.all([
      this.#resizedMediaUrl(unique, UMBRADESKTOP_MEDIA_WALLPAPER_SIZE),
      this.#resizedMediaUrl(unique, UMBRADESKTOP_MEDIA_THUMB_SIZE),
    ]);

    if (!url) return false;

    // Same rule as `setWallpaper`: a hand-picked image wins over the theme's match.
    this.#update({ wallpaper: ref, wallpaperFollowsTheme: false });
    this.#view.setValue({
      ref,
      background: resolveWallpaper(ref, url),
      thumbUrl: wallpaperThumbUrl(ref, thumbUrl),
    });
    return true;
  }

  /**
   * Store the result of one launcher action: the pins and the layout, in one write.
   *
   * One method for both because a single drag can change both (pinning an app takes it out of its
   * group), and two writes would put two round trips on the account for one gesture. The launcher
   * computes the result with `launcher/layout-edits.ts`, since it has the catalogue and this context
   * deliberately does not. Passing `undefined` as the layout is Reset.
   * @param pinned The new pinned aliases.
   * @param layout The new layout, or `undefined` for the catalogue's grouping.
   */
  public setLauncherArrangement(pinned: ReadonlyArray<string>, layout: UmbraDesktopLauncherLayout | undefined): void {
    this.#update({ pinned: [...pinned], layout });
  }

  /**
   * Switch a fixed taskbar feature on or off. Applies immediately and persists.
   *
   * The choice is recorded even when it matches the feature's default: an absence means "whatever
   * the shell thinks", which is a different answer from "the user wants it on".
   * @param id The feature id, from the taskbar feature registry.
   * @param enabled Whether the feature should be on.
   */
  public setTaskbarFeature(id: string, enabled: boolean): void {
    this.#update({ taskbarFeatures: withFeatureEnabled(this.#settings.getValue().taskbarFeatures, id, enabled) });
  }

  /**
   * Choose a chrome theme. Applies immediately and persists; the theme context observes this and
   * resolves it against the backoffice's light/dark setting.
   *
   * When the user has asked the wallpaper to follow the theme, this also swaps the wallpaper to the
   * one the new theme declares. The rule lives here rather than in the picker on purpose: the
   * toggle changes what *choosing a theme* means, and a picker that applied two settings per click
   * would leave the same rule true in one place and not in the other — a theme chosen from anywhere
   * else would quietly skip it.
   *
   * Both fields go through a single {@link #update}, so a theme change is one write and one state
   * change rather than a wallpaper that lands a frame after the chrome.
   * @param id The theme id to use.
   */
  public setTheme(id: string): void {
    const wallpaper = this.#settings.getValue().wallpaperFollowsTheme
      ? themeWallpaper(id, UMBRADESKTOP_THEMES)
      : undefined;

    if (!wallpaper) {
      this.#update({ theme: id });
      return;
    }
    this.#paintWallpaper(wallpaper, { theme: id });
  }

  /**
   * Turn "match the wallpaper to the theme" on or off.
   *
   * **Neither direction changes the wallpaper.** This stores a preference about what *choosing a
   * theme* will do, and it does not choose one — so the desktop behind the panel stays exactly as
   * it was, in both directions, and the wallpaper moves on the next theme click.
   *
   * An earlier version applied the current theme's match the moment this went on, reasoning that
   * the toggle should never sit on with nothing having visibly happened. In use that read as the
   * switch reaching past you and replacing the picture, which is startling in a way that a setting
   * doing nothing yet is not. The preview tiles in the picker carry the "what will this do" job
   * instead: with this on they show each theme's own wallpaper, so the answer is visible without
   * anything being applied.
   *
   * Clicking the theme already in use is the deliberate way to apply the match without changing
   * theme, which is why `setTheme` does not skip an unchanged id.
   * @param enabled Whether the wallpaper should follow the theme.
   */
  public setWallpaperFollowsTheme(enabled: boolean): void {
    this.#update({ wallpaperFollowsTheme: enabled });
  }

  /**
   * Turn booting straight into the desktop on or off.
   *
   * Takes effect the next time the user lands on the backoffice root, which is normally their next
   * sign-in but also a plain refresh of it. Nothing changes on the spot, which is why the settings
   * panel says so rather than leaving a toggle that looks broken.
   *
   * The browser-level hint the next boot reads moves with the cache rather than from here, once the
   * account has accepted the change — see `settings-cache.ts` for why those two may never be written
   * apart.
   * @param enabled Whether to boot into the desktop.
   */
  public setBootIntoDesktop(enabled: boolean): void {
    this.#update({ bootIntoDesktop: enabled });
  }

  /**
   * Choose which culture the desktop formats dates and times with. Applies immediately and persists.
   *
   * Takes effect on screen at once, unlike {@link setBootIntoDesktop}: the taskbar observes this and
   * re-ticks rather than waiting up to fifteen seconds for its interval, which is the difference
   * between a setting and a setting that looks broken.
   * @param source The culture to follow.
   */
  public setLocaleSource(source: UmbraDesktopLocaleSource): void {
    this.#update({ locale: { ...this.#settings.getValue().locale, source } });
  }

  /**
   * Choose whether the clock overrides its culture's hour cycle. Applies immediately and persists.
   *
   * Separate from {@link setLocaleSource} because they are two independent choices: an override is
   * meant to survive changing which culture it overrides.
   * @param hourCycle The override, or `auto` to leave it to the culture.
   */
  public setClockHourCycle(hourCycle: UmbraDesktopClockCycle): void {
    this.#update({ locale: { ...this.#settings.getValue().locale, hourCycle } });
  }

  /**
   * Store a wallpaper and repaint it, optionally alongside other settings in the same write.
   *
   * Exists because a built-in wallpaper is applied from two directions — the user picking one, and
   * the theme bringing its own — and only the first of those turns the follow-the-theme preference
   * off. Sharing the store-and-repaint keeps the two paths from drifting, while the `also` argument
   * is what lets a theme change persist both fields as one update.
   *
   * Built-ins only. A Media Library wallpaper needs its URLs resolved first, so `setMediaWallpaper`
   * keeps its own path rather than resolving twice.
   * @param wallpaper The wallpaper to store and paint.
   * @param also Other settings to write in the same update.
   */
  #paintWallpaper(wallpaper: UmbraDesktopWallpaperRef, also: Partial<Omit<UmbraDesktopSettings, 'v'>> = {}): void {
    this.#update({ wallpaper, ...also });
    this.#view.setValue({
      ref: wallpaper,
      background: resolveWallpaper(wallpaper),
      thumbUrl: wallpaperThumbUrl(wallpaper),
    });
  }

  /**
   * Merge a change into the settings, in memory and on disk. Merging rather than replacing so
   * that changing one setting can never drop another.
   * @param partial The fields to change.
   */
  #update(partial: Partial<Omit<UmbraDesktopSettings, 'v'>>): void {
    const settings: UmbraDesktopSettings = { ...this.#settings.getValue(), ...partial };
    this.#settings.setValue(settings);
    // Not awaited: every caller is a click, and a click that waited on a round trip before the
    // wallpaper moved would make the whole desktop feel like it was on a leash.
    void this.#persist(settings);
  }

  /**
   * Read this user's stored settings and apply them, then report that the desktop may paint.
   *
   * Awaits the view refresh rather than firing it off, because `loaded` is what lifts the boot
   * splash: lifting it while a Media Library wallpaper was still resolving would hand over to a
   * desktop that is about to change under the user.
   */
  async #load(): Promise<void> {
    const persistence = this.#persistence;
    if (!persistence) return;

    // A load is a fresh start. Without this, a `running` phase left behind by the previous user —
    // whose run was cut short by the `#stale` guards below — would be inherited by this one, who
    // would arrive behind a screen belonging to somebody else's migration, with no button on it.
    this.#migration.setValue({ phase: 'idle' });

    // Quiet unless the boot runs long — see `boot/splash-status.ts`. Armed before the first request
    // rather than after it, so a slow *first* request is covered too.
    this.#status = delayedBootStatus({
      delayMs: UMBRADESKTOP_BOOT_STATUS_DELAY_MS,
      show: (text) => setBootSplashStatus(text),
    });
    this.#status.set(() => this.#localize.term('umbraDesktop_bootLoadingSettings'));

    try {
      const load = await persistence.load();
      if (this.#stale(persistence)) return;
      this.#settings.setValue(load.settings);

      // Asked *before* the desktop is allowed to paint, so that when it does, the screen is already
      // part of the same frame. A beat later would mean a flash of a desktop that is about to change
      // under the person looking at it.
      const pending = await persistence.pending();
      if (this.#stale(persistence)) return;
      if (pending.length > 0) {
        this.#migration.setValue({ phase: 'running', descriptionKey: pending[0].descriptionKey });
      }

      await this.#refreshView(load.settings.wallpaper);
    } catch (error) {
      // Nothing below this is expected to throw: every port between here and the network reports
      // failure rather than raising it, and each of them is tested for that. This is the backstop
      // for the day one of them stops doing so, because the cost of being wrong is the worst
      // failure the desktop has — `#loaded` never flips, so it holds on a blank surface forever and
      // the splash sits on top of it until its own timeout lifts it onto nothing.
      // eslint-disable-next-line no-console
      console.error('[UmbraDesktop] Could not load settings; painting what we have.', error);
    } finally {
      // The desktop paints either way. Whatever settings survived the attempt are what it paints,
      // which for a total failure is the defaults — worse than the user's own desktop, far better
      // than never arriving.
      this.#loaded.setValue(true);
      // The splash must not be left narrating a load that ended badly.
      this.#status.stop();
      this.#status = undefined;
    }

    // Unconditionally, not only when the look-ahead found something. The look-ahead decides whether
    // a *screen* appears; the runner decides what runs, and it re-checks each migration itself. An
    // earlier version gated this call on the phase, which quietly made the look-ahead the thing that
    // decided whether migrations happened at all — so a future migration whose `pending()` was wrong,
    // or threw, would never run, on any load, forever, with nothing reported.
    //
    // After the splash is released, not before: the migration has its own screen inside the desktop,
    // and running it behind the boot screen is exactly what this stopped doing.
    await this.#migrate();
  }

  /**
   * Run the pending migrations behind the screen that is already up, then apply what they wrote.
   *
   * The desktop underneath is currently painting this browser's settings, because the account had
   * none. When the migration succeeds those same settings are on the account, so the reload below
   * changes nothing visible — which is the point. What it does do is make the account the source of
   * truth from here on, without a second load.
   */
  async #migrate(): Promise<void> {
    const persistence = this.#persistence;
    if (!persistence) return;

    // Bounded, because `running` has no button. The migration is not cancelled — it may already
    // have written — it is simply no longer the thing holding the screen. See
    // `UMBRADESKTOP_MIGRATION_TIMEOUT_MS`.
    let expired: number | undefined;
    const bound = new Promise<never>((_, reject) => {
      expired = window.setTimeout(
        () => reject(new Error('The migration did not finish in time.')),
        UMBRADESKTOP_MIGRATION_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([this.#runMigrations(persistence), bound]);
    } catch (error) {
      // The backstop that matters most in this file. `running` is deliberately the one state with
      // no way out, so a throw escaping here leaves somebody behind a full-screen overlay they
      // cannot dismiss. Anything unexpected lands them on the failed screen instead, which has a
      // button and tells them their settings are still in this browser — true either way.
      // eslint-disable-next-line no-console
      console.error('[UmbraDesktop] Migration failed unexpectedly.', error);
      if (!this.#stale(persistence)) this.#migration.setValue({ phase: 'failed' });
    } finally {
      if (expired !== undefined) window.clearTimeout(expired);
    }
  }

  /**
   * Whether the run holding this persistence has been overtaken by a newer one.
   *
   * Both the load and the migration write to shared state after several awaits, and
   * {@link #buildPersistence} replaces `#persistence` whenever the current user changes. Without
   * this, an in-flight run could finish after the switch and paint one person's wallpaper, theme
   * and pinned apps onto another person's desktop — and worse, `#persist` would then save them
   * there.
   *
   * Reachable only if the signed-in user changes without the page reloading, which signing out does
   * not normally allow. Cheap insurance against the worst category of bug this feature has.
   * @param persistence The persistence the caller started with.
   * @returns True when a newer run has taken over and this one must stop.
   */
  #stale(persistence: UmbraDesktopSettingsPersistence): boolean {
    return this.#persistence !== persistence;
  }

  /**
   * The migration run itself, separated so {@link #migrate} is nothing but its safety net.
   * @param persistence The persistence to run against.
   */
  async #runMigrations(persistence: UmbraDesktopSettingsPersistence): Promise<void> {
    const report = await persistence.migrate((migration) => {
      if (this.#stale(persistence)) return;
      this.#migration.setValue({ phase: 'running', descriptionKey: migration.descriptionKey });
    });

    // Migrations write to the account through their own store, so the work stands either way. What
    // must not happen is reporting it on a desktop that now belongs to somebody else.
    if (this.#stale(persistence)) return;

    if (report.unrecorded.length > 0) {
      // The work stands, the bookkeeping did not, and it will be attempted again next load. Not
      // worth interrupting anybody over, but invisible without this.
      // eslint-disable-next-line no-console
      console.info('[UmbraDesktop] Migrations ran but could not be recorded:', report.unrecorded);
    }

    if (report.failure) {
      this.#migration.setValue({ phase: 'failed', descriptionKey: report.failure.descriptionKey });
      return;
    }

    if (report.applied.length === 0) {
      // Nothing was applied. Either nothing was pending — the ordinary case, where no screen ever
      // went up — or the look-ahead was wrong and a screen did. Either way, idle: there is nothing
      // to congratulate anybody on.
      //
      // Note this also covers a migration that did the work but whose record failed. That lands in
      // `unrecorded`, logged above, and it will be attempted again next load. The screen says
      // nothing because the outcome is genuinely "come back later", not "done".
      this.#migration.setValue({ phase: 'idle' });
      return;
    }

    const load = await persistence.load();
    if (this.#stale(persistence)) return;
    this.#settings.setValue(load.settings);
    await this.#refreshView(load.settings.wallpaper);
    if (this.#stale(persistence)) return;

    this.#migration.setValue({ phase: 'done' });
  }

  /**
   * Take the migration screen away, because the person pressed the button on it.
   *
   * Explicit rather than timed. A screen that lifted itself after a couple of seconds has to guess
   * how fast somebody reads, and the whole reason this screen exists is that a migration nobody saw
   * may as well not have been explained.
   */
  public dismissMigration(): void {
    this.#migration.setValue({ phase: 'idle' });
  }

  /**
   * Recompute the paintable view for a stored reference, fetching resized URLs when it points at
   * the Media Library. Used when settings are loaded: an item that was valid when it was chosen
   * may since have been deleted, in which case the desktop falls back to the default image.
   * @param ref The wallpaper to resolve.
   */
  async #refreshView(ref: UmbraDesktopWallpaperRef): Promise<void> {
    if (ref.kind !== 'media') {
      this.#view.setValue({ ref, background: resolveWallpaper(ref), thumbUrl: wallpaperThumbUrl(ref) });
      return;
    }

    const persistence = this.#persistence;

    const [url, thumbUrl] = await Promise.all([
      this.#resizedMediaUrl(ref.unique, UMBRADESKTOP_MEDIA_WALLPAPER_SIZE),
      this.#resizedMediaUrl(ref.unique, UMBRADESKTOP_MEDIA_THUMB_SIZE),
    ]);

    // Two imaging round trips is long enough for the user to have changed underneath them, and the
    // line below paints the desktop. Painting one person's wallpaper for another is precisely what
    // `#stale` exists to prevent, and this was one of the two places it was missing.
    if (persistence && this.#stale(persistence)) return;

    // A deleted or unreadable media item leaves both null, and resolveWallpaper falls back to
    // the default image rather than leaving the desktop blank.
    this.#view.setValue({
      ref,
      background: resolveWallpaper(ref, url),
      thumbUrl: wallpaperThumbUrl(ref, thumbUrl),
    });
  }

  /**
   * Ask Umbraco for a resized copy of a media item, bounded to a square box. See
   * `media-imaging.ts` for what the request has to look like and why — both of its rules were
   * bugs that made picking a Media Library wallpaper fail outright.
   * @param unique The media item's key.
   * @param size The longest edge to allow, in pixels.
   * @returns The resized URL, or `null` when the item cannot be resolved.
   */
  async #resizedMediaUrl(unique: string, size: number): Promise<string | null> {
    try {
      const { data } = await this.#imaging.requestResizedItems([unique], mediaImagingRequest(size));
      return data?.[0]?.url ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Write settings to the user's account, and report it when they do not get there.
   *
   * Fire-and-forget from the caller's point of view: the in-memory state has already changed, so the
   * desktop has already responded and the user is not waiting on a round trip to see their wallpaper
   * move. What they are waiting on is the *answer*, which is why a refusal is announced rather than
   * swallowed — a theme that silently failed to save looks identical to one that saved, right up
   * until the next machine.
   *
   * Does nothing before the user is known, which is the same guard the storage write always had.
   * @param settings The settings to persist.
   */
  async #persist(settings: UmbraDesktopSettings): Promise<void> {
    const persistence = this.#persistence;
    if (!persistence) return;

    // Before the write is even started. A save that goes out after the user changed would carry the
    // new user's token, and core's PUT has no ownership check, so it would re-home the old user's
    // row rather than fail. The repository refuses abandoned writes too; this is the cheaper half
    // of the same guard.
    if (this.#stale(persistence)) return;

    if (await persistence.save(settings)) return;

    // The failure belongs to the user whose save it was. Telling whoever is on screen now would be
    // reporting a problem they did not cause and cannot act on.
    if (this.#stale(persistence)) return;

    const message = this.#localize.term('umbraDesktop_settingsNotSaved');
    const notifications = await this.getContext(UMB_NOTIFICATION_CONTEXT);
    notifications?.peek('warning', { data: { message } });
  }
}

export default UmbraDesktopSettingsContext;
