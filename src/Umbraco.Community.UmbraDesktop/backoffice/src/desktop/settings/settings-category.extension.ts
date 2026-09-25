import type { ManifestElement, ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';

/**
 * What a `umbraDesktopSettingsCategory` manifest carries beyond the extension basics: the three
 * things the panel draws a row from.
 *
 * The same three a curated category has (`categories/types.ts`), with one difference in kind: a
 * curated category names localisation *keys* the host ships, while a registered one names strings
 * that are passed through `localize.string`, so a `#token` from the registering package's own
 * dictionary and a literal both work. That is the `meta.label` convention `umbraDesktopApp` already
 * uses, and for the same reason: the host cannot ship another package's words.
 */
export interface MetaUmbraDesktopSettingsCategory {
  /** The row's name and the screen's heading. A localisation token (`#myPackage_settings`) or a literal. */
  label: string;
  /**
   * The line under the row's name: what the category is *for*, not what is set inside it. A token or
   * a literal. See `categories/types.ts` for why a description rather than a summary.
   */
  description: string;
  /**
   * Umbraco icon alias for the row. Falls back to `icon-settings`.
   *
   * Check the alias exists before shipping it: one that does not renders as blank space with no
   * error anywhere, which is how the Taskbar row shipped for a day.
   */
  icon?: string;
}

/**
 * A category of the Desktop settings panel, registered by another package.
 *
 * The panel's own categories are curated (`categories/index.ts`), and that stays true: a category of
 * this desktop's is a folder and one entry there. This type exists for the other case, a package
 * that adds apps to the desktop and has settings of its own for them, which the curated list cannot
 * hold without this repository knowing about that package. To the person using it, a package's
 * setting for its desktop apps is a desktop setting, so it belongs in the desktop's settings panel
 * rather than in a panel of its own.
 *
 * **Public API for other packages; nothing in this repository registers one today.** The Accessories
 * add-on did, for a save folder, until Notepad and Paint moved to asking where on the first save.
 * The extension point was kept deliberately, and is documented in `docs/desktop-apps.md` §6.1; the
 * host's own tests (`settings-modal.test.ts`) register fakes and are what prove it works.
 *
 * What the host owns is the row, the navigation and the heading. What the package owns is the
 * element behind the row, and everything in it, including where its values are stored: the host
 * reads none of them, just as the panel reads no curated category's values either.
 *
 * `element` is resolved with Umbraco's own `createExtensionElement`, so every form an element may
 * take elsewhere in Umbraco works here. `conditions` are Umbraco's too and are honoured, through the
 * same `UmbExtensionsManifestInitializer` the registered apps use: a category whose conditions are
 * unmet has no row.
 */
export interface ManifestUmbraDesktopSettingsCategory
  extends ManifestElement<HTMLElement>,
    ManifestWithDynamicConditions {
  type: 'umbraDesktopSettingsCategory';
  meta: MetaUmbraDesktopSettingsCategory;
  /**
   * Order among the registered categories, following **Umbraco's convention: higher first.**
   * Registered categories sit together after the desktop's own personal categories and before
   * Connections and Site; this orders them among themselves and never moves them past a curated one.
   */
  weight?: number;
}

declare global {
  /**
   * Registers the manifest with Umbraco's type map, which is what makes a
   * `umbraDesktopSettingsCategory` object assignable to `UmbExtensionManifest` and so accepted in
   * another package's `manifests` array, exactly as `app.extension.ts` does for apps.
   */
  interface UmbExtensionManifestMap {
    umbraDesktopSettingsCategory: ManifestUmbraDesktopSettingsCategory;
  }
}
