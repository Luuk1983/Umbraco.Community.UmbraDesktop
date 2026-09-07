import type { ManifestUmbraDesktopApp } from './app.extension';
import type { UmbraDesktopRegisteredApp } from './types';
import { UMBRADESKTOP_DEFAULT_ICON } from './constants';

/** One manifest this pass refused, and what was wrong with it. */
export interface UmbraDesktopDroppedApp {
  /** The manifest alias, so the report can name the package's own app. */
  alias: string;
  /**
   * Why it was dropped, as a phrase that completes "…was dropped because …".
   *
   * A sentence fragment rather than a code, because the knowledge of what was wrong lives here and
   * nowhere else, and a code would only mean the caller had to hold a table of these strings to
   * turn back into this sentence. The caller owns *delivery* (which console, deduplicated how, held
   * behind which quiet window), not wording.
   */
  reason: string;
}

/** What {@link normaliseRegisteredApps} produces: the apps it kept, and what it refused. */
export interface UmbraDesktopNormalisedApps {
  /** The normalised apps, in registry order. */
  apps: UmbraDesktopRegisteredApp[];
  /** The manifests that yielded no app, for the caller to report. */
  dropped: UmbraDesktopDroppedApp[];
}

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
 * package's bug, and it used to be dropped in silence on the grounds that it is not worth a user's
 * attention. True, and beside the point: the person it *is* worth something to is the author, whose
 * app simply never appears with nothing anywhere saying the desktop saw the manifest and refused
 * it. So the drop is now reported alongside the apps and the caller turns it into a dev-facing
 * diagnostic. Reported rather than logged, because this function is pure and worth keeping that
 * way: it is the piece that can be tested by calling it, and a `console` in here would make every
 * caller's test a test of the console too.
 *
 * That reason is worded two ways, and the second one exists because of `js`. `ManifestElement`
 * declares `js?` next to `element?`, Umbraco's own `createExtensionElement` resolves
 * `manifest.element ?? manifest.js`, and `js` is therefore the field an author who has ever shipped
 * a dashboard, a property editor or a modal already has in their fingers. Written here it
 * type-checks clean and then does nothing, because this seam resolves `element` and only `element`.
 * A manifest like that is not a missing module, it is a misnamed field, and told "no element to
 * load" the author goes and checks the path they can plainly see is right. So when a dropped
 * manifest carries a `js`, the reason says which field was ignored and what to rename it to.
 *
 * Whether the desktop *should* resolve `js` too is a live question and deliberately not answered
 * here: it would mean adopting a slice of Umbraco's element-loading surface into this contract, and
 * the same argument then applies to `elementName` and `kind`. Naming the field costs nothing and
 * settles nothing, which is the right size for a diagnostic.
 * @param manifests The permitted manifests, in registry order.
 * @returns The normalised apps in the same order, plus every manifest that yielded none.
 */
export function normaliseRegisteredApps(
  manifests: ReadonlyArray<ManifestUmbraDesktopApp>,
): UmbraDesktopNormalisedApps {
  const apps: UmbraDesktopRegisteredApp[] = [];
  const dropped: UmbraDesktopDroppedApp[] = [];
  for (const manifest of manifests) {
    // Falsiness is the whole test, and deliberately not a shape test: every arm of the union is
    // legal, so the only thing that genuinely cannot yield an element is a nullish value or the
    // empty string (a path to nothing). Anything truthy is somebody's intent, and getting it wrong
    // is a failure the app host reports in the window rather than one to guess at here.
    if (!manifest.element) {
      dropped.push({
        alias: manifest.alias,
        reason: manifest.js
          ? 'its manifest has no "element" to load: it points at a module through "js", which the desktop does not read. Rename that field to "element"'
          : 'its manifest has no "element" to load, so its window would open empty',
      });
      continue;
    }
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
  return { apps, dropped };
}
