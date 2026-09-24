import type { ManifestElement, ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';

/**
 * The `umbraDesktopApp` manifest type, declared here because a consuming package cannot import it.
 *
 * **This file is a hand-written copy of a contract that lives in another package, and it exists
 * because there is currently no other way.** UmbraDesktop's own `app.extension.ts` declares this
 * type and registers it in Umbraco's `UmbExtensionManifestMap`, but that declaration reaches nobody
 * outside its own project: the host's npm package is `private`, its NuGet package ships built
 * JavaScript rather than TypeScript, and `docs/desktop-apps.md` makes a virtue of the contract
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

declare global {
  /**
   * Adds `umbraDesktopApp` to Umbraco's own extension type map, which is what makes the manifest
   * assignable to `UmbExtensionManifest` and so accepted in this package's `manifests` array.
   * Umbraco's own extension kinds declare themselves the same way, and so does the host.
   */
  interface UmbExtensionManifestMap {
    /** This package's desktop apps. */
    umbraDesktopApp: ManifestUmbraDesktopApp;
  }
}
