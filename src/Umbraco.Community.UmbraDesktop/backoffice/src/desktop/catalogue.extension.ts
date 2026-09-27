import type { ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';
import type { UmbraDesktopCatalogueEntry, UmbraDesktopGroup } from './types';

/**
 * A launcher group a package defines in its catalogue.
 *
 * The curated group's shape without `auto`, which marks the desktop's own reserved More group and is
 * nothing a package can ask for. It has a name of its own rather than being `UmbraDesktopGroup`
 * itself, so that a field the curated side grows for its own reasons does not become public contract
 * by default.
 */
export type UmbraDesktopPackageGroup = Omit<UmbraDesktopGroup, 'auto'>;

/**
 * A deep link into one of a package's backoffice screens: today exactly a curated entry's fields,
 * with the same meaning and resolved by the same code. Named separately for the same reason as
 * {@link UmbraDesktopPackageGroup}.
 */
export type UmbraDesktopPackageEntry = UmbraDesktopCatalogueEntry;

/**
 * What a `umbraDesktopCatalogue` manifest carries: a package's own launcher groups and deep links,
 * in the shape of one of the curated fragment files in `catalogue/`.
 *
 * **These types only ever gain optional fields.** Nothing is removed, narrowed or given a new
 * meaning. Consuming packages hand-copy this declaration, and a copy that lags behind still describes
 * a valid manifest, where one that contradicts this file compiles just as cleanly and fails at
 * runtime.
 *
 * Every weight in here sorts **lower first**, on the launcher's own scale, because a package group
 * has to land between ours and a package entry often shares a group with ours. The manifest's root
 * `weight` is Umbraco's, higher first, and only ranks one package's catalogue against another's
 * (design D2).
 */
export interface MetaUmbraDesktopCatalogue {
  /** Launcher groups this package defines. A group with one of our aliases replaces ours. */
  groups?: UmbraDesktopPackageGroup[];
  /** Deep links into this package's screens. An entry with one of our aliases replaces ours. */
  entries?: UmbraDesktopPackageEntry[];
}

/**
 * A package's catalogue, registered as one extension manifest (design D1).
 *
 * Data only, so there is no `element` or `js`, and a static `umbraco-package.json` can carry it as
 * readily as a bundle. `ManifestWithDynamicConditions` brings `conditions`, which switch the whole
 * catalogue on or off, and `overwrites`, which Umbraco applies between catalogue manifests as it does
 * for any extension type.
 */
export interface ManifestUmbraDesktopCatalogue extends ManifestWithDynamicConditions {
  type: 'umbraDesktopCatalogue';
  meta: MetaUmbraDesktopCatalogue;
}

declare global {
  /**
   * Registers the manifest with Umbraco's own type map, the way `app.extension.ts` registers
   * `umbraDesktopApp`, so a package's `manifests` array accepts it without importing this file.
   */
  interface UmbExtensionManifestMap {
    umbraDesktopCatalogue: ManifestUmbraDesktopCatalogue;
  }
}
