import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import en from './localization/en.js';

/** Narrows the bundle to one extension type, so each test reads only what it is about. */
const byType = (type: string) => manifests.filter((m) => m.type === type);

it('provides the Arcade as a desktop context, never a global one', () => {
  expect(byType('umbraDesktopContext').map((m) => m.alias)).to.deep.equal(['Umbraco.Community.UmbraDesktop.Services.Arcade.Context']);
  expect(byType('globalContext')).to.deep.equal([]);
});

it('owns the Games group at the weight it always had', () => {
  const [catalogue] = byType('umbraDesktopCatalogue') as Array<{ meta: { groups: Array<{ alias: string; weight: number }> } }>;
  expect(catalogue.meta.groups).to.deep.equal([{ alias: 'games', label: '#umbraDesktopArcade_groupGames', weight: 60 }]);
});

it('registers the hub in the Games group, gated on there being a game', () => {
  const [hub] = byType('umbraDesktopApp') as Array<{ alias: string; meta: { group: string }; conditions: Array<{ alias: string }>; element: unknown }>;
  expect(hub.alias).to.equal('Umbraco.Community.UmbraDesktop.Services.Arcade.Hub');
  expect(hub.meta.group).to.equal('games');
  expect(hub.conditions).to.deep.equal([{ alias: 'UmbraDesktop.Arcade.Condition.HasGames' }]);
  expect(typeof hub.element).to.equal('function');
});

it('registers the has-games condition and the privacy modal under the aliases the code uses', () => {
  expect(byType('condition').map((m) => m.alias)).to.deep.equal(['UmbraDesktop.Arcade.Condition.HasGames']);
  expect(byType('modal').map((m) => m.alias)).to.deep.equal(['UmbraDesktop.Arcade.Modal.Privacy']);
});

it('registers its docs for the Help app', () => {
  const [docs] = byType('umbraDesktopDocs') as Array<{ alias: string; meta: { path: string } }>;
  expect(docs.alias).to.equal('Umbraco.Community.UmbraDesktop.Services.Arcade.Docs');
  expect(docs.meta.path).to.equal('/App_Plugins/Umbraco.Community.UmbraDesktop.Services.Arcade/docs');
});

it('has every label it points at in the English dictionary', () => {
  const labels = (manifests as Array<{ meta?: { label?: string } }>)
    .map((m) => m.meta?.label)
    .filter((l): l is string => !!l?.startsWith('#'));
  expect(labels.length).to.be.greaterThan(0);
  for (const label of labels) expect(Object.keys(en.umbraDesktopArcade)).to.include(label.split('_')[1]);
});
