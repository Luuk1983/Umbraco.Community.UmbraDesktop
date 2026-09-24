import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import { CALCULATOR_CONTENT_SIZE, CALCULATOR_MIN_CONTENT_SIZE } from './calculator/constants.js';
import { CLOCK_CONTENT_SIZE, CLOCK_MIN_CONTENT_SIZE } from './clock/constants.js';
import { NOTEPAD_CONTENT_SIZE, NOTEPAD_MIN_CONTENT_SIZE } from './notepad/constants.js';
import { PAINT_CONTENT_SIZE, PAINT_MIN_CONTENT_SIZE } from './paint/constants.js';
import en from './localization/en.js';

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
  ['Calculator', CALCULATOR_CONTENT_SIZE, CALCULATOR_MIN_CONTENT_SIZE],
  ['Clock', CLOCK_CONTENT_SIZE, CLOCK_MIN_CONTENT_SIZE],
] as const;

it('registers the four accessories, in launcher order', () => {
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
