import type { ManifestUmbraDesktopPackageSettings } from './package-settings.extension';
import { isFiniteNumber, isNonEmptyString, isRecord } from '../manifest-values';

/**
 * The name no package may use: settings under it would read as the desktop's own, which is the
 * one thing the package section exists to rule out (design §3).
 */
const RESERVED_PACKAGE_NAME = 'umbradesktop';

/** One box on a package's screen: one manifest, validated. */
export interface UmbraDesktopSettingsBox {
  /** The manifest alias, which keys the box's element so it loads once. */
  alias: string;
  /** The heading, a `#` token or a literal, localised when drawn. */
  label: string;
  /** Order within the package, higher first; 0 when unset or not a number. */
  weight: number;
  /** The manifest itself, handed to `createExtensionElement` when the box is first shown. */
  manifest: ManifestUmbraDesktopPackageSettings;
}

/** One package's row and screen: its name and its boxes, in the order they are drawn. */
export interface UmbraDesktopSettingsPackage {
  /** The package's name, trimmed. The row's name, the screen's heading, and the deep-link id. */
  name: string;
  /** Its boxes, higher weight first, then by alias. */
  boxes: UmbraDesktopSettingsBox[];
}

/** One thing worth telling a package author, keyed so the panel prints it once. */
export interface UmbraDesktopSettingsReport {
  /** Stable for the same problem with the same manifest. */
  key: string;
  /** The console line. */
  message: string;
}

/**
 * Validate the permitted `umbraDesktopPackageSettings` manifests and group them by package
 * (design D1, §3). **Never throws**: the input is third-party JSON, and a throw here would leave the
 * settings panel without its list.
 *
 * A manifest missing something required is dropped and reported; a bad `weight` is reported and
 * treated as unset. Unknown fields are left alone, so a manifest written for a newer desktop still
 * works on this one.
 * @param manifests The permitted manifests, typed as unknown on purpose.
 * @returns The packages, sorted by name, and the reports.
 */
export function normalisePackageSettings(manifests: ReadonlyArray<unknown>): {
  packages: UmbraDesktopSettingsPackage[];
  reports: UmbraDesktopSettingsReport[];
} {
  const reports: UmbraDesktopSettingsReport[] = [];
  const byName = new Map<string, UmbraDesktopSettingsBox[]>();
  for (const raw of manifests) {
    if (!isRecord(raw)) continue;
    const alias = String(raw.alias);
    /**
     * Records one problem against this manifest, keyed by what was wrong so the panel prints it
     * once however often the registry re-emits.
     */
    const report = (what: string, text: string) =>
      reports.push({
        key: `package-settings:${alias}:${what}`,
        message: `[UmbraDesktop] Package settings "${alias}" ${text}.`,
      });
    const meta = raw.meta;
    if (!isRecord(meta)) {
      report('meta', 'has no "meta" object, so it was dropped');
      continue;
    }
    const name = isNonEmptyString(meta.package) ? meta.package.trim() : '';
    if (!name) {
      report('package', 'has no usable "meta.package", the package name its row is shown under, so it was dropped');
      continue;
    }
    if (name.toLowerCase() === RESERVED_PACKAGE_NAME) {
      report('reserved', 'names its package "UmbraDesktop", which is the desktop\'s own, so it was dropped');
      continue;
    }
    if (!isNonEmptyString(meta.label)) {
      report('label', 'has no usable "meta.label", the heading of its box, so it was dropped');
      continue;
    }
    if (!raw.element) {
      report(
        'element',
        raw.js
          ? 'has no "element" to load: it points at a module through "js", which the desktop does not read. Rename that field to "element"'
          : 'has no "element" to load, so its box would be empty. It was dropped',
      );
      continue;
    }
    let weight = 0;
    if (raw.weight !== undefined) {
      if (isFiniteNumber(raw.weight)) weight = raw.weight;
      else report('weight', 'has a "weight" that is not a number, so it was ignored');
    }
    const boxes = byName.get(name) ?? [];
    boxes.push({ alias, label: meta.label, weight, manifest: raw as unknown as ManifestUmbraDesktopPackageSettings });
    byName.set(name, boxes);
  }
  const packages = [...byName]
    .map(([name, boxes]) => ({
      name,
      boxes: boxes.sort((a, b) => b.weight - a.weight || (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { packages, reports };
}
