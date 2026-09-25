import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import { CALCULATOR_CONTENT_SIZE, CALCULATOR_MIN_CONTENT_SIZE } from './calculator/constants.js';
import { CHARACTER_MAP_CONTENT_SIZE, CHARACTER_MAP_MIN_CONTENT_SIZE } from './character-map/constants.js';
import { CLOCK_CONTENT_SIZE, CLOCK_MIN_CONTENT_SIZE } from './clock/constants.js';
import { DISK_CLEANUP_CONTENT_SIZE, DISK_CLEANUP_MIN_CONTENT_SIZE } from './disk-cleanup/constants.js';
import { NOTEPAD_CONTENT_SIZE, NOTEPAD_MIN_CONTENT_SIZE } from './notepad/constants.js';
import { PAINT_CONTENT_SIZE, PAINT_MIN_CONTENT_SIZE } from './paint/constants.js';
import { SCREENSAVER_WINDOW } from './screensaver/constants.js';
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
  };
}

const apps = manifests.filter((manifest) => manifest.type === 'umbraDesktopApp') as unknown as App[];

/** Each app's name and the sizes its constants derive, in launcher order. */
const EXPECTED = [
  ['Notepad', NOTEPAD_CONTENT_SIZE, NOTEPAD_MIN_CONTENT_SIZE],
  ['Paint', PAINT_CONTENT_SIZE, PAINT_MIN_CONTENT_SIZE],
  ['StickyNotes', STICKY_NOTES_CONTENT_SIZE, STICKY_NOTES_MIN_CONTENT_SIZE],
  ['Calculator', CALCULATOR_CONTENT_SIZE, CALCULATOR_MIN_CONTENT_SIZE],
  ['CharacterMap', CHARACTER_MAP_CONTENT_SIZE, CHARACTER_MAP_MIN_CONTENT_SIZE],
  ['Clock', CLOCK_CONTENT_SIZE, CLOCK_MIN_CONTENT_SIZE],
  ['ScreenSaver', SCREENSAVER_WINDOW.content, SCREENSAVER_WINDOW.min],
  ['DiskCleanup', DISK_CLEANUP_CONTENT_SIZE, DISK_CLEANUP_MIN_CONTENT_SIZE],
  ['SystemInfo', SYSTEM_INFO_CONTENT_SIZE, SYSTEM_INFO_MIN_CONTENT_SIZE],
] as const;

it('registers every accessory, in launcher order', () => {
  const byWeight = [...apps].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  expect(byWeight.map((app) => app.alias)).to.deep.equal(
    EXPECTED.map(([name]) => `Umbraco.Community.UmbraDesktop.Accessories.${name}`),
  );
});

/**
 * `element`, never `js`. `js` is the field every other Umbraco extension uses for this, it
 * type-checks, and the desktop does not read it: an app declared that way is dropped at runtime.
 */
it('declares every app through a lazy `element` loader', () => {
  for (const app of apps) {
    expect(typeof app.element, `${app.alias} element`).to.equal('function');
    expect(app.js, `${app.alias} has no js`).to.equal(undefined);
  }
});

/** The host owns the group; this package only names it. */
it('puts every app in the host’s accessories group', () => {
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
it('lets every app open more than one window', () => {
  for (const app of apps) expect(app.meta.allowMultiple, app.alias).to.not.equal(false);
});

/**
 * No Desktop settings category: this package's one setting, the screensaver, lives in its own window,
 * and Notepad and Paint ask where to save. The host's `umbraDesktopSettingsCategory` extension point
 * stays, for packages that do have settings; `docs/desktop-apps.md` §6.1 documents it.
 */
it('registers no Desktop settings category', () => {
  expect(manifests.filter((manifest) => manifest.type === 'umbraDesktopSettingsCategory')).to.have.length(0);
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
