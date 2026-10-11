import type { ManifestUmbraDesktopTrayItem } from '../../tray.extension.js';
import { UMBRADESKTOP_TASKBAR_FEATURES } from '../features/index.js';
import { isBoolean, isNonEmptyString, isRecord } from '../../manifest-values.js';

/**
 * A package's tray item, reduced to what the tray and Desktop settings need.
 *
 * Plain data plus the manifest by reference: the manifest is what `createExtensionElement` loads, and
 * passing it through unexamined leaves telling its element forms apart to Umbraco, as
 * `registered-apps.ts` explains for apps. By reference also keeps its identity stable across registry
 * emissions, so the tray can tell an item it already drew from a new one.
 */
export interface UmbraDesktopTrayItem {
  /** The manifest alias. Also the key the user's on/off choice is stored under. */
  alias: string;
  /** The switch's name in Desktop settings, a `#token` or a literal. */
  label: string;
  /** The line under that switch, a `#token` or a literal. */
  description: string;
  /** Whether it is on before the user says otherwise, already defaulted to true when unset. */
  defaultEnabled: boolean;
  /** The manifest, for loading the element. */
  manifest: ManifestUmbraDesktopTrayItem;
}

/** One manifest this pass refused, and why. */
export interface UmbraDesktopDroppedTrayItem {
  /** The manifest alias, or `(no alias)`, so the report can name the package's own item. */
  alias: string;
  /**
   * Why, as a phrase completing "…was dropped because …". A fragment rather than a code for the same
   * reason as `UmbraDesktopDroppedApp.reason`: the knowledge of what was wrong lives here, and the
   * caller only owns delivering it.
   */
  reason: string;
}

/**
 * Validate condition-evaluated tray manifests, which a static `umbraco-package.json` can get wrong in
 * any field. Pure and never throws, like `normaliseRegisteredApps`: one throw during a registry
 * emission would stop the tray updating for everyone on the install. Refusals are returned rather
 * than logged, so the caller decides how to tell the author and this stays testable by calling it.
 *
 * An alias equal to a host feature id is refused, because the two would share one stored switch and
 * turning either off would turn off both. A second item with an alias already seen is refused for the
 * same reason, and the first keeps it: registry order is the only order there is to be fair by.
 *
 * A value that is not an object at all is skipped without a report. The registry never hands one
 * over, and there is no alias to name it by; the check exists only so junk cannot throw.
 * @param manifests The permitted manifests, in registry order.
 * @returns The items kept, in the same order, and the manifests refused.
 */
export function normaliseTrayItems(manifests: ReadonlyArray<ManifestUmbraDesktopTrayItem>): {
  items: UmbraDesktopTrayItem[];
  dropped: UmbraDesktopDroppedTrayItem[];
} {
  const hostIds = new Set(UMBRADESKTOP_TASKBAR_FEATURES.map((feature) => feature.id));
  const seen = new Set<string>();
  const items: UmbraDesktopTrayItem[] = [];
  const dropped: UmbraDesktopDroppedTrayItem[] = [];
  for (const manifest of manifests) {
    if (!isRecord(manifest)) continue;
    const alias = isNonEmptyString(manifest.alias) ? manifest.alias : '(no alias)';
    const meta: Record<string, unknown> = isRecord(manifest.meta) ? manifest.meta : {};
    const label = meta.label;
    const description = meta.description;
    if (!manifest.element) {
      // The `js` hint for the same reason `registered-apps.ts` gives it: `js` is the field an
      // author of any other extension type already has in their fingers, and it type-checks clean.
      dropped.push({
        alias,
        reason: manifest.js
          ? 'it has no "element" to draw: it points at a module through "js", which the desktop does not read. Rename that field to "element"'
          : 'it has no "element" to draw',
      });
    } else if (!isNonEmptyString(label) || !isNonEmptyString(description)) {
      dropped.push({ alias, reason: 'its meta needs both a label and a description for Desktop settings' });
    } else if (hostIds.has(alias)) {
      dropped.push({ alias, reason: `its alias is the id of the desktop's own "${alias}" feature` });
    } else if (seen.has(alias)) {
      dropped.push({ alias, reason: 'another tray item already uses that alias' });
    } else {
      seen.add(alias);
      items.push({
        alias,
        label,
        description,
        defaultEnabled: isBoolean(meta.defaultEnabled) ? meta.defaultEnabled : true,
        manifest,
      });
    }
  }
  return { items, dropped };
}
