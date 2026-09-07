import { MINESWEEPER_CONTENT_SIZE, MINESWEEPER_MIN_CONTENT_SIZE } from './minesweeper/constants.js';
import { manifests as localizationManifests } from './localization/manifest.js';

/**
 * Minesweeper, as one `umbraDesktopApp` manifest.
 *
 * The first app anything has ever registered on the UmbraDesktop desktop, and the whole reason this
 * package exists: the seam it uses is verified inside the host by tests, but "a *second* package
 * can put an app on the desktop" is a claim only a second package can make.
 *
 * Written against `docs/desktop-apps.md` §2 field by field. Four of them are worth a sentence
 * because each was a defect at some point in the seam's own build:
 *
 * - **`element`, never `js`.** `js` is the field every other Umbraco extension type uses for this,
 *   it type-checks here, and the desktop does not read it: an app declared that way registers
 *   cleanly and is then dropped with one console line. The loader form is what the guide recommends
 *   for a bundled package, and it keeps the game out of this bundle's main chunk.
 * - **`name` is required**, by `ManifestBase` rather than by the desktop, which reads it only as a
 *   window title if `meta.label` is somehow missing at runtime. Omit it and the build fails.
 * - **`weight` is Umbraco's, so higher sorts first.** The desktop's internal scale runs the other
 *   way and is inverted at the boundary, which is not something to compensate for here.
 * - **`alias` is what pins a favourite**, so it is namespaced with the package id and is final:
 *   renaming it later would silently lose the pin of every user who made one.
 *
 * No `conditions`, deliberately. There is nothing to gate: reaching the desktop at all already
 * requires the Desktop section, and an unmet condition is the one way an app can vanish from the
 * launcher in complete silence.
 */
const minesweeper: UmbExtensionManifest = {
  type: 'umbraDesktopApp',
  alias: 'Umbraco.Community.UmbraDesktop.Entertainment.Minesweeper',
  name: 'Minesweeper',
  element: () => import('./minesweeper/minesweeper.element.js'),
  // 1000 rather than 100, with the next game expected at 900: the numbers are a sort key inside one
  // launcher group and nothing reads their magnitude, so leaving a hundred between them means
  // Solitaire can land beside this without renumbering anything. Set explicitly rather than left
  // off, because unset is not "no opinion": the launcher sorts on `weight ?? 0` and zero is a
  // position, which for a registered peer that asked for a weight means last.
  weight: 1000,
  meta: {
    // A token, not a literal, and this package ships the dictionary for it in both locales.
    label: '#umbraDesktopEntertainment_minesweeper',
    // A native Umbraco icon alias. Anything else falls back to icon-box.
    icon: 'icon-bomb',
    // The host owns this group, its label and its localisation; this package owns what goes in it.
    // Nothing in the host puts an app in `games`, which is what lets the two release separately.
    group: 'games',
    // The app's **content** box, derived from the board rather than typed, so it cannot come to
    // disagree with the grid it has to hold. The host adds the active theme's chrome, which is the
    // one part of a window size an app in another package cannot know. See
    // `minesweeper/constants.ts`.
    defaultSize: MINESWEEPER_CONTENT_SIZE,
    minSize: MINESWEEPER_MIN_CONTENT_SIZE,
    // Left at the default, which allows it. This shipped as `false` on the reasoning that a second
    // Minesweeper window is a novelty rather than a feature — but that is an opinion about the
    // game, and every other app on this desktop opens as many windows as the user asks for, so
    // `false` made this the one tile that quietly refocuses the window you already had. Nothing in
    // the game is shared between two instances (every mutable thing is a field on the element, and
    // `rules.ts` is pure), so there is nothing to protect by saying no.
    allowMultiple: true,
  },
};

/**
 * The bundle Umbraco loads for this package, and the only entry point it has.
 *
 * `UmbExtensionManifest` is a global type from `@umbraco-cms/backoffice/extension-types`, wired up
 * in tsconfig's `types`, so there is nothing to import for it. The `umbraDesktopApp` arm of that
 * union is contributed by `umbradesktop-app.d.ts` in this folder, for the reason given there.
 */
export const manifests: Array<UmbExtensionManifest> = [minesweeper, ...localizationManifests];
