import type {
  ManifestApi,
  ManifestElement,
  ManifestWithDynamicConditions,
  UmbApi,
} from '@umbraco-cms/backoffice/extension-api';

/**
 * The desktop manifest types this package registers, declared here because a consuming package
 * cannot import them. Accessories' `umbradesktop-app.d.ts` explains why this copy has to exist and
 * what fails without it; this one is cut down to the types this package uses, and carries the host
 * additions the Media Manager relies on (`hideFromLauncher`, and the attached-page events and
 * property below).
 */

/** What an `umbraDesktopApp` manifest carries. A copy of the host's `MetaUmbraDesktopApp`. */
interface MetaUmbraDesktopApp {
  /** Window title, taskbar label and launcher tile text. A localisation token or a literal. */
  label: string;
  /** Native Umbraco icon alias. Falls back to `icon-box`. */
  icon?: string;
  /** Launcher group alias. Unknown or unset lands the app in the reserved More group. */
  group?: string;
  /** Opening **content** size in px: the app's own box, with the chrome added by the host. */
  defaultSize?: { w: number; h: number };
  /** Smallest **content** box the app can work in. */
  minSize?: { w: number; h: number };
  /** Whether two windows of this app may be open at once. */
  allowMultiple?: boolean;
  /** Whether the window may be resized or maximized. Default: allowed. */
  resizable?: boolean;
  /**
   * The app has no launcher tile and no search result, and opens only when another app asks for it
   * with `openApp`. For a window that belongs to a feature rather than to the person, such as Transfers.
   */
  hideFromLauncher?: boolean;
}

/** A self-contained desktop app: one custom element, opened in a window. */
interface ManifestUmbraDesktopApp extends ManifestElement<HTMLElement>, ManifestWithDynamicConditions {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopApp';
  /** Everything the desktop needs beyond the extension basics. */
  meta: MetaUmbraDesktopApp;
}

/** A launcher group this package defines. A copy of the host's `UmbraDesktopPackageGroup`. */
interface UmbraDesktopPackageGroup {
  /** Stable id, named by an app's `meta.group`. */
  alias: string;
  /** Heading text: a localisation token from this package's dictionary, or a literal. */
  label: string;
  /** Position among the launcher's groups, **lower first**: the host's Editing is 10, System 50, Experimental 70. */
  weight?: number;
}

/**
 * What a `umbraDesktopCatalogue` manifest carries: a copy of the host's `MetaUmbraDesktopCatalogue`,
 * less the `entries` this package has no use for, since it has no backoffice screen of its own.
 */
interface MetaUmbraDesktopCatalogue {
  /** Launcher groups this package defines. */
  groups?: UmbraDesktopPackageGroup[];
}

/** A package's catalogue: its own launcher groups, as data. Only ever gains optional fields. */
interface ManifestUmbraDesktopCatalogue extends ManifestWithDynamicConditions {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopCatalogue';
  /** The groups. */
  meta: MetaUmbraDesktopCatalogue;
}

/** What a `umbraDesktopDocs` manifest carries. A copy of the host's `MetaUmbraDesktopDocs`. */
interface MetaUmbraDesktopDocs {
  /** The docs folder's URL path on the site, under `/App_Plugins/`. */
  path: string;
}

/** A package's docs for the Help app, as data. Only ever gains optional fields. */
interface ManifestUmbraDesktopDocs extends ManifestWithDynamicConditions {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopDocs';
  /** Where the docs are. */
  meta: MetaUmbraDesktopDocs;
}

/** A package context on the desktop element. A copy of the host's `ManifestUmbraDesktopContext`. */
interface ManifestUmbraDesktopContext extends ManifestApi<UmbApi>, ManifestWithDynamicConditions {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopContext';
}

declare global {
  /**
   * What `umbradesktop-open-attached` carries: a backoffice page to show beside the app's own window.
   * A copy of the host's contract (`docs/developer/desktop-apps.md`). One page per key; the same key
   * again routes the open page, and the page it is already on only renames it.
   */
  interface UmbraDesktopOpenAttachedDetail {
    /** The app's own name for the page. */
    key: string;
    /** The page, under `/umbraco/section/`. Anything else is refused. Not with `app`. */
    path?: string;
    /**
     * Instead of a page, one of this package's own element apps, by its `umbraDesktopApp` alias (#141):
     * Media Cleanup's details pane. Usually one hidden from the launcher. Not with `path`.
     */
    app?: string;
    /** The pane header and window title. */
    name: string;
    /** The pane header and window icon. */
    icon: string;
    /** Open it as a window even where a pane would fit, as Shift-click asks. */
    floating?: boolean;
  }

  /** What `umbradesktop-close-attached` carries: the key of the page to close, asking first if dirty. */
  interface UmbraDesktopCloseAttachedDetail {
    /** The key the page was opened under. */
    key: string;
  }

  /**
   * `umbradesktop-app-focus` carries no detail: it brings the app's window and its group forward,
   * restoring it when minimised (`docs/developer/desktop-apps.md` §7.6).
   */
  type UmbraDesktopAppFocusDetail = undefined;

  /**
   * What the desktop sets as an app element's `attached` property: each key the app has a page open
   * under, and the page it is on now, or for an app of its own, that app's alias. Missing once it closes.
   */
  type UmbraDesktopAttachedPages = Readonly<Record<string, string>>;

  /** Adds the desktop types to Umbraco's extension type map, so the manifests are `UmbExtensionManifest`s. */
  interface UmbExtensionManifestMap {
    /** This package's desktop apps. */
    umbraDesktopApp: ManifestUmbraDesktopApp;
    /** This package's docs, for the Help app. */
    umbraDesktopCatalogue: ManifestUmbraDesktopCatalogue;
    umbraDesktopDocs: ManifestUmbraDesktopDocs;
    /** This package's desktop-level context. */
    umbraDesktopContext: ManifestUmbraDesktopContext;
  }
}
