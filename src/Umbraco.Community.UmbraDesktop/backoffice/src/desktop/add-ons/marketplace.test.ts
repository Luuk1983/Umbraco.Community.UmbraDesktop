import { expect } from '@open-wc/testing';
import {
  compareVersions,
  fetchMarketplaceAddOns,
  installState,
  isOurs,
  marketplacePageUrl,
  newestVersionFor,
  sortAddOns,
  toAddOn,
  type UmbraDesktopMarketplacePackage,
} from './marketplace.js';

/**
 * A package as the Marketplace's per-package call returns it, cut down to the fields the app reads.
 * The values are the Entertainment add-on's on 2026-10-29.
 * @param overrides What a case changes.
 * @returns The package.
 */
const pkg = (overrides: Partial<UmbraDesktopMarketplacePackage> = {}): UmbraDesktopMarketplacePackage => ({
  packageId: 'Umbraco.Community.UmbraDesktop.Entertainment',
  title: 'UmbraDesktop Entertainment Add-on',
  authors: 'Luuk Peters',
  description: 'Games and media for UmbraDesktop.',
  iconSourceUrl: 'https://api.nuget.org/v3-flatcontainer/umbraco.community.umbradesktop.entertainment/17.4.0/icon',
  iconDominantColor: '#2D508A',
  screenshots: [
    { sourceUrl: 'https://raw.githubusercontent.com/x/games.png', caption: 'All three games.' },
    { sourceUrl: 'https://raw.githubusercontent.com/x/minesweeper.png', caption: 'Minesweeper.' },
  ],
  readMeContent: '<p>Games.</p>',
  umbracoMajorVersionsSupported: [17],
  versionDetails: [{ umbracoVersionNumber: '17.0.0', latestPackageVersionNumber: '17.4.0' }],
  latestVersionNumber: '17.4.0',
  licenseTypes: ['Free'],
  numberOfNuGetDownloads: 865,
  documentationUrl: 'https://github.com/x/docs/games.md',
  issueTrackerUrl: 'https://github.com/x/issues',
  projectUrl: 'https://github.com/x',
  ...overrides,
});

describe('isOurs', () => {
  it('is true for a package under our prefix, whatever its case', () => {
    expect(isOurs('Umbraco.Community.UmbraDesktop.Entertainment')).to.equal(true);
    expect(isOurs('umbraco.community.umbradesktop.accessories')).to.equal(true);
  });

  it('is false for a community package, even one that borrows the name', () => {
    expect(isOurs('Someone.UmbraDesktop.Kanban')).to.equal(false);
    expect(isOurs('Umbraco.Community.UmbraDesktopKanban')).to.equal(false);
  });
});

describe('compareVersions', () => {
  it('orders by number, not by text', () => {
    expect(compareVersions('17.10.0', '17.9.0')).to.be.greaterThan(0);
    expect(compareVersions('17.4.0', '17.4.0')).to.equal(0);
    expect(compareVersions('17.3.1', '17.4.0')).to.be.lessThan(0);
  });

  it('puts a prerelease before its release, and ignores build metadata', () => {
    expect(compareVersions('17.5.0-alpha.0.3', '17.5.0')).to.be.lessThan(0);
    expect(compareVersions('17.5.0-alpha.0.3', '17.4.0')).to.be.greaterThan(0);
    expect(compareVersions('17.4.0+abc123', '17.4.0')).to.equal(0);
  });

  it('reads a missing part as zero', () => {
    expect(compareVersions('17.4', '17.4.0')).to.equal(0);
  });
});

describe('newestVersionFor', () => {
  it('is the newest package version for the site’s major', () => {
    expect(newestVersionFor(pkg(), '17.6.0')).to.equal('17.4.0');
  });

  it('takes the row for the site’s major when a package lists several majors', () => {
    const detail = pkg({
      versionDetails: [
        { umbracoVersionNumber: '16.0.0', latestPackageVersionNumber: '16.9.0' },
        { umbracoVersionNumber: '17.0.0', latestPackageVersionNumber: '17.4.0' },
        { umbracoVersionNumber: '18.0.0', latestPackageVersionNumber: '18.1.0' },
      ],
    });
    expect(newestVersionFor(detail, '17.6.0')).to.equal('17.4.0');
  });

  it('skips a row for a later minor than the site runs, within the same major', () => {
    // A package that needs 17.8 for its newest release must not be pinned to that on a 17.6 site.
    const detail = pkg({
      versionDetails: [
        { umbracoVersionNumber: '17.0.0', latestPackageVersionNumber: '17.2.0' },
        { umbracoVersionNumber: '17.8.0', latestPackageVersionNumber: '17.5.0' },
      ],
    });
    expect(newestVersionFor(detail, '17.6.0')).to.equal('17.2.0');
  });

  it('is undefined when nothing runs on the site’s major', () => {
    expect(newestVersionFor(pkg(), '18.0.0')).to.equal(undefined);
  });
});

describe('toAddOn', () => {
  it('keeps what a card and the details page show', () => {
    const addOn = toAddOn(pkg(), '17.6.0')!;
    expect(addOn.id).to.equal('Umbraco.Community.UmbraDesktop.Entertainment');
    expect(addOn.title).to.equal('UmbraDesktop Entertainment Add-on');
    expect(addOn.authors).to.equal('Luuk Peters');
    expect(addOn.version).to.equal('17.4.0');
    expect(addOn.ours).to.equal(true);
    expect(addOn.downloads).to.equal(865);
    expect(addOn.licence).to.equal('Free');
    expect(addOn.majors).to.deep.equal([17]);
    expect(addOn.links).to.deep.equal({
      marketplace: 'https://marketplace.umbraco.com/package/umbraco.community.umbradesktop.entertainment',
      documentation: 'https://github.com/x/docs/games.md',
      issues: 'https://github.com/x/issues',
    });
  });

  it('keeps the screenshots in file order, so the first one is the cover', () => {
    const addOn = toAddOn(pkg(), '17.6.0')!;
    expect(addOn.screenshots.map((shot) => shot.caption)).to.deep.equal(['All three games.', 'Minesweeper.']);
  });

  it('drops a screenshot or link that is not plain https', () => {
    const addOn = toAddOn(
      pkg({
        screenshots: [
          { sourceUrl: 'javascript:alert(1)', caption: 'bad' },
          { sourceUrl: '/relative.png', caption: 'relative' },
          { sourceUrl: 'https://example.com/ok.png', caption: 'ok' },
        ],
        documentationUrl: 'javascript:alert(1)',
        projectUrl: 'http://example.com',
        iconSourceUrl: 'data:image/png;base64,xx',
      }),
      '17.6.0',
    )!;
    expect(addOn.screenshots.map((shot) => shot.caption)).to.deep.equal(['ok']);
    expect(addOn.links.documentation).to.equal(undefined);
    expect(addOn.icon).to.equal(undefined);
  });

  it('falls back to the project page for documentation, which is where a README-only package keeps it', () => {
    expect(toAddOn(pkg({ documentationUrl: undefined }), '17.6.0')!.links.documentation).to.equal('https://github.com/x');
  });

  it('reads the icon colour with or without its #, and refuses anything that is not a colour', () => {
    expect(toAddOn(pkg({ iconDominantColor: '2D508A' }), '17.6.0')!.color).to.equal('#2D508A');
    expect(toAddOn(pkg({ iconDominantColor: 'red;background:url(x)' }), '17.6.0')!.color).to.equal(undefined);
  });

  it('leaves out a package that does not run on the site’s major', () => {
    expect(toAddOn(pkg({ umbracoMajorVersionsSupported: [16] }), '17.6.0')).to.equal(undefined);
  });

  it('leaves out a package with no version for the site’s major, even when it claims the major', () => {
    expect(toAddOn(pkg({ versionDetails: [] }), '17.6.0')).to.equal(undefined);
  });

  it('keeps every package and its latest version when the site’s version is not known', () => {
    expect(toAddOn(pkg({ umbracoMajorVersionsSupported: [16] }), undefined)!.version).to.equal('17.4.0');
  });

  it('marks a community package as not ours', () => {
    expect(toAddOn(pkg({ packageId: 'Someone.Kanban' }), '17.6.0')!.ours).to.equal(false);
  });
});

describe('marketplacePageUrl', () => {
  it('is the package’s page, by its lowercased id', () => {
    expect(marketplacePageUrl('Someone.Kanban')).to.equal('https://marketplace.umbraco.com/package/someone.kanban');
  });
});

describe('sortAddOns', () => {
  it('puts ours in the order given, then the rest of ours and the community by title', () => {
    const make = (id: string, title: string) => toAddOn(pkg({ packageId: id, title }), '17.6.0')!;
    const sorted = sortAddOns(
      [
        make('Someone.Zebra', 'Zebra'),
        make('Umbraco.Community.UmbraDesktop.Accessories', 'Accessories'),
        make('Someone.Apple', 'Apple'),
        make('Umbraco.Community.UmbraDesktop.Entertainment', 'Entertainment'),
        make('Umbraco.Community.UmbraDesktop.Brand', 'Brand new of ours'),
      ],
      ['Umbraco.Community.UmbraDesktop.Entertainment', 'Umbraco.Community.UmbraDesktop.Accessories'],
    );
    expect(sorted.ours.map((a) => a.title)).to.deep.equal(['Entertainment', 'Accessories', 'Brand new of ours']);
    expect(sorted.community.map((a) => a.title)).to.deep.equal(['Apple', 'Zebra']);
  });
});

describe('installState', () => {
  it('is not installed without an installed version', () => {
    expect(installState(undefined, '17.4.0')).to.equal('not-installed');
  });

  it('is up to date at the newest version, or past it on a prerelease build', () => {
    expect(installState('17.4.0', '17.4.0')).to.equal('installed');
    expect(installState('17.5.0-alpha.0.3', '17.4.0')).to.equal('installed');
  });

  it('has an update when the newest version is later', () => {
    expect(installState('17.3.0', '17.4.0')).to.equal('update');
  });

  it('is installed when there is no newest version to compare with', () => {
    expect(installState('17.3.0', undefined)).to.equal('installed');
  });
});

describe('fetchMarketplaceAddOns', () => {
  /**
   * A fetch that answers from a table of URLs, and records what was asked.
   * @param table JSON bodies by URL; a missing URL answers 404, a thrown value rejects.
   * @returns The fetch and the URLs it was called with.
   */
  function fakeFetch(table: Record<string, unknown>) {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (!(url in table)) return new Response('', { status: 404 });
      const body = table[url];
      if (body instanceof Error) throw body;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    return { fetcher: fetcher as typeof fetch, calls };
  }

  /**
   * One page of the tagged list. The API caps `pageSize` at 50, measured on 2026-10-29: asking for 100 or 500
   * still returns 50.
   * @param page The page number, from 1.
   * @returns The URL.
   */
  const listPage = (page: number) =>
    `https://api.marketplace.umbraco.com/api/v1/packages?tags=umbradesktop&pageSize=50&pageNumber=${page}`;
  const list = listPage(1);
  const detail = (id: string) => `https://api.marketplace.umbraco.com/api/v1/packages/${encodeURIComponent(id)}`;

  it('asks for the tagged list, then each package’s details', async () => {
    const { fetcher, calls } = fakeFetch({
      [list]: { results: [{ packageId: 'A.One' }, { packageId: 'B.Two' }], totalResults: 2 },
      [detail('A.One')]: pkg({ packageId: 'A.One' }),
      [detail('B.Two')]: pkg({ packageId: 'B.Two' }),
    });
    const packages = await fetchMarketplaceAddOns(fetcher);
    expect(packages!.map((p) => p.packageId)).to.deep.equal(['A.One', 'B.Two']);
    expect(calls[0]).to.equal(list);
  });

  it('is undefined when the list cannot be read, so the app knows it is offline', async () => {
    const { fetcher } = fakeFetch({ [list]: new TypeError('Failed to fetch') });
    expect(await fetchMarketplaceAddOns(fetcher)).to.equal(undefined);
  });

  it('is undefined when the list answers with something that is not a list', async () => {
    const { fetcher } = fakeFetch({ [list]: { message: 'nope' } });
    expect(await fetchMarketplaceAddOns(fetcher)).to.equal(undefined);
  });

  it('reads every page of the list when there are more add-ons than fit on one', async () => {
    const ids = Array.from({ length: 52 }, (_, i) => `P.${i}`);
    const table: Record<string, unknown> = {
      [listPage(1)]: { results: ids.slice(0, 50).map((packageId) => ({ packageId })), totalResults: 52 },
      [listPage(2)]: { results: ids.slice(50).map((packageId) => ({ packageId })), totalResults: 52 },
    };
    for (const id of ids) table[detail(id)] = pkg({ packageId: id });
    const { fetcher } = fakeFetch(table);
    const packages = await fetchMarketplaceAddOns(fetcher);
    expect(packages!.length).to.equal(52);
  });

  it('leaves out a package whose details cannot be read, and keeps the rest', async () => {
    const { fetcher } = fakeFetch({
      [list]: { results: [{ packageId: 'A.One' }, { packageId: 'B.Two' }], totalResults: 2 },
      [detail('B.Two')]: pkg({ packageId: 'B.Two' }),
    });
    const packages = await fetchMarketplaceAddOns(fetcher);
    expect(packages!.map((p) => p.packageId)).to.deep.equal(['B.Two']);
  });
});
