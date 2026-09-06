import type { ManifestUmbraDesktopApp } from './app.extension';
import type { UmbraDesktopRegisteredApp } from './types';
import { UMBRADESKTOP_DEFAULT_ICON } from './constants';

/**
 * Reduce condition-evaluated `umbraDesktopApp` manifests to the shape derivation needs.
 *
 * The `element` value is passed through **by reference and unexamined**. It is Umbraco's
 * `ElementLoaderProperty`, a four-armed union (module path string, loader function, imported module
 * object, bare constructor), and this used to guard on `typeof manifest.element !== 'function'`,
 * which got both interesting arms wrong at once: a path string was dropped silently even though it
 * is the only form a static `umbraco-package.json` can express, and a class constructor was
 * accepted, mislabelled a loader and then *called*, which throws. Telling the arms apart is
 * `loadManifestElement`'s job and it is the only code that should be doing it, so nothing here
 * does.
 *
 * By reference matters as much as unexamined: `umbradesktop-app-host` remounts when `load` changes
 * identity, derivation re-runs on every registry emission, and a wrapper minted here would hand
 * the host a fresh function each time and restart every open game.
 *
 * A manifest with no `element` at all is dropped rather than passed on: it would reach the launcher
 * as a tile that opens a window with nothing in it, which is worse than not being there. That is a
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
    // Falsiness is the whole test, and deliberately not a shape test: every arm of the union is
    // legal, so the only thing that genuinely cannot yield an element is a nullish value or the
    // empty string (a path to nothing). Anything truthy is somebody's intent, and getting it wrong
    // is a failure the app host reports in the window rather than one to guess at here.
    if (!manifest.element) continue;
    apps.push({
      alias: manifest.alias,
      name: manifest.meta?.label ?? manifest.name ?? manifest.alias,
      icon: manifest.meta?.icon ?? UMBRADESKTOP_DEFAULT_ICON,
      element: manifest.element,
      group: manifest.meta?.group,
      // Negated, because the two scales run opposite ways and an author only ever sees one of them.
      // A manifest's root `weight` is Umbraco's, and Umbraco sorts extensions descending
      // (`(b.weight || 0) - (a.weight || 0)` in its own registry), so `weight: 1000` is how you say
      // "first" in every other extension type. The desktop sorts its apps ascending, which the
      // curated catalogue's numbers are written against. Carrying the manifest's number across
      // unchanged therefore put a package that asked to be first dead last in its launcher group,
      // with nothing anywhere to warn them. Inverting here is the one place that costs nobody
      // anything: it happens once, at the boundary, and both meanings stay documented at their own
      // end (see `MetaUmbraDesktopApp` for the author's).
      //
      // Conditional rather than `-(manifest.weight ?? 0)` so an unset weight stays unset and the
      // launcher's own default applies, instead of becoming an explicit `-0` that reads as a choice.
      weight: manifest.weight === undefined ? undefined : -manifest.weight,
      defaultSize: manifest.meta?.defaultSize,
      minSize: manifest.meta?.minSize,
      allowMultiple: manifest.meta?.allowMultiple,
    });
  }
  return apps;
}
