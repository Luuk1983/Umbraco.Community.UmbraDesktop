import type { ManifestElement, ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';

/**
 * What a `umbraDesktopApp` manifest carries beyond the extension basics.
 *
 * Note what is **absent**: no `url`, no `section`, no `chromeProfile`. A self-contained app points
 * at nothing, is gated by nothing, and has no backoffice chrome to strip. Their absence is what
 * keeps the design's boundary structural rather than advisory: a package cannot express a
 * deep-linked catalogue entry through this type even if it wants to, so deep links stay curated in
 * this repository where their URL and chrome profile can be verified.
 */
export interface MetaUmbraDesktopApp {
  /** Window title. A localisation token (`#myPackage_minesweeper`) or a literal string. */
  label: string;
  /** Umbraco icon alias, e.g. `icon-bomb`. Native `icon-*` only; falls back to `icon-box`. */
  icon?: string;
  /** Launcher group alias. Unknown or unset lands the app in the reserved "More" group. */
  group?: string;
  /** Default window size in px. */
  defaultSize?: { w: number; h: number };
  /** Minimum window size in px; falls back to the global minimum when unset. */
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
