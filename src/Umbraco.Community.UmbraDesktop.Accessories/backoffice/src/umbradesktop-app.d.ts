import type { ManifestElement, ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';

/**
 * The desktop's manifest types, `umbraDesktopApp`, `umbraDesktopCatalogue` and `umbraDesktopDocs`, declared here because
 * a consuming package cannot import them.
 *
 * **This file is a hand-written copy of a contract that lives in another package, and it exists
 * because there is currently no other way.** UmbraDesktop's own `app.extension.ts` and
 * `catalogue.extension.ts` declare these types and register them in Umbraco's
 * `UmbExtensionManifestMap`, but those declarations reach nobody
 * outside its own project: the host's npm package is `private`, its NuGet package ships built
 * JavaScript rather than TypeScript, and `docs/developer/desktop-apps.md` makes a virtue of the contract
 * being structural, so nothing is imported from the host at all.
 *
 * The consequence is not a warning but a build failure, and one whose message points at the wrong
 * thing. Without this file, `type: 'umbraDesktopApp'` matches no arm of the `UmbExtensionManifest`
 * union, TypeScript falls back to `ManifestBase`, and the only complaint is
 * `TS2353: 'element' does not exist in type 'ManifestBase'`. Every other field is quietly accepted,
 * so an author reads that as "my element field is wrong" and goes looking at the loader, which is
 * correct. The one line naming the real problem is not printed.
 *
 * Kept to the fields §2 of the guide documents and no more. It will drift if the host adds a field,
 * and a drifted copy is still better than no types: an extra field the host reads and this file
 * does not know about fails the same way, loudly, at build time.
 */
interface MetaUmbraDesktopApp {
  /** Window title, taskbar label and launcher tile text. A localisation token or a literal. */
  label: string;
  /** Native Umbraco icon alias, e.g. `icon-bomb`. Falls back to `icon-box`. */
  icon?: string;
  /** Launcher group alias. Unknown or unset lands the app in the reserved More group. */
  group?: string;
  /** Opening **content** size in px: the app's own box, with the chrome added by the host. */
  defaultSize?: { w: number; h: number };
  /**
   * Smallest **content** box the app can work in; falls back to the desktop's global content
   * minimum. The host floors the window at what its own chrome needs, so a small number here
   * cannot cost a window its controls.
   */
  minSize?: { w: number; h: number };
  /** Whether two windows of this app may be open at once. */
  allowMultiple?: boolean;
  /** Whether the window may be resized or maximized. Default: allowed. */
  resizable?: boolean;
}

/**
 * A self-contained desktop app: one custom element, opened in a window.
 *
 * `ManifestElement` is where `element`, `alias`, `name` and `weight` come from, and
 * `ManifestWithDynamicConditions` is what makes Umbraco's own conditions apply, both exactly as in
 * the host's declaration. See {@link MetaUmbraDesktopApp} for why this is written out here.
 */
interface ManifestUmbraDesktopApp extends ManifestElement<HTMLElement>, ManifestWithDynamicConditions {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopApp';
  /** Everything the desktop needs beyond the extension basics. */
  meta: MetaUmbraDesktopApp;
}

/** A launcher group this package defines. A copy of the host's `UmbraDesktopPackageGroup`. */
interface UmbraDesktopPackageGroup {
  /** Stable id, named by an app's `meta.group` or an entry's `group`. */
  alias: string;
  /** Heading text: a localisation token from this package's dictionary, or a literal. */
  label: string;
  /** Position among the launcher's groups, **lower first**: the host's Editing is 10, System 50, Experimental 70. */
  weight?: number;
}

/** A deep link into one of this package's backoffice screens. A copy of the host's `UmbraDesktopPackageEntry`. */
interface UmbraDesktopPackageEntry {
  /** Stable app id and pin key. Reuse one of the host's aliases to replace that entry. */
  alias: string;
  /** Alias of a registered section, dashboard or default-kind menu item; the URL is inferred from it. */
  ref?: string;
  /** An explicit backoffice path under `/umbraco/section/` on this site, for what `ref` cannot infer. */
  url?: string;
  /** Permission gate; required with a menu-item `ref` or a `url`. */
  section?: string;
  /** Window title and tile text; defaults to the referenced extension's label. */
  name?: string;
  /** Native Umbraco icon alias; defaults to the referenced extension's icon. */
  icon?: string;
  /** How much backoffice chrome the window keeps. Defaults to `full-section`. */
  chromeProfile?: 'full-section' | 'workspace-only' | 'bare';
  /** The window body's opening size in px; the host adds the theme's chrome. */
  defaultSize?: { w: number; h: number };
  /** The smallest body in px; floored at what the theme's chrome needs. */
  minSize?: { w: number; h: number };
  /** Whether two windows of it may be open at once. */
  allowMultiple?: boolean;
  /** Whether the window may be resized or maximized. Default: allowed. */
  resizable?: boolean;
  /** Position within its group, **lower first**, like the host's own entries. */
  weight?: number;
  /** Launcher group alias. */
  group?: string;
  /** Mount-independent condition aliases on the referenced extension to answer before showing it. */
  evaluateConditions?: string[];
}

/** What a `umbraDesktopCatalogue` manifest carries. A copy of the host's `MetaUmbraDesktopCatalogue`. */
interface MetaUmbraDesktopCatalogue {
  /** Launcher groups this package defines. */
  groups?: UmbraDesktopPackageGroup[];
  /** Deep links into this package's backoffice screens. */
  entries?: UmbraDesktopPackageEntry[];
}

/**
 * A package's catalogue: its own launcher groups and backoffice deep links, as data. The host promises
 * these types only ever gain optional fields, which is what keeps this copy correct while it lags.
 */
interface ManifestUmbraDesktopCatalogue extends ManifestWithDynamicConditions {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopCatalogue';
  /** The groups and entries. */
  meta: MetaUmbraDesktopCatalogue;
}

/** What a `umbraDesktopDocs` manifest carries. A copy of the host's `MetaUmbraDesktopDocs`. */
interface MetaUmbraDesktopDocs {
  /** The docs folder's URL path on the site, under `/App_Plugins/`. */
  path: string;
}

/** A package's docs for the Help app, as data. Only ever gains optional fields, like the others. */
interface ManifestUmbraDesktopDocs extends ManifestWithDynamicConditions {
  /** Discriminates this manifest from every other extension type. */
  type: 'umbraDesktopDocs';
  /** Where the docs are. */
  meta: MetaUmbraDesktopDocs;
}

declare global {
  /**
   * Adds `umbraDesktopApp`, `umbraDesktopCatalogue` and `umbraDesktopDocs` to Umbraco's own extension type map, which is
   * what makes the manifests assignable to `UmbExtensionManifest` and so accepted in this package's
   * `manifests` array. Umbraco's own extension kinds declare themselves the same way, and so does
   * the host.
   */
  interface UmbExtensionManifestMap {
    /** This package's desktop apps. */
    umbraDesktopApp: ManifestUmbraDesktopApp;
    /** This package's launcher groups. */
    umbraDesktopCatalogue: ManifestUmbraDesktopCatalogue;
    /** This package's docs, for the Help app. */
    umbraDesktopDocs: ManifestUmbraDesktopDocs;
  }
}
