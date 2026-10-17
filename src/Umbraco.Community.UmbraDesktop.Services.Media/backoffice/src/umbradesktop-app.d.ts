import type { ManifestApi, ManifestWithDynamicConditions, UmbApi } from '@umbraco-cms/backoffice/extension-api';

/**
 * The two desktop manifest types this package registers, declared here because a consuming package
 * cannot import them. The Arcade's `umbradesktop-app.d.ts` explains why this copy has to exist and
 * what fails without it; this one is cut down to the types this package uses.
 */

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
    /** This package's docs, for the Help app. */
    umbraDesktopDocs: ManifestUmbraDesktopDocs;
    /** This package's desktop-level context. */
    umbraDesktopContext: ManifestUmbraDesktopContext;
  }
}
