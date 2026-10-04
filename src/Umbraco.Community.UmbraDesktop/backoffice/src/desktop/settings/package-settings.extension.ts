import type { ManifestElement, ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';

/**
 * What a `umbraDesktopPackageSettings` manifest carries beyond the extension basics.
 *
 * **These types only ever gain optional fields**, as the catalogue's and the docs' do: packages
 * hand-copy this declaration, and a copy that lags behind must still describe a valid manifest.
 */
export interface MetaUmbraDesktopPackageSettings {
  /**
   * The package's name as people know it, such as `UmbraDesktop Accessories`. Plain text, never a
   * localisation key: it is a proper noun, and it is what manifests are grouped by, so a name that
   * translated differently per language would split one package into two rows (design D4).
   */
  package: string;
  /** The box's heading on the package's screen. A localisation token (`#myPackage_x`) or a literal. */
  label: string;
}

/**
 * One box of a package's settings in Desktop settings (design §3).
 *
 * Every manifest naming the same `meta.package` lands on one row, and each is one box on that row's
 * screen, so a package can never take more than one row however many it registers (design D1). The
 * host draws the row, the screen, the attribution line and the box; the package owns what is inside
 * the box, including where its values are stored.
 *
 * `weight` orders boxes within the package's screen, higher first, Umbraco's convention. It never
 * orders a package against the desktop's own categories, so it is used as Umbraco means it.
 */
export interface ManifestUmbraDesktopPackageSettings
  extends ManifestElement<HTMLElement>,
    ManifestWithDynamicConditions<UmbExtensionConditionConfig> {
  type: 'umbraDesktopPackageSettings';
  meta: MetaUmbraDesktopPackageSettings;
}

declare global {
  /** Registers the manifest with Umbraco's type map, like `umbraDesktopApp`. */
  interface UmbExtensionManifestMap {
    umbraDesktopPackageSettings: ManifestUmbraDesktopPackageSettings;
  }
}
