import { UMBRADESKTOP_TRAY_CONTEXT } from './tray.context-token.js';
import { normaliseTrayItems, type UmbraDesktopTrayItem } from './tray-items.js';
import type { UmbraDesktopApp } from '../../types';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbExtensionsManifestInitializer } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UmbBasicState } from '@umbraco-cms/backoffice/observable-api';
import { combineLatest, distinctUntilChanged, map, type Observable } from '@umbraco-cms/backoffice/external/rxjs';
import { isFeatureEnabled } from '../features/enabled.js';

/**
 * The registry the tray items are read from: the whole thing, for the reason
 * `app-catalogue.context.ts` gives beside its own alias of the same type. The initializer takes an
 * `UmbExtensionRegistry`, whose `#private` fields make it nominal, so no narrower facade would be
 * assignable, and a test passes a real `new UmbExtensionRegistry()` anyway because condition
 * evaluation only exists there.
 */
type UmbraDesktopExtensionRegistry = typeof umbExtensionsRegistry;

/**
 * What the context needs of the rest of the desktop, passed in rather than consumed.
 *
 * Passed in because the desktop element owns all of these and constructs this beside them, so there is
 * nothing to wait for, and because a test can then replace each with a function it can watch.
 */
export interface UmbraDesktopTrayDependencies {
  /**
   * Launch an app as its launcher tile does.
   * @param app The app to open.
   */
  open(app: UmbraDesktopApp): void;
  /**
   * The apps this user may launch now, already gated by the catalogue.
   * @returns The apps, in launcher order.
   */
  getApps(): ReadonlyArray<UmbraDesktopApp>;
  /**
   * Store a taskbar feature's on/off choice for this user.
   * @param id The feature id, here always a tray item's alias.
   * @param enabled Whether it should be on.
   */
  setFeature(id: string, enabled: boolean): void;
  /**
   * The user's stored on/off choices for taskbar features and tray items, keyed by id. Passed as an
   * observable so {@link UmbraDesktopTrayContext.trayItemEnabled} follows Desktop settings while both are open.
   * @returns The map; absent keys mean "the item's own default".
   */
  observeFeatures(): Observable<Readonly<Record<string, boolean>>>;
}

/**
 * The system tray's public face (umbraCoffee design §7): the validated tray items, and the only three
 * calls meant for packages, `openApp`, `setTrayItemEnabled` and `trayItemEnabled`. The members inherited from
 * `UmbContextBase` are not part of that contract. This is a separate context rather than the window
 * manager or the settings handed out whole, so what a package is meant to call is this short list.
 *
 * It holds the item list rather than leaving each reader to validate the manifests itself, so the
 * taskbar and Desktop settings read one list and a bad manifest is reported once, not once per
 * reader.
 */
export class UmbraDesktopTrayContext extends UmbContextBase {
  /**
   * The items, validated, in registry order, backing {@link items}.
   *
   * `UmbBasicState`, deliberately, as `theme/theme.context.ts` does for its stylesheets. Every item
   * carries the registry's own manifest object by reference, and `UmbArrayState` deep-freezes what
   * it holds in place, which would freeze those manifests inside the registry. Umbraco's documented
   * `umbExtensionsRegistry.appendCondition(alias, …)` copies a manifest shallowly and pushes into its
   * original `conditions` array, so on a frozen one it throws. A plain state leaves them alone and
   * compares by identity, which fits a list that `normaliseTrayItems` rebuilds on every callback.
   */
  #items = new UmbBasicState<ReadonlyArray<UmbraDesktopTrayItem>>([]);

  /** The items, validated, in registry order. Read by the taskbar and by Desktop settings. */
  public readonly items = this.#items.asObservable();

  /** The rest of the desktop, reduced to the four calls this needs. */
  #deps: UmbraDesktopTrayDependencies;

  /**
   * Refusals already reported, keyed by alias and reason, so each is said once per desktop. The
   * initializer calls back on every registration and every condition flip, and a warning repeated on
   * each of those would bury the one line an author needs.
   */
  #reported = new Set<string>();

  /**
   * @param host The desktop element this context is provided on.
   * @param deps What this needs of the window manager, catalogue and settings.
   * @param registry The extension registry; the backoffice's own unless a test passes one.
   */
  constructor(
    host: UmbControllerHost,
    deps: UmbraDesktopTrayDependencies,
    registry: UmbraDesktopExtensionRegistry = umbExtensionsRegistry,
  ) {
    super(host, UMBRADESKTOP_TRAY_CONTEXT);
    this.#deps = deps;
    // Through the initializer rather than `byType`, so a manifest's `conditions` are honoured, as the
    // app catalogue does for `umbraDesktopApp` (its comment explains the difference at length). It
    // calls back again whenever an item registers late or its conditions flip, so the list follows.
    // The callback's entries are the per-manifest controllers, hence the `.manifest`.
    new UmbExtensionsManifestInitializer(
      this,
      registry,
      'umbraDesktopTrayItem',
      null,
      (permitted) => {
        const { items, dropped } = normaliseTrayItems(permitted.map((controller) => controller.manifest));
        for (const { alias, reason } of dropped) {
          const key = `${alias}:${reason}`;
          if (this.#reported.has(key)) continue;
          this.#reported.add(key);
          console.warn(`[UmbraDesktop] The tray item "${alias}" was dropped because ${reason}.`);
        }
        this.#items.setValue(items);
      },
      'observeTrayItems',
    );
  }

  /**
   * Open a registered app, as its launcher tile does. Only apps this user may launch are found, so
   * a package cannot open something the launcher would not show.
   * @param alias The app's alias.
   * @returns False when this user has no such app, so the caller can say so rather than do nothing.
   */
  public openApp(alias: string): boolean {
    const app = this.#deps.getApps().find((candidate) => candidate.alias === alias);
    if (!app) return false;
    this.#deps.open(app);
    return true;
  }

  /**
   * Switch a tray item on or off for this user, as its switch in Desktop settings does. Refuses any
   * id that is not a registered tray item, so a package cannot reach the host's own features through
   * the one settings call it is given.
   * @param alias The tray item's alias.
   * @param enabled Whether it should be on.
   * @returns False when the alias is not a tray item.
   */
  public setTrayItemEnabled(alias: string, enabled: boolean): boolean {
    if (!this.#items.getValue().some((item) => item.alias === alias)) return false;
    this.#deps.setFeature(alias, enabled);
    return true;
  }

  /**
   * Whether a tray item is switched on for this user, following the stored choice and the item's own
   * default, so an app's own switch and the one in Desktop settings stay in step. The same rule
   * `isFeatureEnabled` gives the taskbar, so it cannot disagree with what the tray shows.
   * @param alias The tray item's alias.
   * @returns An observable that emits the current value on subscribe and again on each change; `false` for an alias that is not a registered tray item.
   */
  public trayItemEnabled(alias: string): Observable<boolean> {
    return combineLatest([this.items, this.#deps.observeFeatures()]).pipe(
      map(([items, stored]) => {
        const item = items.find((candidate) => candidate.alias === alias);
        return item ? isFeatureEnabled(stored, { id: item.alias, defaultEnabled: item.defaultEnabled }) : false;
      }),
      distinctUntilChanged(),
    );
  }
}
