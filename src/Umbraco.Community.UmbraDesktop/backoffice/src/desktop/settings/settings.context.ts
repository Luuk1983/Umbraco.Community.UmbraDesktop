import type { UmbraDesktopSettings, UmbraDesktopWallpaperRef } from './types';
import type { UmbraDesktopWallpaperView } from './wallpaper-view';
import { resolveWallpaper, wallpaperThumbUrl } from './wallpaper';
import { togglePinned } from './pinned';
import { UMBRADESKTOP_DEFAULT_SETTINGS, parseSettings, serialiseSettings, settingsStorageKey } from './settings-store';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from './settings.context-token';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import { UmbImagingRepository } from '@umbraco-cms/backoffice/imaging';
import { ImageCropModeModel } from '@umbraco-cms/backoffice/external/backend-api';

/** Width requested for a Media Library wallpaper. `Max` never upscales, so a small upload stays small. */
const MEDIA_FULL_WIDTH = 2560;

/** Width requested for a Media Library wallpaper's thumbnail. */
const MEDIA_THUMB_WIDTH = 480;

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
        this.#load();
      });
    });
  }

  /**
   * Choose a built-in wallpaper, or none. Applies immediately and persists.
   * @param wallpaper The wallpaper to use.
   */
  public setWallpaper(wallpaper: UmbraDesktopWallpaperRef): void {
    this.#update({ wallpaper });
    this.#view.setValue({
      ref: wallpaper,
      background: resolveWallpaper(wallpaper),
      thumbUrl: wallpaperThumbUrl(wallpaper),
    });
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
      this.#resizedMediaUrl(unique, MEDIA_FULL_WIDTH),
      this.#resizedMediaUrl(unique, MEDIA_THUMB_WIDTH),
    ]);

    if (!url) return false;

    this.#update({ wallpaper: ref });
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
   * Choose a chrome theme. Applies immediately and persists; the theme context observes this and
   * resolves it against the backoffice's light/dark setting.
   * @param id The theme id to use.
   */
  public setTheme(id: string): void {
    this.#update({ theme: id });
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

  /** Read this user's stored settings and apply them. */
  #load(): void {
    const settings = parseSettings(this.#read());
    this.#settings.setValue(settings);
    void this.#refreshView(settings.wallpaper);
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
      this.#resizedMediaUrl(ref.unique, MEDIA_FULL_WIDTH),
      this.#resizedMediaUrl(ref.unique, MEDIA_THUMB_WIDTH),
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
   * Ask Umbraco for a resized copy of a media item. This is what keeps a consumer's 12MB upload
   * from ever reaching the browser at full size — and why media wallpapers are WebP while the
   * built-ins are AVIF: ImageSharp, behind this endpoint, cannot encode AVIF.
   * @param unique The media item's key.
   * @param width The width to request.
   * @returns The resized URL, or `null` when the item cannot be resolved.
   */
  async #resizedMediaUrl(unique: string, width: number): Promise<string | null> {
    try {
      const { data } = await this.#imaging.requestResizedItems([unique], {
        width,
        mode: ImageCropModeModel.MAX,
        format: 'webp',
      });
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
