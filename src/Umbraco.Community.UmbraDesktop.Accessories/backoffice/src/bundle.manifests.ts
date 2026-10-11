import { CALCULATOR_CONTENT_SIZE, CALCULATOR_MIN_CONTENT_SIZE } from './calculator/constants.js';
import { CHARACTER_MAP_CONTENT_SIZE, CHARACTER_MAP_MIN_CONTENT_SIZE } from './character-map/constants.js';
import { CLOCK_CONTENT_SIZE, CLOCK_MIN_CONTENT_SIZE } from './clock/constants.js';
import { DISK_CLEANUP_CONTENT_SIZE, DISK_CLEANUP_MIN_CONTENT_SIZE } from './disk-cleanup/constants.js';
import { NOTEPAD_CONTENT_SIZE, NOTEPAD_MIN_CONTENT_SIZE } from './notepad/constants.js';
import { PAINT_CONTENT_SIZE, PAINT_MIN_CONTENT_SIZE } from './paint/constants.js';
import { SYSTEM_INFO_CONTENT_SIZE, SYSTEM_INFO_MIN_CONTENT_SIZE } from './system-info/constants.js';
import { STICKY_NOTES_CONTENT_SIZE, STICKY_NOTES_MIN_CONTENT_SIZE } from './sticky-notes/constants.js';
import { AREA } from './shared/area.js';
import { ACCESSORIES_PACKAGE_NAME } from './shared/package-settings.js';
import { manifests as localizationManifests } from './localization/manifest.js';

/**
 * The prefix every alias in this package carries. An alias is what pins a favourite, so it is
 * namespaced with the package id and final: renaming one later loses the pin of every user who made
 * one.
 */
const ALIAS = 'Umbraco.Community.UmbraDesktop.Accessories';

/**
 * The Accessories group, defined by the package whose tools fill it, as the Entertainment package
 * defines Games.
 *
 * The host used to reserve `accessories` on this package's behalf. It no longer defines any group
 * that exists only for somebody else's apps (design D10 of
 * `docs/design/2026-09-25-package-catalogues-design.md`), so without this every tool would land
 * under More.
 *
 * This weight is on the launcher's own scale, lower first, unlike the apps' root `weight` below,
 * which is Umbraco's. 55 places Accessories after the host's System (50) and before Entertainment's
 * Games (60), where Windows kept Start > Programs > Accessories: a tool is closer to what an editor
 * came for than a game is. The host publishes its weights for exactly this (design D11).
 *
 * No `entries`: an entry deep-links one of the package's own backoffice screens, and this package has
 * none.
 */
const catalogue: UmbExtensionManifest = {
  type: 'umbraDesktopCatalogue',
  alias: `${ALIAS}.Catalogue`,
  name: 'UmbraDesktop Accessories catalogue',
  meta: {
    groups: [{ alias: 'accessories', label: `#${AREA}_groupAccessories`, weight: 55 }],
  },
};

/**
 * One accessory's manifest.
 *
 * The accessories differ only in what they are called, where they sort and how big they are, so they are
 * built by one function rather than written out once each. Every field is the Entertainment
 * package's reasoning for Minesweeper, applied to each: `element` and never `js`, because the
 * desktop reads only `element`; an explicit `weight`, because unset is a position rather than an
 * absence; the `accessories` group, which this package's catalogue above defines; sizes that are
 * the app's content box, derived by its own `constants.ts`, with the chrome left to the host; and no
 * `conditions`, because reaching the desktop already takes the Desktop section, and an unmet
 * condition is the one way an app vanishes from the launcher in silence.
 *
 * Every window app is built here. The one exception is the Screen Saver tile, written out by hand
 * in `apps` below: it opens Desktop settings rather than a window, so it has no element, sizes or
 * allowMultiple for this function to fill in.
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
 * The accessories, in the order Windows 98's Accessories menu put the ones it had: the ones you
 * make something in first, then the ones you look something up in, then its System Tools. Spaced
 * apart, as Minesweeper leaves room for Solitaire, so a new tool lands between two of these without
 * renumbering. Every entry is built by `accessory()` except the Screen Saver tile, which is written
 * out by hand because it opens Desktop settings instead of a window.
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
  // For writing, like the tools above it: the characters a keyboard does not have.
  accessory(
    'CharacterMap',
    750,
    'icon-omega',
    () => import('./character-map/character-map.element.js'),
    CHARACTER_MAP_CONTENT_SIZE,
    CHARACTER_MAP_MIN_CONTENT_SIZE,
  ),
  accessory('Clock', 700, 'icon-time', () => import('./clock/clock.element.js'), CLOCK_CONTENT_SIZE, CLOCK_MIN_CONTENT_SIZE),
  // Last, as Windows kept it apart from the tools, under Display. Its settings live in Desktop
  // settings now, under this package's row; the tile stays where people know it and opens them there.
  // No element, sizes or allowMultiple: it opens no window.
  {
    type: 'umbraDesktopApp',
    alias: `${ALIAS}.ScreenSaver`,
    name: 'ScreenSaver',
    weight: 600,
    meta: {
      label: `#${AREA}_screensaver`,
      icon: 'icon-display',
      group: 'accessories',
      opensSettings: ACCESSORIES_PACKAGE_NAME,
    },
  } as UmbExtensionManifest,
  // Windows 98's System Tools, last: the two that look after the site rather than make anything.
  // Disk Cleanup empties the recycle bins through Umbraco's own endpoints, so Umbraco decides who
  // may; System Information reads the endpoints Help > System information reads.
  accessory(
    'DiskCleanup',
    500,
    'icon-trash-empty',
    () => import('./disk-cleanup/disk-cleanup.element.js'),
    DISK_CLEANUP_CONTENT_SIZE,
    DISK_CLEANUP_MIN_CONTENT_SIZE,
  ),
  accessory(
    'SystemInfo',
    400,
    'icon-info',
    () => import('./system-info/system-info.element.js'),
    SYSTEM_INFO_CONTENT_SIZE,
    SYSTEM_INFO_MIN_CONTENT_SIZE,
  ),
];

/**
 * The screensaver's settings, as a box under this package's row in Desktop settings. The watcher
 * reads the same settings from the entry point below.
 */
const screensaverSettings: UmbExtensionManifest = {
  type: 'umbraDesktopPackageSettings',
  alias: `${ALIAS}.Settings.Screensaver`,
  name: 'Accessories screensaver settings',
  element: () => import('./screensaver/screensaver-panel.element.js'),
  meta: { package: ACCESSORIES_PACKAGE_NAME, label: `#${AREA}_screensaver` },
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
 * This package's docs, for the desktop's Help app. The build copies `docs/` into this package's own
 * App_Plugins folder (see `vite.config.ts`), and this says where. The public route any add-on uses,
 * as the host's `docs/developer/add-on-help.md` describes it.
 */
const docs: UmbExtensionManifest = {
  type: 'umbraDesktopDocs',
  alias: `${ALIAS}.Docs`,
  name: 'UmbraDesktop Accessories docs',
  meta: { path: '/App_Plugins/Umbraco.Community.UmbraDesktop.Accessories/docs' },
};

/**
 * The bundle Umbraco loads for this package, and the only entry point it has.
 *
 * `UmbExtensionManifest` is a global type from `@umbraco-cms/backoffice/extension-types`, wired up in
 * tsconfig's `types`. The `umbraDesktopApp`, `umbraDesktopCatalogue` and `umbraDesktopDocs` arms of that union are
 * contributed by `umbradesktop-app.d.ts` in this folder, a copy of the Entertainment package's, for
 * the reason given there.
 */
export const manifests: Array<UmbExtensionManifest> = [
  catalogue,
  ...apps,
  screensaverSettings,
  screensaverEntryPoint,
  docs,
  ...localizationManifests,
];
