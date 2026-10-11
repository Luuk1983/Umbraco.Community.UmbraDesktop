import { MINESWEEPER_CONTENT_SIZE, MINESWEEPER_MIN_CONTENT_SIZE } from './minesweeper/constants.js';
import { SNAKE_CONTENT_SIZE, SNAKE_MIN_CONTENT_SIZE } from './snake/constants.js';
import {
  UMBRACOFFEE_APP_ALIAS,
  UMBRACOFFEE_CONTENT_SIZE,
  UMBRACOFFEE_MIN_CONTENT_SIZE,
  UMBRACOFFEE_TRAY_ALIAS,
} from './umbracoffee/constants.js';
import { manifests as localizationManifests } from './localization/manifest.js';

/**
 * The Games and Media groups, defined by the package whose apps fill them.
 *
 * The host used to reserve `games` on this package's behalf, which made it the one group on the
 * desktop that existed only for somebody else's apps. A catalogue manifest lets the package own its
 * heading as well as its games, so the host now knows nothing about games at all (design D10 of
 * `docs/design/2026-09-25-package-catalogues-design.md`).
 *
 * This weight is on the launcher's own scale, lower first, unlike the games' root `weight` below,
 * which is Umbraco's. 60 places Games after the host's System (50) and before its Experimental (70),
 * the slot it always had; the host publishes those weights for exactly this (design D11).
 *
 * Media is 65, after Games and still before Experimental (umbraCoffee design D13). It holds
 * umbraCoffee today, and Winamp and the video player will join it, which is why it is named for
 * what it holds rather than for the one app in it now.
 *
 * No `entries`: an entry deep-links one of the package's own backoffice screens, and this package has
 * none.
 */
const catalogue: UmbExtensionManifest = {
  type: 'umbraDesktopCatalogue',
  alias: 'Umbraco.Community.UmbraDesktop.Entertainment.Catalogue',
  name: 'UmbraDesktop Entertainment catalogue',
  meta: {
    groups: [
      { alias: 'games', label: '#umbraDesktopEntertainment_groupGames', weight: 60 },
      { alias: 'media', label: '#umbraDesktopEntertainment_groupMedia', weight: 65 },
    ],
  },
};

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
  // 1000 rather than 100, with the next game at 900: the numbers are a sort key inside one
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
    // The group this package's catalogue above defines, label and localisation included.
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
    // Fixed, as it was on every Windows up to XP: a 9x9 grid does not reflow, so resizing or
    // maximizing only ever put empty space around it. The window still moves and minimizes.
    resizable: false,
  },
};

/**
 * Snake, the second game, registered exactly the way Minesweeper is.
 *
 * Every field below follows Minesweeper's, for the reasons given there: `element` as a lazy loader,
 * a namespaced `alias` that is final once shipped, sizes that are the content box derived from the
 * board, and multiple windows allowed because every piece of game state lives on the element.
 */
const snake: UmbExtensionManifest = {
  type: 'umbraDesktopApp',
  alias: 'Umbraco.Community.UmbraDesktop.Entertainment.Snake',
  name: 'Snake',
  element: () => import('./snake/snake.element.js'),
  // Just below Minesweeper, which keeps the first game first in the launcher. This is the 900
  // Minesweeper's comment had in mind for Solitaire; a later game can take 800.
  weight: 900,
  meta: {
    label: '#umbraDesktopEntertainment_snake',
    // No snake in Umbraco's icon set, so the generic game icon.
    icon: 'icon-game',
    group: 'games',
    defaultSize: SNAKE_CONTENT_SIZE,
    minSize: SNAKE_MIN_CONTENT_SIZE,
    allowMultiple: true,
    // Fixed for the same reason as Minesweeper: the board is a set number of pixels.
    resizable: false,
  },
};

/**
 * umbraCoffee: the community's monthly live show, watched in a window (umbraCoffee design §6.1).
 *
 * Registered the way the games are, for the reasons Minesweeper's comment gives, with two
 * differences. It is in Media, not Games. And it is resizable, the default, because unlike a board a
 * player and its side panel do reflow: a bigger window is a bigger stream. And it allows one window at a
 * time: a second would play the same stream twice, and with one, the tray cup and the reminder's Watch
 * (both `openApp`) bring the open window to the front instead of stacking a new one on each click.
 */
const umbraCoffee: UmbExtensionManifest = {
  type: 'umbraDesktopApp',
  alias: UMBRACOFFEE_APP_ALIAS,
  name: 'umbraCoffee',
  element: () => import('./umbracoffee/umbracoffee.element.js'),
  // First in its group, on the same scale and with the same spacing as the games.
  weight: 1000,
  meta: {
    label: '#umbraDesktopEntertainment_umbraCoffee',
    // A native Umbraco icon, and for once an exact one.
    icon: 'icon-coffee',
    group: 'media',
    // The content box a 16:9 player and its side panel (Chat and Episodes) need side by side, summed
    // from the layout's own constants; see `umbracoffee/constants.ts`.
    defaultSize: UMBRACOFFEE_CONTENT_SIZE,
    minSize: UMBRACOFFEE_MIN_CONTENT_SIZE,
    // One window: see the comment above.
    allowMultiple: false,
  },
};

/**
 * The coffee cup in the tray, and the reminders it raises (umbraCoffee design §6.2, §6.3).
 *
 * One switch for both, under the tray heading in Desktop settings (design D1, D8), which is why the
 * description names the reminders as well as the cup. `defaultEnabled` is left out because the
 * host's default is on, which is what D1 asks for. The alias is where that switch is stored, so it is
 * final once shipped, like an app's.
 */
const umbraCoffeeTray: UmbExtensionManifest = {
  type: 'umbraDesktopTrayItem',
  alias: UMBRACOFFEE_TRAY_ALIAS,
  name: 'umbraCoffee tray cup',
  element: () => import('./umbracoffee/tray-cup.element.js'),
  meta: {
    label: '#umbraDesktopEntertainment_umbraCoffeeTray',
    description: '#umbraDesktopEntertainment_umbraCoffeeTrayAbout',
  },
};

/**
 * The bundle Umbraco loads for this package, and the only entry point it has.
 *
 * `UmbExtensionManifest` is a global type from `@umbraco-cms/backoffice/extension-types`, wired up
 * in tsconfig's `types`, so there is nothing to import for it. The `umbraDesktopApp`,
 * `umbraDesktopCatalogue` and `umbraDesktopTrayItem` arms of that union are contributed by
 * `umbradesktop-app.d.ts` in this folder, for the reason given there.
 */
export const manifests: Array<UmbExtensionManifest> = [
  catalogue,
  minesweeper,
  snake,
  umbraCoffee,
  umbraCoffeeTray,
  ...localizationManifests,
];
