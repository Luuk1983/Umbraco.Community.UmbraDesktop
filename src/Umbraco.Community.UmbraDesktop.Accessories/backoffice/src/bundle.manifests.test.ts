import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import { CALCULATOR_CONTENT_SIZE, CALCULATOR_MIN_CONTENT_SIZE } from './calculator/constants.js';
import { CHARACTER_MAP_CONTENT_SIZE, CHARACTER_MAP_MIN_CONTENT_SIZE } from './character-map/constants.js';
import { CLOCK_CONTENT_SIZE, CLOCK_MIN_CONTENT_SIZE } from './clock/constants.js';
import { DISK_CLEANUP_CONTENT_SIZE, DISK_CLEANUP_MIN_CONTENT_SIZE } from './disk-cleanup/constants.js';
import { NOTEPAD_CONTENT_SIZE, NOTEPAD_MIN_CONTENT_SIZE } from './notepad/constants.js';
import { PAINT_CONTENT_SIZE, PAINT_MIN_CONTENT_SIZE } from './paint/constants.js';
import { SYSTEM_INFO_CONTENT_SIZE, SYSTEM_INFO_MIN_CONTENT_SIZE } from './system-info/constants.js';
import { STICKY_NOTES_CONTENT_SIZE, STICKY_NOTES_MIN_CONTENT_SIZE } from './sticky-notes/constants.js';
import en from './localization/en.js';
// Loaded here rather than only through the manifest's loader, because it pulls in the backoffice's
// module graph, which takes longer than a test is allowed.
import * as screensaverEntryPoint from './screensaver/entrypoint.js';

/**
 * What the manifests promise the desktop, asserted where it can be read without a desktop. Only the
 * claims that were wrong once somewhere in this repository; the rest of the guide's §2 is the host's
 * to check.
 */

/** A registered app's fields, as far as these tests read them. */
interface App {
  alias: string;
  element?: unknown;
  js?: unknown;
  weight?: number;
  meta: {
    label: string;
    group?: string;
    defaultSize?: unknown;
    minSize?: unknown;
    allowMultiple?: boolean;
    opensSettings?: string;
  };
}

const apps = manifests.filter((manifest) => manifest.type === 'umbraDesktopApp') as unknown as App[];

/**
 * Every window app's name and the sizes its constants derive, in launcher order. The Screen Saver is
 * not here: it opens Desktop settings rather than a window, so it has no sizes.
 */
const EXPECTED = [
  ['Notepad', NOTEPAD_CONTENT_SIZE, NOTEPAD_MIN_CONTENT_SIZE],
  ['Paint', PAINT_CONTENT_SIZE, PAINT_MIN_CONTENT_SIZE],
  ['StickyNotes', STICKY_NOTES_CONTENT_SIZE, STICKY_NOTES_MIN_CONTENT_SIZE],
  ['Calculator', CALCULATOR_CONTENT_SIZE, CALCULATOR_MIN_CONTENT_SIZE],
  ['CharacterMap', CHARACTER_MAP_CONTENT_SIZE, CHARACTER_MAP_MIN_CONTENT_SIZE],
  ['Clock', CLOCK_CONTENT_SIZE, CLOCK_MIN_CONTENT_SIZE],
  ['DiskCleanup', DISK_CLEANUP_CONTENT_SIZE, DISK_CLEANUP_MIN_CONTENT_SIZE],
  ['SystemInfo', SYSTEM_INFO_CONTENT_SIZE, SYSTEM_INFO_MIN_CONTENT_SIZE],
] as const;

it('registers every accessory, in launcher order', () => {
  const byWeight = [...apps].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const order: string[] = EXPECTED.map(([name]) => name);
  order.splice(order.indexOf('Clock') + 1, 0, 'ScreenSaver');
  expect(byWeight.map((app) => app.alias)).to.deep.equal(order.map((name) => `Umbraco.Community.UmbraDesktop.Accessories.${name}`));
});

/** The tile that opens Desktop settings: the one app that is not a window. */
const SCREENSAVER_ALIAS = 'Umbraco.Community.UmbraDesktop.Accessories.ScreenSaver';

/** The apps that open a window, which is every one but the Screen Saver tile. */
const windowApps = apps.filter((app) => app.alias !== SCREENSAVER_ALIAS);

/**
 * `element`, never `js`. `js` is the field every other Umbraco extension uses for this, it
 * type-checks, and the desktop does not read it: an app declared that way is dropped at runtime.
 */
it('declares every window app through a lazy `element` loader', () => {
  for (const app of windowApps) {
    expect(typeof app.element, `${app.alias} element`).to.equal('function');
    expect(app.js, `${app.alias} has no js`).to.equal(undefined);
  }
});

/** Every app sits in the group this package defines below. */
it('puts every app in the accessories group', () => {
  for (const app of apps) expect(app.meta.group, app.alias).to.equal('accessories');
});

/**
 * Every label is a token this package's own dictionary answers, so no tile ever shows a raw
 * `#umbraDesktopAccessories_…` because the dictionary and the manifest drifted apart.
 */
it('names every app with a token the dictionary ships', () => {
  const area = (en as Record<string, Record<string, string>>).umbraDesktopAccessories;
  for (const app of apps) {
    const [, key] = /^#umbraDesktopAccessories_(\w+)$/.exec(app.meta.label) ?? [];
    expect(key, `${app.alias} label is a token in this package's area`).to.not.equal(undefined);
    expect(area[key], `${app.alias} label is in en.ts`).to.be.a('string');
  }
});

/**
 * The sizes are each app's **content** box, pinned to the constants rather than to literals: a
 * manifest that grew a titlebar allowance again would pass a literal check written the same day.
 */
it('asks for each app’s derived content size, leaving the chrome to the host', () => {
  for (const [name, size, min] of EXPECTED) {
    const app = apps.find((candidate) => candidate.alias.endsWith(`.${name}`))!;
    expect(app.meta.defaultSize, `${name} default`).to.deep.equal(size);
    expect(app.meta.minSize, `${name} minimum`).to.deep.equal(min);
  }
});

/** Every other app on the desktop opens as many windows as the user asks for, and so do these. */
it('lets every window app open more than one window', () => {
  for (const app of windowApps) expect(app.meta.allowMultiple, app.alias).to.not.equal(false);
});

/**
 * The screensaver's controls are a box in Desktop settings, under this package's own row, rather
 * than a window of their own. The label is the same token the tile uses, so the box is headed by the
 * name people already know it by.
 */
it('registers the screensaver as a box under the package’s own row in Desktop settings', () => {
  const boxes = manifests.filter((manifest) => manifest.type === 'umbraDesktopPackageSettings') as unknown as Array<{
    alias: string;
    element?: unknown;
    meta: { package: string; label: string };
  }>;
  expect(boxes.map((box) => [box.alias, box.meta.package, box.meta.label])).to.deep.equal([
    ['Umbraco.Community.UmbraDesktop.Accessories.Settings.Screensaver', 'UmbraDesktop Accessories', '#umbraDesktopAccessories_screensaver'],
  ]);
  expect(typeof boxes[0].element).to.equal('function');
});

/** The tile stays where people know it, and opens the settings instead of a window. */
it('keeps the Screen Saver tile, opening Desktop settings instead of a window', () => {
  const tile = apps.find((app) => app.alias.endsWith('.ScreenSaver')) as unknown as {
    element?: unknown;
    meta: { opensSettings?: string };
  };
  expect(tile.meta.opensSettings).to.equal('UmbraDesktop Accessories');
  expect(tile.element).to.equal(undefined);
});

/**
 * The screensaver has to come on with every window closed, including its own, so something outside
 * the windows starts its watcher: a `backofficeEntryPoint`, whose field *is* `js`.
 */
it('starts the screensaver from an entry point', async () => {
  const entry = manifests.find((manifest) => manifest.type === 'backofficeEntryPoint') as unknown as {
    js: () => Promise<Record<string, unknown>>;
  };
  const module = await entry.js();
  expect(module.onInit).to.equal(screensaverEntryPoint.onInit);
  expect([typeof module.onInit, typeof module.onUnload]).to.deep.equal(['function', 'function']);
});

/** The one catalogue this package registers. */
const catalogue = manifests.find((manifest) => manifest.type === 'umbraDesktopCatalogue');

/**
 * The Accessories group is this package's own, label and all, as Games is the Entertainment
 * package's: the host defines neither (package catalogues design D10), so without this every tool
 * lands under More. The bounds are literals because the host's list cannot be imported from here:
 * after its System (50), and before Entertainment's Games (60), where Windows kept Accessories.
 */
it('defines the accessories group itself, after System and before Games', () => {
  const groups =
    (catalogue as { meta?: { groups?: Array<{ alias: string; label: string; weight?: number }> } } | undefined)?.meta
      ?.groups ?? [];
  const accessories = groups.find((group) => group.alias === 'accessories');
  expect(accessories, 'the package must define the group its apps name').to.not.equal(undefined);
  expect(accessories!.label, "a token from this package's own dictionary").to.equal('#umbraDesktopAccessories_groupAccessories');
  expect((en as Record<string, Record<string, string>>).umbraDesktopAccessories.groupAccessories, 'the dictionary answers it').to.be.a('string');
  expect(accessories!.weight).to.be.greaterThan(50);
  expect(accessories!.weight).to.be.lessThan(60);
});

/**
 * The docs reach the desktop's Help app the way any add-on's do (the host's
 * docs/developer/add-on-help.md): one `umbraDesktopDocs` entry naming the folder the build copies
 * them to, inside this package's own App_Plugins folder.
 */
it('registers its docs for the Help app, in its own App_Plugins folder', () => {
  const docs = manifests.filter((manifest) => manifest.type === 'umbraDesktopDocs') as unknown as Array<{ meta: { path: string } }>;
  expect(docs.map((manifest) => manifest.meta.path)).to.deep.equal(['/App_Plugins/Umbraco.Community.UmbraDesktop.Accessories/docs']);
});
