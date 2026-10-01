import type { ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';

/**
 * What a `umbraDesktopDocs` manifest carries: where a package's docs folder is served from.
 *
 * **These types only ever gain optional fields**, for the same reason as the catalogue's: consuming
 * packages hand-copy this declaration, and a copy that lags behind must still describe a valid
 * manifest.
 */
export interface MetaUmbraDesktopDocs {
  /**
   * The docs folder's URL path on this site, such as `/App_Plugins/My.Package/docs`: the folder
   * holding the package's `product.json`, `user/` and `developer/`. Must be under `/App_Plugins/`.
   */
  path: string;
}

/**
 * A package's docs, registered for the Help app as one extension manifest (Help design D1, D3).
 *
 * Data only, so a static `umbraco-package.json` can carry it. UmbraDesktop registers its own docs
 * with one of these too, so every product reaches the Help app the same way. `conditions` switch the
 * docs on or off, and `overwrites` apply between docs manifests as for any extension type.
 */
export interface ManifestUmbraDesktopDocs extends ManifestWithDynamicConditions {
  type: 'umbraDesktopDocs';
  meta: MetaUmbraDesktopDocs;
}

declare global {
  /** Registers the manifest with Umbraco's own type map, like `umbraDesktopCatalogue`. */
  interface UmbExtensionManifestMap {
    umbraDesktopDocs: ManifestUmbraDesktopDocs;
  }
}
