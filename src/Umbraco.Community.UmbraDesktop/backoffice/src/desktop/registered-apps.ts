import type { ManifestUmbraDesktopApp } from './app.extension';
import type { UmbraDesktopRegisteredApp } from './types';
import { UMBRADESKTOP_DEFAULT_ICON } from './constants';

/**
 * Reduce condition-evaluated `umbraDesktopApp` manifests to the shape derivation needs.
 *
 * A manifest with no `element` is dropped rather than passed on: it would reach the launcher as a
 * tile that opens a window with nothing in it, which is worse than not being there. That is a
 * package's bug and its own console warning is the wrong place to spend a user's attention, so this
 * is silent.
 * @param manifests The permitted manifests, in registry order.
 * @returns The normalised apps, in the same order.
 */
export function normaliseRegisteredApps(
  manifests: ReadonlyArray<ManifestUmbraDesktopApp>,
): UmbraDesktopRegisteredApp[] {
  const apps: UmbraDesktopRegisteredApp[] = [];
  for (const manifest of manifests) {
    if (typeof manifest.element !== 'function') continue;
    apps.push({
      alias: manifest.alias,
      name: manifest.meta?.label ?? manifest.name ?? manifest.alias,
      icon: manifest.meta?.icon ?? UMBRADESKTOP_DEFAULT_ICON,
      element: manifest.element as () => Promise<unknown>,
      group: manifest.meta?.group,
      weight: manifest.weight,
      defaultSize: manifest.meta?.defaultSize,
      minSize: manifest.meta?.minSize,
      allowMultiple: manifest.meta?.allowMultiple,
    });
  }
  return apps;
}
