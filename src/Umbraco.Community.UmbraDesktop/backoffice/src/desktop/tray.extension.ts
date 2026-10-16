import type { ManifestElement, ManifestWithDynamicConditions } from '@umbraco-cms/backoffice/extension-api';

/**
 * What a `umbraDesktopTrayItem` manifest carries beyond the extension basics.
 *
 * No weight, on purpose (design D14): package items sit in the order they appeared, the way Windows
 * adds a tray icon at the far end when its program starts, so no package can claim a place nearer the
 * clock than one that was there first. The host's own tray features always sit nearer still.
 *
 * `label` and `description` are both required because the item gets a switch under the tray heading
 * in Desktop settings, and a switch with no name, or with a name and no word on what it puts in the
 * tray, is one nobody can decide about.
 */
export interface MetaUmbraDesktopTrayItem {
  /** The switch's name in Desktop settings. A localisation token (`#area_key`) or a literal. */
  label: string;
  /** The line under that switch: what the item puts in the tray. A token or a literal. */
  description: string;
  /**
   * Whether the item is on for a user who has never said otherwise. Defaults to true, the same
   * default every host taskbar feature ships with: an item that arrives switched off is mostly
   * never found.
   */
  defaultEnabled?: boolean;
}

/**
 * An icon in the taskbar's system tray, registered by any package (design §7, D9).
 *
 * The tray is the one region of the taskbar open to packages; the launching end stays curated. The
 * element is drawn in the tray while the user has the item switched on, and sets `hidden` on itself
 * while it has nothing to show, which is also what decides its place (see `taskbar/tray/tray-order.ts`).
 * Its alias is the key its on/off choice is stored under, in the same map as the host's features, so
 * it must never change: a changed alias reads as an item the user has never had an opinion about.
 *
 * Extends `ManifestWithDynamicConditions` so Umbraco's own condition system decides availability,
 * exactly as it does for a `umbraDesktopApp`.
 */
export interface ManifestUmbraDesktopTrayItem extends ManifestElement<HTMLElement>, ManifestWithDynamicConditions {
  type: 'umbraDesktopTrayItem';
  meta: MetaUmbraDesktopTrayItem;
}

declare global {
  /**
   * Registers the manifest with Umbraco's own type map, as `app.extension.ts` does for apps, so a
   * `umbraDesktopTrayItem` object is accepted by `umbExtensionsRegistry` and a package's `manifests`
   * array without every consumer importing this file's type.
   */
  interface UmbExtensionManifestMap {
    umbraDesktopTrayItem: ManifestUmbraDesktopTrayItem;
  }
}
