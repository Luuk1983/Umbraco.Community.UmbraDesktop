import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import { OPTIMIZE_CONTENT_SIZE, OPTIMIZE_MIN_CONTENT_SIZE, UMBRADESKTOP_OPTIMIZE_APP } from './optimize/constants.js';

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

/**
 * A service has no tiles: nothing of it shows in the launcher. Its one app, the Optimize images window
 * (#139), opens only when code asks for it with a run's id (D4), as many at once as there are runs (D3),
 * for someone who may use the Media section, whose items it saves.
 */
it('registers no launcher tile and no launcher group', () => {
  const apps = byType('umbraDesktopApp') as Array<{ alias: string; element?: unknown; meta: Record<string, unknown>; conditions?: unknown }>;
  expect(apps.map((app) => app.alias)).to.deep.equal([UMBRADESKTOP_OPTIMIZE_APP]);
  expect(apps[0].element).to.be.a('function');
  expect(apps[0].meta).to.deep.include({
    label: '#umbraDesktopServicesMedia_optimizeImages',
    hideFromLauncher: true,
    allowMultiple: true,
    defaultSize: OPTIMIZE_CONTENT_SIZE,
    minSize: OPTIMIZE_MIN_CONTENT_SIZE,
  });
  expect(apps[0].conditions).to.deep.equal([{ alias: 'Umb.Condition.SectionUserPermission', match: 'Umb.Section.Media' }]);
  expect(byType('umbraDesktopCatalogue')).to.deep.equal([]);
});
