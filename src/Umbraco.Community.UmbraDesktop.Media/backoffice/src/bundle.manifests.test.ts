import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import { IMAGE_EDITOR_CONTENT_SIZE, IMAGE_EDITOR_MIN_CONTENT_SIZE } from './image-editor/constants.js';
import en from './localization/en.js';

/**
 * What the manifests promise the desktop, asserted where it can be read without a desktop: the
 * claims that were wrong once somewhere in this repository, as Accessories asserts them.
 */

/** A registered app's fields, as far as these tests read them. */
interface App {
  alias: string;
  element?: unknown;
  js?: unknown;
  weight?: number;
  conditions?: unknown;
  meta: {
    label: string;
    icon: string;
    group?: string;
    defaultSize?: unknown;
    minSize?: unknown;
    allowMultiple?: boolean;
  };
}

const apps = manifests.filter((manifest) => manifest.type === 'umbraDesktopApp') as unknown as App[];

/** The dictionary's area, for the label checks. */
const area = (en as Record<string, Record<string, string>>).umbraDesktopMedia;

it('registers the Image Editor under its final alias', () => {
  expect(apps.map((app) => app.alias)).to.deep.equal(['Umbraco.Community.UmbraDesktop.Media.ImageEditor']);
  expect(apps[0].weight).to.equal(1000);
  expect(apps[0].meta.icon).to.equal('icon-picture');
});

/** `element`, never `js`: the desktop reads only `element`, and an app declared with `js` is dropped. */
it('declares the app through a lazy `element` loader', () => {
  expect(typeof apps[0].element).to.equal('function');
  expect(apps[0].js).to.equal(undefined);
});

/** An unmet condition is the one way an app vanishes from the launcher in silence. */
it('sets no conditions', () => {
  expect(apps[0].conditions).to.equal(undefined);
});

it('puts the app in the Media group, which this package defines after System', () => {
  const catalogues = manifests.filter((manifest) => manifest.type === 'umbraDesktopCatalogue') as unknown as Array<{
    meta: { groups: Array<{ alias: string; label: string; weight: number }> };
  }>;
  expect(catalogues).to.have.length(1);
  expect(catalogues[0].meta.groups).to.deep.equal([{ alias: 'media', label: '#umbraDesktopMedia_groupMedia', weight: 52 }]);
  expect(apps[0].meta.group).to.equal('media');
  expect(area.groupMedia).to.be.a('string');
});

it('names the app with a token the dictionary ships', () => {
  const [, key] = /^#umbraDesktopMedia_(\w+)$/.exec(apps[0].meta.label) ?? [];
  expect(key).to.equal('imageEditor');
  expect(area[key]).to.be.a('string');
});

it('asks for its derived content sizes, and opens as many windows as asked', () => {
  expect(apps[0].meta.defaultSize).to.deep.equal(IMAGE_EDITOR_CONTENT_SIZE);
  expect(apps[0].meta.minSize).to.deep.equal(IMAGE_EDITOR_MIN_CONTENT_SIZE);
  expect(apps[0].meta.allowMultiple).to.equal(true);
});

it('registers its docs for the Help app, in its own App_Plugins folder', () => {
  const docs = manifests.filter((manifest) => manifest.type === 'umbraDesktopDocs') as unknown as Array<{ meta: { path: string } }>;
  expect(docs.map((manifest) => manifest.meta.path)).to.deep.equal(['/App_Plugins/Umbraco.Community.UmbraDesktop.Media/docs']);
});

it('registers an English and a Dutch dictionary', () => {
  const dictionaries = manifests.filter((manifest) => manifest.type === 'localization') as unknown as Array<{
    meta: { culture: string };
  }>;
  expect(dictionaries.map((manifest) => manifest.meta.culture).sort()).to.deep.equal(['en', 'nl']);
});
