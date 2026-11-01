import { expect } from '@open-wc/testing';
import { findGuide, installedVersions, loadAddOns, type UmbraDesktopAddOnsSource } from './add-ons-data.js';
import { UMBRADESKTOP_BUILT_IN_ADD_ONS } from './built-in.js';
import type { UmbraDesktopMarketplacePackage } from './marketplace.js';

/**
 * A package from the Marketplace, with only what these cases need.
 * @param packageId Its id.
 * @param majors The majors it runs on.
 * @returns The package.
 */
const pkg = (packageId: string, majors = [17]): UmbraDesktopMarketplacePackage => ({
  packageId,
  title: packageId,
  umbracoMajorVersionsSupported: majors,
  versionDetails: majors.map((major) => ({ umbracoVersionNumber: `${major}.0.0`, latestPackageVersionNumber: `${major}.4.0` })),
});

/**
 * A source answering from fixed values.
 * @param values What each call returns.
 * @returns The source.
 */
const source = (values: {
  marketplace?: UmbraDesktopMarketplacePackage[];
  installed?: Record<string, string>;
  siteVersion?: string;
}): UmbraDesktopAddOnsSource => ({
  marketplace: async () => values.marketplace,
  installed: async () => new Map(Object.entries(values.installed ?? {}).map(([id, version]) => [id.toLowerCase(), version])),
  siteVersion: async () => values.siteVersion,
  guide: async () => undefined,
});

describe('loadAddOns', () => {
  it('lists what the Marketplace has for this site’s major, ours apart from the community’s', async () => {
    const data = await loadAddOns(
      source({
        siteVersion: '17.6.0',
        marketplace: [
          pkg('Someone.Kanban'),
          pkg('Umbraco.Community.UmbraDesktop.Accessories'),
          pkg('Someone.Old', [16]),
          pkg('Umbraco.Community.UmbraDesktop.Entertainment'),
        ],
      }),
    );
    expect(data.online).to.equal(true);
    expect(data.siteMajor).to.equal(17);
    expect(data.ours.map((a) => a.id)).to.deep.equal([
      'Umbraco.Community.UmbraDesktop.Entertainment',
      'Umbraco.Community.UmbraDesktop.Accessories',
    ]);
    expect(data.community.map((a) => a.id)).to.deep.equal(['Someone.Kanban']);
  });

  it('never lists the desktop itself, should it ever carry the tag', async () => {
    const data = await loadAddOns(source({ siteVersion: '17.6.0', marketplace: [pkg('Umbraco.Community.UmbraDesktop')] }));
    expect(data.ours).to.deep.equal([]);
    expect(data.community).to.deep.equal([]);
  });

  it('falls back to the built-in list of ours when the Marketplace cannot be reached', async () => {
    const data = await loadAddOns(source({ siteVersion: '17.6.0', marketplace: undefined }));
    expect(data.online).to.equal(false);
    expect(data.ours.map((a) => a.id)).to.deep.equal(UMBRADESKTOP_BUILT_IN_ADD_ONS.map((a) => a.id));
    expect(data.community).to.deep.equal([]);
    expect(data.ours.every((a) => a.screenshots.length === 0), 'no screenshots offline: covers are icons').to.equal(true);
  });

  it('pins ours offline to the desktop’s own version, since ours are released together with it', async () => {
    const data = await loadAddOns(
      source({ siteVersion: '17.6.0', marketplace: undefined, installed: { 'Umbraco.Community.UmbraDesktop': '17.4.0' } }),
    );
    expect(data.ours.map((a) => a.version)).to.deep.equal(UMBRADESKTOP_BUILT_IN_ADD_ONS.map(() => '17.4.0'));
  });

  it('hands over what this site has installed, by lowercased id', async () => {
    const data = await loadAddOns(
      source({ siteVersion: '17.6.0', marketplace: [], installed: { 'Umbraco.Community.UmbraDesktop.Accessories': '17.3.0' } }),
    );
    expect(data.installed.get('umbraco.community.umbradesktop.accessories')).to.equal('17.3.0');
  });

  it('still lists everything when the site’s version cannot be read', async () => {
    const data = await loadAddOns(source({ siteVersion: undefined, marketplace: [pkg('Someone.Old', [16])] }));
    expect(data.siteMajor).to.equal(undefined);
    expect(data.community.map((a) => a.id)).to.deep.equal(['Someone.Old']);
  });

  it('does not throw when every call fails', async () => {
    const failing: UmbraDesktopAddOnsSource = {
      marketplace: () => Promise.reject(new Error('down')),
      installed: () => Promise.reject(new Error('down')),
      siteVersion: () => Promise.reject(new Error('down')),
      guide: () => Promise.reject(new Error('down')),
    };
    const data = await loadAddOns(failing);
    expect(data.online).to.equal(false);
    expect(data.ours.length).to.equal(UMBRADESKTOP_BUILT_IN_ADD_ONS.length);
  });
});

describe('installedVersions', () => {
  it('maps each package with an id to its version, by lowercased id', () => {
    const map = installedVersions([
      { name: 'UmbraDesktop', id: 'Umbraco.Community.UmbraDesktop', version: '17.4.0', extensions: [] },
      { name: 'No id', version: '1.0.0', extensions: [] },
      { name: 'No version', id: 'Some.Package', extensions: [] },
    ]);
    expect([...map.entries()]).to.deep.equal([['umbraco.community.umbradesktop', '17.4.0']]);
  });
});

describe('findGuide', () => {
  it('is the Help product whose product.json names the package', async () => {
    const files: Record<string, string> = {
      '/App_Plugins/A/docs/product.json': '{"id":"umbradesktop","packageId":"Umbraco.Community.UmbraDesktop"}',
      '/App_Plugins/B/docs/product.json': '{"id":"accessories","packageId":"Umbraco.Community.UmbraDesktop.Accessories"}',
    };
    const read = async (url: string) => files[url];
    const paths = ['/App_Plugins/A/docs', '/App_Plugins/B/docs'];
    expect(await findGuide(paths, read, 'umbraco.community.umbradesktop.accessories')).to.equal('accessories');
    expect(await findGuide(paths, read, 'Someone.Kanban')).to.equal(undefined);
  });

  it('skips a product.json it cannot read or parse', async () => {
    const read = async (url: string) => (url.startsWith('/App_Plugins/A') ? 'not json' : undefined);
    expect(await findGuide(['/App_Plugins/A/docs', '/App_Plugins/B/docs'], read, 'X')).to.equal(undefined);
  });
});
