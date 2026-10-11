import { expect } from '@open-wc/testing';
import { normaliseTrayItems } from './tray-items.js';
import type { ManifestUmbraDesktopTrayItem } from '../../tray.extension.js';

/**
 * A valid tray manifest, with any field overridden. The element is never loaded here, so any truthy
 * loader will do.
 * @param over The fields to replace.
 * @returns The manifest.
 */
const valid = (over: Partial<ManifestUmbraDesktopTrayItem> = {}): ManifestUmbraDesktopTrayItem => ({
  type: 'umbraDesktopTrayItem',
  alias: 'My.Tray',
  name: 'My tray',
  element: () => Promise.resolve({} as never),
  meta: { label: '#my_label', description: '#my_about' },
  ...over,
});

it('keeps a valid item, defaulting it on', () => {
  const { items, dropped } = normaliseTrayItems([valid()]);
  expect(dropped).to.deep.equal([]);
  expect(items).to.have.length(1);
  expect(items[0].alias).to.equal('My.Tray');
  expect(items[0].label).to.equal('#my_label');
  expect(items[0].description).to.equal('#my_about');
  expect(items[0].defaultEnabled).to.equal(true);
});

it('passes the manifest through by reference, for loading the element', () => {
  const manifest = valid();
  expect(normaliseTrayItems([manifest]).items[0].manifest).to.equal(manifest);
});

it('honours defaultEnabled: false', () => {
  const { items } = normaliseTrayItems([valid({ meta: { label: 'L', description: 'D', defaultEnabled: false } })]);
  expect(items[0].defaultEnabled).to.equal(false);
});

it('drops an item with no element, saying why', () => {
  const { items, dropped } = normaliseTrayItems([valid({ element: undefined })]);
  expect(items).to.deep.equal([]);
  expect(dropped[0].alias).to.equal('My.Tray');
  expect(dropped[0].reason).to.contain('element');
  // No speculative advice about a field the author never wrote.
  expect(dropped[0].reason).to.not.contain('"js"');
});

/**
 * `js` is the field an author of any other extension type reaches for, and it type-checks clean, so
 * the reason names it and the field to rename it to, as `registered-apps.ts` does for apps.
 */
it('names "js" in the reason when an item without an element carries one', () => {
  const { dropped } = normaliseTrayItems([valid({ element: undefined, js: '/x.js' })]);
  expect(dropped).to.have.length(1);
  expect(dropped[0].reason, 'the field the author actually wrote must be named').to.contain('"js"');
  expect(dropped[0].reason, 'and the field they should have written').to.contain('"element"');
});

it('drops an item without a label or description', () => {
  const noLabel = valid({ meta: { description: 'D' } as never });
  const noAbout = valid({ alias: 'B', meta: { label: 'L' } as never });
  const { items, dropped } = normaliseTrayItems([noLabel, noAbout]);
  expect(items).to.deep.equal([]);
  expect(dropped.map((entry) => entry.alias)).to.deep.equal(['My.Tray', 'B']);
});

it('drops an item whose alias is a host feature id, which would share its stored switch', () => {
  const { items, dropped } = normaliseTrayItems([valid({ alias: 'fullscreen' })]);
  expect(items).to.deep.equal([]);
  expect(dropped[0].reason).to.contain('fullscreen');
});

it('keeps the first of two items with one alias', () => {
  const { items, dropped } = normaliseTrayItems([valid(), valid({ name: 'Second' })]);
  expect(items).to.have.length(1);
  expect(items[0].manifest.name).to.equal('My tray');
  expect(dropped).to.have.length(1);
});

it('keeps registry order', () => {
  const { items } = normaliseTrayItems([valid({ alias: 'B' }), valid({ alias: 'A' })]);
  expect(items.map((item) => item.alias)).to.deep.equal(['B', 'A']);
});

it('never throws on junk', () => {
  expect(() => normaliseTrayItems([null as never, { meta: 5 } as never])).to.not.throw();
});
