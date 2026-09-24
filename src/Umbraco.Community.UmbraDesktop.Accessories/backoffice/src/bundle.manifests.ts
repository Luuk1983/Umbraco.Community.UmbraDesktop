import { CALCULATOR_CONTENT_SIZE, CALCULATOR_MIN_CONTENT_SIZE } from './calculator/constants.js';
import { CLOCK_CONTENT_SIZE, CLOCK_MIN_CONTENT_SIZE } from './clock/constants.js';
import { NOTEPAD_CONTENT_SIZE, NOTEPAD_MIN_CONTENT_SIZE } from './notepad/constants.js';
import { SCREENSAVER_WINDOW } from './screensaver/constants.js';
import { PAINT_CONTENT_SIZE, PAINT_MIN_CONTENT_SIZE } from './paint/constants.js';
import { STICKY_NOTES_CONTENT_SIZE, STICKY_NOTES_MIN_CONTENT_SIZE } from './sticky-notes/constants.js';
import { AREA } from './shared/area.js';
import { manifests as localizationManifests } from './localization/manifest.js';

/**
 * The prefix every alias in this package carries. An alias is what pins a favourite, so it is
 * namespaced with the package id and final: renaming one later loses the pin of every user who made
 * one.
 */
const ALIAS = 'Umbraco.Community.UmbraDesktop.Accessories';

/**
 * One accessory's manifest.
 *
 * The accessories differ only in what they are called, where they sort and how big they are, so they are
 * built by one function rather than written out once each. Every field is the Entertainment
 * package's reasoning for Minesweeper, applied to each: `element` and never `js`, because the
 * desktop reads only `element`; an explicit `weight`, because unset is a position rather than an
 * absence; the host's `accessories` group, which this package names and the host owns; sizes that are
 * the app's content box, derived by its own `constants.ts`, with the chrome left to the host; and no
 * `conditions`, because reaching the desktop already takes the Desktop section, and an unmet
 * condition is the one way an app vanishes from the launcher in silence.
 * @param name The app's name, which is also its alias suffix and its dictionary key.
 * @param weight Its place in the group. Higher sorts first, as everywhere in Umbraco.
 * @param icon A native Umbraco icon alias.
 * @param element The lazy loader for its element, which keeps the app out of this bundle's main chunk.
 * @param defaultSize Its content box.
 * @param minSize The smallest content box it works in.
 * @returns The manifest.
 */
function accessory(
  name: string,
  weight: number,
  icon: string,
  element: () => Promise<unknown>,
  defaultSize: { w: number; h: number },
  minSize: { w: number; h: number },
): UmbExtensionManifest {
  return {
    type: 'umbraDesktopApp',
    alias: `${ALIAS}.${name}`,
    name,
    element: element as () => Promise<{ element: CustomElementConstructor }>,
    weight,
    meta: {
      label: `#${AREA}_${name.toLowerCase()}`,
      icon,
      group: 'accessories',
      defaultSize,
      minSize,
      allowMultiple: true,
    },
  };
}

/**
 * The accessories, in the order Windows 98's Accessories menu put the ones it had: the two you
 * make something in first, then the two you look something up in. A hundred apart, as Minesweeper
 * leaves room for Solitaire, so a fifth tool lands between two of these without renumbering.
 */
const apps: Array<UmbExtensionManifest> = [
  accessory(
    'Notepad',
    1000,
    'icon-notepad',
    () => import('./notepad/notepad.element.js'),
    NOTEPAD_CONTENT_SIZE,
    NOTEPAD_MIN_CONTENT_SIZE,
  ),
  accessory('Paint', 900, 'icon-palette', () => import('./paint/paint.element.js'), PAINT_CONTENT_SIZE, PAINT_MIN_CONTENT_SIZE),
  // After the two you make something in, before the two you look something up in: a note is
  // something you write. The only app here with a server behind it (StickyNotes/ in this package).
  accessory(
    'StickyNotes',
    850,
    'icon-post-it',
    () => import('./sticky-notes/sticky-notes.element.js'),
    STICKY_NOTES_CONTENT_SIZE,
    STICKY_NOTES_MIN_CONTENT_SIZE,
  ),
  accessory(
    'Calculator',
    800,
    'icon-calculator',
    () => import('./calculator/calculator.element.js'),
    CALCULATOR_CONTENT_SIZE,
    CALCULATOR_MIN_CONTENT_SIZE,
  ),
  accessory('Clock', 700, 'icon-time', () => import('./clock/clock.element.js'), CLOCK_CONTENT_SIZE, CLOCK_MIN_CONTENT_SIZE),
  // Last, as Windows kept it apart from the tools, under Display. The saver itself runs from the
  // entry point below; this window only chooses and previews it.
  accessory(
    'ScreenSaver',
    600,
    'icon-display',
    () => import('./screensaver/screensaver-panel.element.js'),
    SCREENSAVER_WINDOW.content,
    SCREENSAVER_WINDOW.min,
  ),
];

/**
 * The Accessories category of Desktop settings: where Notepad's and Paint's Save goes, and the
 * screensaver.
 *
 * A `umbraDesktopSettingsCategory`, which the host lists among its own personal settings, so the
 * choice is made where every other desktop setting is made, and the category exists only while this
 * package is installed. No `weight`, because it is this package's only category.
 */
const settingsCategory: UmbExtensionManifest = {
  type: 'umbraDesktopSettingsCategory',
  alias: `${ALIAS}.Settings`,
  name: 'Accessories settings',
  element: () => import('./settings/accessories-settings.element.js'),
  meta: {
    label: `#${AREA}_settingsCategory`,
    description: `#${AREA}_settingsCategoryAbout`,
    icon: 'icon-notepad',
  },
};

/**
 * Starts the screensaver's idle watcher. An entry point because the screensaver has to come on with
 * every window closed, including its own; `screensaver/entrypoint.ts` says why it costs next to
 * nothing while switched off.
 */
const screensaverEntryPoint: UmbExtensionManifest = {
  type: 'backofficeEntryPoint',
  alias: `${ALIAS}.Screensaver`,
  name: 'Accessories screensaver',
  js: () => import('./screensaver/entrypoint.js'),
};

/**
 * The bundle Umbraco loads for this package, and the only entry point it has.
 *
 * `UmbExtensionManifest` is a global type from `@umbraco-cms/backoffice/extension-types`, wired up in
 * tsconfig's `types`. The `umbraDesktopApp` arm of that union is contributed by
 * `umbradesktop-app.d.ts` in this folder, a copy of the Entertainment package's, for the reason given
 * there.
 */
export const manifests: Array<UmbExtensionManifest> = [...apps, settingsCategory, screensaverEntryPoint, ...localizationManifests];
