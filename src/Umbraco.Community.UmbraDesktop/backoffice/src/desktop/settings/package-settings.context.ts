import { UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT } from './package-settings.context-token.js';
import { openDesktopSettings } from './open-settings.js';
import { UmbraDesktopPackageSettingsStore } from './package-store/package-settings-store.js';
import type { UmbraDesktopPackageSettingsDocument } from './package-store/package-settings-store.js';
import { UmbraDesktopUserDataDocument } from './package-store/user-data-document.js';
import { UmbraDesktopUserDataServerClient } from '../user-data/server.client.js';
import { UMBRADESKTOP_USER_DATA_GROUP } from '../user-data/constants.js';
import type { UmbraDesktopUserDataClient } from '../user-data/types.js';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';

/**
 * The identifier a package's settings row is stored under, inside the package's own group. The one
 * Accessories already used, so it moved onto the store without a migration (design §5).
 */
const PACKAGE_SETTINGS_IDENTIFIER = 'Settings';

/**
 * What packages reach the desktop through (design §5): a per-user store for their settings, and a
 * way to open Desktop settings at their row.
 *
 * Global rather than provided by the desktop element, because code that runs for the desktop's whole
 * life has nowhere to live but a backoffice entry point, outside the desktop element: the Accessories
 * screensaver's idle watcher is one (design D6). It does nothing until asked; no request is made at
 * boot.
 *
 * A store keeps the value of the user who was signed in when it loaded. Signing in as somebody else
 * means a new page in the backoffice as it stands, so a change of user within one page is not handled.
 */
export class UmbraDesktopPackageSettingsContext extends UmbContextBase {
  /** One store per key, so every element in the page reads one value. */
  #stores = new Map<string, UmbraDesktopPackageSettingsStore>();

  /** Desktops showing now, latest last. Several exist briefly when Exit builds a new one. */
  #desktops: UmbControllerHost[] = [];

  /** Whether a signed-in user is known; stores load once there is one. */
  #signedIn = false;

  /**
   * @param host The backoffice element Umbraco hosts global contexts on.
   */
  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_PACKAGE_SETTINGS_CONTEXT);
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (context) => {
      this.observe(
        context?.unique,
        (unique) => {
          this.#signedIn = !!unique;
          if (unique) for (const store of this.#stores.values()) void store.load();
        },
        'observeCurrentUserUnique',
      );
    });
  }

  /**
   * The signed-in user's settings for a package, shared by every caller in the page.
   * @param key The package's own user-data group, such as `My.Package`. Not the desktop's.
   * @returns The store, or undefined for an empty key or the desktop's own group.
   */
  store(key: string): UmbraDesktopPackageSettingsStore | undefined {
    const trimmed = typeof key === 'string' ? key.trim() : '';
    if (!trimmed || trimmed.toLowerCase() === UMBRADESKTOP_USER_DATA_GROUP.toLowerCase()) {
      console.warn(`[UmbraDesktop] Package settings store "${key}" refused: use your package's own user-data group.`);
      return undefined;
    }
    let store = this.#stores.get(trimmed);
    if (!store) {
      store = new UmbraDesktopPackageSettingsStore(
        this._documentFor(trimmed),
        `${trimmed}.${PACKAGE_SETTINGS_IDENTIFIER}`,
      );
      this.#stores.set(trimmed, store);
    }
    // On every call, not only the first: a store whose read failed is read again the next time
    // something asks for it, which is how "close Desktop settings and open them again" retries.
    // Nothing is requested for a store that has loaded, and a read under way is joined.
    if (this.#signedIn) void store.load();
    return store;
  }

  /**
   * Open Desktop settings at a package's row, on the desktop showing now.
   * @param packageName The package's `meta.package`. Trimmed, as the row it names is, so a stray
   *   space does not miss it and leave the list showing.
   * @returns False when no desktop is showing, and nothing was opened.
   */
  openSettings(packageName: string): boolean {
    // Indexed rather than `.at(-1)`, which the project's ES2020 lib does not have.
    const desktop = this.#desktops[this.#desktops.length - 1];
    if (!desktop) return false;
    this._open(desktop, typeof packageName === 'string' ? packageName.trim() : packageName);
    return true;
  }

  /**
   * Called by the desktop element when it connects, so `openSettings` has somewhere to open.
   * @param desktop The desktop element.
   * @returns Call it when the desktop disconnects.
   */
  attachDesktop(desktop: UmbControllerHost): () => void {
    this.#desktops.push(desktop);
    return () => {
      this.#desktops = this.#desktops.filter((candidate) => candidate !== desktop);
    };
  }

  /**
   * Where a key's row lives. The seam tests replace, since the real one needs a backoffice.
   *
   * A document that looks again before it creates, not the desktop's own repository, which trusts
   * one read for the page's life: this store hears other tabs' saves, and a stale "no row" there
   * would make a second row on the next save (see {@link UmbraDesktopUserDataDocument}).
   * @param key The package's group.
   * @returns The document.
   */
  protected _documentFor(key: string): UmbraDesktopPackageSettingsDocument {
    return new UmbraDesktopUserDataDocument(this._userDataClient(), key, PACKAGE_SETTINGS_IDENTIFIER);
  }

  /**
   * The `user-data` endpoints a document talks to. A seam narrower than {@link _documentFor}, so a
   * test can put the real document in front of a fake server, and two contexts in front of one
   * server stand for two tabs of one user.
   * @returns The client.
   */
  protected _userDataClient(): UmbraDesktopUserDataClient {
    return new UmbraDesktopUserDataServerClient(this);
  }

  /**
   * Open the panel. The seam tests replace, since the modal manager needs a backoffice.
   * @param desktop The desktop element, whose contexts the panel sees.
   * @param packageName The package to open at.
   */
  protected _open(desktop: UmbControllerHost, packageName: string): void {
    void openDesktopSettings(desktop, packageName);
  }

  /** Stop hearing other tabs. */
  override destroy(): void {
    for (const store of this.#stores.values()) store.close();
    this.#stores.clear();
    super.destroy();
  }
}

export default UmbraDesktopPackageSettingsContext;
