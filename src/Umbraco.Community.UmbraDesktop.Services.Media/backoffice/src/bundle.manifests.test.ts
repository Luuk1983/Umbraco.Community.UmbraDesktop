import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';

/** Narrows the bundle to one extension type, so each test reads only what it is about. */
const byType = (type: string) => manifests.filter((m) => m.type === type);

it('provides the media service as a desktop context, never a global one', () => {
  expect(byType('umbraDesktopContext').map((m) => m.alias)).to.deep.equal(['Umbraco.Community.UmbraDesktop.Services.Media.Context']);
  expect(byType('globalContext')).to.deep.equal([]);
});

it('registers its docs for the Help app', () => {
  const [docs] = byType('umbraDesktopDocs') as Array<{ alias: string; meta: { path: string } }>;
  expect(docs.alias).to.equal('Umbraco.Community.UmbraDesktop.Services.Media.Docs');
  expect(docs.meta.path).to.equal('/App_Plugins/Umbraco.Community.UmbraDesktop.Services.Media/docs');
});

it('registers its dictionaries in English and Dutch', () => {
  expect(byType('localization').map((m) => (m as { meta: { culture: string } }).meta.culture)).to.deep.equal(['en', 'nl']);
});

/** A service has no tiles: nothing of it shows in the launcher. */
it('registers no app and no launcher group', () => {
  expect(byType('umbraDesktopApp')).to.deep.equal([]);
  expect(byType('umbraDesktopCatalogue')).to.deep.equal([]);
});
