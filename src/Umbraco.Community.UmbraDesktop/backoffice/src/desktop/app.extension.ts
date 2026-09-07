import type { ManifestElement, ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';

/**
 * What a `umbraDesktopApp` manifest carries beyond the extension basics.
 *
 * Note what is **absent**: no `url`, no `section`, no `chromeProfile`. A self-contained app points
 * at nothing, is gated by nothing, and has no backoffice chrome to strip. Their absence is what
 * keeps the design's boundary structural rather than advisory: a package cannot express a
 * deep-linked catalogue entry through this type even if it wants to, so deep links stay curated in
 * this repository where their URL and chrome profile can be verified.
 *
 * Ordering is absent too, and on purpose: it lives on the manifest's root `weight`, where Umbraco
 * puts it, rather than being duplicated here as a second knob for one thing. See
 * {@link ManifestUmbraDesktopApp.weight}.
 */
export interface MetaUmbraDesktopApp {
  /** Window title. A localisation token (`#myPackage_minesweeper`) or a literal string. */
  label: string;
  /** Umbraco icon alias, e.g. `icon-bomb`. Native `icon-*` only; falls back to `icon-box`. */
  icon?: string;
  /** Launcher group alias. Unknown or unset lands the app in the reserved "More" group. */
  group?: string;
  /**
   * The **content** box the app opens at, in px: its own box, not the window around it.
   *
   * The host adds the active theme's chrome, because the host is the only party that can. Each of
   * the five themes draws its own titlebar, one of them draws a frame ring below the body as well
   * as above it, and none of that is readable from another package — the first app to ship against
   * this field was a window size guessed a titlebar allowance of "the tallest of the five" plus
   * slack for the bevels, and was 32px short under Windows 98. See `window-chrome.ts`.
   */
  defaultSize?: { w: number; h: number };
  /**
   * The smallest **content** box the app can work in, in px; falls back to the desktop's global
   * content minimum when unset.
   *
   * Floored, not obeyed blindly: the effective window minimum is this plus the chrome, or what the
   * chrome itself needs, whichever is larger. An app cannot shrink a window until one of the
   * desktop's own affordances is gone.
   */
  minSize?: { w: number; h: number };
  /** Whether more than one window of this app may be open at once. Default: allowed. */
  allowMultiple?: boolean;
}

/**
 * A self-contained desktop app: one custom element, opened in a window, registered by any package.
 *
 * Extends `ManifestWithDynamicConditions` so Umbraco's own condition system decides availability.
 * That is a better answer than a section gate, which is what the curated catalogue uses and which
 * means nothing here: there is no backing section to be permitted to. No conditions means always
 * available, which for a game is right: reaching the desktop at all is already gated by the
 * desktop section's permission.
 */
export interface ManifestUmbraDesktopApp extends ManifestElement<HTMLElement>, ManifestWithDynamicConditions {
  type: 'umbraDesktopApp';
  meta: MetaUmbraDesktopApp;
  /**
   * Where the app sits inside its launcher group, following **Umbraco's convention: higher first.**
   *
   * Redeclared from `ManifestBase` for no other reason than to say that, because it is the one
   * thing about this manifest an author cannot check by trying it once. `weight: 1000` means "put
   * me at the front", exactly as it does for a dashboard or a menu item, and Umbraco's own registry
   * is where that comes from: it sorts extensions with `(b.weight || 0) - (a.weight || 0)`.
   *
   * The desktop's internal scale is the inverse (ascending, lower first), which is what the curated
   * catalogue's own numbers are written against, so `registered-apps.ts` negates this on the way in.
   * That is an implementation detail of ours and not something to compensate for here: write the
   * number Umbraco taught you to write.
   *
   * Unset is not "no opinion": the launcher sorts on `weight ?? 0`, so an unset app competes on the
   * number zero and lands at one end of its group. Against a curated entry (all positive on the
   * internal ascending scale) that is the front; against a registered peer that asked for a weight
   * (negative once inverted) that is the back. The name tiebreak only settles peers that are both
   * on zero. Said here because "unset means default position" is what this doc used to claim, and
   * it is the kind of wrong that only shows up once a package ships a second app.
   */
  weight?: number;
}

declare global {
  /**
   * Registers the manifest with Umbraco's own type map, which is what makes a `umbraDesktopApp`
   * object assignable to `UmbExtensionManifest` (and so accepted by `umbExtensionsRegistry` and by
   * a package's `manifests` array) without every consumer importing this file's type. Umbraco's
   * own extension kinds declare themselves the same way.
   */
  interface UmbExtensionManifestMap {
    umbraDesktopApp: ManifestUmbraDesktopApp;
  }
}
