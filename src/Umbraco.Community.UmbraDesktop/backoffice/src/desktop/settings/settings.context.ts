import type {
  UmbraDesktopClockCycle,
  UmbraDesktopLocaleSource,
  UmbraDesktopSettings,
  UmbraDesktopWallpaperRef,
} from './types';
import type { UmbraDesktopWallpaperView } from './wallpaper-view';
import { resolveWallpaper, wallpaperThumbUrl } from './wallpaper';
import { togglePinned } from './pinned';
import { withFeatureEnabled } from '../taskbar/features/enabled';
import { UMBRADESKTOP_DEFAULT_SETTINGS, parseSettings, serialiseSettings, settingsStorageKey } from './settings-store';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from './settings.context-token';
import {
  UMBRADESKTOP_MEDIA_THUMB_SIZE,
  UMBRADESKTOP_MEDIA_WALLPAPER_SIZE,
  mediaImagingRequest,
} from './media-imaging';
import { writeBootHint } from '../boot/boot-storage';
import { themeWallpaper } from '../theme/theme-wallpaper';
import { UMBRADESKTOP_THEMES } from '../theme/themes/index';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbBooleanState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import { UmbImagingRepository } from '@umbraco-cms/backoffice/imaging';

/**
 * Owns the current user's desktop settings: the persisted preference, and the resolved view the
 * desktop and the settings dialog actually paint. Provided by the desktop element, so it is
 * scoped to the desktop subtree the same way the window manager and app catalogue are.
 *
 * Persistence is per-browser `localStorage`, keyed by user. Storage is treated as best-effort
 * throughout: a browser that refuses it (private mode, site data blocked) still gets a working
 * desktop for the session, just one that forgets.
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

  #imaging: UmbImagingRepository;

  /** The current user's id, once known. Until then nothing is persisted. */
  #userUnique?: string;

  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_SETTINGS_CONTEXT);
    this.#imaging = new UmbImagingRepository(host);

    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.currentUser, (user) => {
        if (!user?.unique || user.unique === this.#userUnique) return;
        this.#userUnique = user.unique;
        void this.#load();
      });
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
   * Pin an app to Favourites, or unpin it if it is already pinned.
   * @param alias The app alias to toggle.
   */
  public togglePin(alias: string): void {
    this.#update({ pinned: togglePinned(this.#settings.getValue().pinned, alias) });
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
   * Writes the browser-level hint as well as the payload, so the next boot can raise the splash
   * before it knows who is logged in.
   * @param enabled Whether to boot into the desktop.
   */
  public setBootIntoDesktop(enabled: boolean): void {
    this.#update({ bootIntoDesktop: enabled });
    writeBootHint(enabled);
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
    this.#persist(settings);
  }

  /**
   * Read this user's stored settings and apply them, then report that the desktop may paint.
   *
   * Awaits the view refresh rather than firing it off, because `loaded` is what lifts the boot
   * splash: lifting it while a Media Library wallpaper was still resolving would hand over to a
   * desktop that is about to change under the user.
   */
  async #load(): Promise<void> {
    const settings = parseSettings(this.#read());
    this.#settings.setValue(settings);
    // Mirror the boot preference to a browser-level key so the *next* boot can decide whether to
    // raise the splash before it knows who is logged in. See `boot/constants.ts`.
    writeBootHint(settings.bootIntoDesktop);
    await this.#refreshView(settings.wallpaper);
    this.#loaded.setValue(true);
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

    const [url, thumbUrl] = await Promise.all([
      this.#resizedMediaUrl(ref.unique, UMBRADESKTOP_MEDIA_WALLPAPER_SIZE),
      this.#resizedMediaUrl(ref.unique, UMBRADESKTOP_MEDIA_THUMB_SIZE),
    ]);

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
   * Read the raw stored payload.
   * @returns The payload, or `null` when nothing is stored or storage is unavailable.
   */
  #read(): string | null {
    if (!this.#userUnique) return null;
    try {
      return localStorage.getItem(settingsStorageKey(this.#userUnique));
    } catch {
      return null;
    }
  }

  /**
   * Write settings to storage. Silently does nothing when the user is not yet known or the
   * browser refuses storage — the in-memory state has already been updated either way.
   * @param settings The settings to persist.
   */
  #persist(settings: UmbraDesktopSettings): void {
    if (!this.#userUnique) return;
    try {
      localStorage.setItem(settingsStorageKey(this.#userUnique), serialiseSettings(settings));
    } catch {
      // Private mode or blocked site data: the desktop still works, it just forgets.
    }
  }
}

export default UmbraDesktopSettingsContext;
