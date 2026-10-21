import type { ManifestApi, ManifestElement, ManifestWithDynamicConditions, UmbApi } from '@umbraco-cms/backoffice/extension-api';

/**
 * The desktop manifest types this package registers, declared here because a consuming package
 * cannot import them. The Arcade's `umbradesktop-app.d.ts` explains why this copy has to exist and
 * what fails without it; this one is cut down to the types this package uses. `umbraDesktopApp` came
 * with the Optimize images window (#139), this package's first app.
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
  /** The app has no launcher tile and no search result, and opens only when code asks for it with `openApp`. */
  hideFromLauncher?: boolean;
}

/** A self-contained desktop app: one custom element, opened in a window. */
interface ManifestUmbraDesktopApp extends ManifestElement<HTMLElement>, ManifestWithDynamicConditions {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopApp';
  /** Everything the desktop needs beyond the extension basics. */
  meta: MetaUmbraDesktopApp;
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
  /** Adds the two types to Umbraco's extension type map, so the manifests are `UmbExtensionManifest`s. */
  interface UmbExtensionManifestMap {
    /** The Optimize images window. */
    umbraDesktopApp: ManifestUmbraDesktopApp;
    /** This package's docs, for the Help app. */
    umbraDesktopDocs: ManifestUmbraDesktopDocs;
    /** This package's desktop-level context. */
    umbraDesktopContext: ManifestUmbraDesktopContext;
  }
}
