import { expect } from '@open-wc/testing';
import { backofficePath, normalisePackageCatalogues } from './package-catalogues';
import {
  UMBRADESKTOP_FALLBACK_ALIAS_PREFIX,
  UMBRADESKTOP_MORE_GROUP_ALIAS,
  UMBRADESKTOP_MORE_GROUP_WEIGHT,
  UMBRADESKTOP_SECTION_ALIAS,
  UMBRADESKTOP_SECTION_PATHNAME,
} from './constants';

/**
 * Package catalogues are third-party JSON, and a static `umbraco-package.json` is type-checked by
 * nothing, so these cases hand the validator the kinds of wrong a real package ships (design D9).
 * The origin is fixed rather than the test page's own, so the url cases read the same everywhere.
 */
const ORIGIN = 'https://site.test';

/**
 * Validate one catalogue manifest.
 * @param meta What the manifest's `meta` holds, deliberately untyped.
 * @param over Extra manifest fields, such as `weight`.
 * @returns The one catalogue, every report, and the reports' messages.
 */
function one(meta: unknown, over: Record<string, unknown> = {}) {
  const { catalogues, reports } = normalisePackageCatalogues(
    [{ type: 'umbraDesktopCatalogue', alias: 'Pkg.Catalogue', meta, ...over }],
    ORIGIN,
  );
  return { catalogue: catalogues[0], reports, messages: reports.map((report) => report.message) };
}

it('passes a well-formed catalogue through unchanged', () => {
  const entry = {
    alias: 'Pkg.App',
    ref: 'Pkg.MenuItem',
    section: 'Umb.Section.Settings',
    name: '#pkg_app',
    icon: 'icon-rocket',
    chromeProfile: 'workspace-only',
    defaultSize: { w: 1100, h: 760 },
    minSize: { w: 600, h: 400 },
    allowMultiple: false,
    resizable: true,
    weight: 30,
    group: 'pkg',
    evaluateConditions: ['Pkg.Condition'],
  };
  const group = { alias: 'pkg', label: '#pkg_group', weight: 22 };
  const { catalogue, reports } = one({ groups: [group], entries: [entry] }, { weight: 5 });
  expect(catalogue).to.deep.equal({ manifestAlias: 'Pkg.Catalogue', manifestWeight: 5, groups: [group], entries: [entry] });
  expect(reports).to.deep.equal([]);
});

/**
 * The blocker the review found: one package whose `entries` was an object instead of a list made
 * every recompute throw, which froze the launcher for every user on the install.
 */
it('never throws, whatever a manifest holds, and names every broken one', () => {
  const broken: unknown[] = [
    null,
    42,
    'catalogue',
    [],
    { alias: 'A' },
    { alias: 'B', meta: null },
    { alias: 'C', meta: 'groups' },
    { alias: 'D', meta: { entries: { alias: 'x', ref: 'y' } } },
    { alias: 'E', meta: { groups: 'games' } },
    { alias: 'F', meta: { entries: [null, 7, 'x', [], { alias: 5 }, { alias: '' }] } },
    { alias: 'G', meta: { groups: [null, { alias: 'g' }, { alias: 'h', label: 3 }, { label: 'x' }] } },
  ];
  let result: ReturnType<typeof normalisePackageCatalogues> | undefined;
  expect(() => (result = normalisePackageCatalogues(broken, ORIGIN))).to.not.throw();
  for (const catalogue of result!.catalogues) {
    expect(catalogue.groups, catalogue.manifestAlias).to.deep.equal([]);
    expect(catalogue.entries, catalogue.manifestAlias).to.deep.equal([]);
  }
  for (const alias of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
    expect(
      result!.reports.some((report) => report.message.includes(`"${alias}"`)),
      `a line naming catalogue ${alias}`,
    ).to.equal(true);
  }
});

it('drops a wrongly typed optional field and keeps the entry', () => {
  const { catalogue, messages } = one({
    entries: [
      {
        alias: 'Pkg.App',
        ref: 'Pkg.MenuItem',
        name: '',
        icon: 42,
        chromeProfile: 'sidebarless',
        defaultSize: { w: 'wide', h: 10 },
        minSize: { w: -1, h: 10 },
        allowMultiple: 'yes',
        resizable: 1,
        weight: '30',
        group: ['pkg'],
        evaluateConditions: 'Pkg.Condition',
      },
    ],
  });
  expect(catalogue.entries).to.deep.equal([{ alias: 'Pkg.App', ref: 'Pkg.MenuItem' }]);
  for (const field of ['name', 'icon', 'chromeProfile', 'defaultSize', 'minSize', 'allowMultiple', 'resizable', 'weight', 'group', 'evaluateConditions']) {
    expect(messages.some((message) => message.includes(`"${field}"`)), field).to.equal(true);
  }
});

describe('a package url', () => {
  it('is kept, as a same-origin path, when it is a backoffice screen on this site', () => {
    expect(backofficePath('/umbraco/section/settings/workspace/pkg-root', ORIGIN)).to.equal(
      '/umbraco/section/settings/workspace/pkg-root',
    );
    expect(backofficePath(`${ORIGIN}/umbraco/section/content?x=1#y`, ORIGIN)).to.equal('/umbraco/section/content?x=1#y');
  });

  it('is refused anywhere a window must not go', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'https://evil.test/umbraco/section/content',
      '//evil.test/umbraco/section/content',
      '/\\evil.test/umbraco/section/content',
      '/umbraco/management/api/v1/server/status',
      '/umbraco/login',
      '/umbraco/section/../management/api/v1/server/status',
      '/',
      'not a url at all ::',
    ]) {
      expect(backofficePath(url, ORIGIN), url).to.equal(undefined);
    }
  });

  it('costs the entry its only destination, and says what a url must be', () => {
    const { catalogue, messages } = one({
      entries: [{ alias: 'Pkg.Evil', url: 'javascript:alert(1)', section: 'Umb.Section.Settings' }],
    });
    expect(catalogue.entries).to.deep.equal([]);
    expect(messages.some((message) => message.includes('"Pkg.Evil"') && message.includes('/umbraco/section/'))).to.equal(true);
  });
});

it('refuses an entry that would open the desktop inside a desktop window', () => {
  const { catalogue, messages } = one({
    entries: [
      { alias: 'Pkg.A', ref: UMBRADESKTOP_SECTION_ALIAS },
      { alias: 'Pkg.B', ref: 'Pkg.Dashboard', section: UMBRADESKTOP_SECTION_ALIAS },
      { alias: 'Pkg.C', url: `/umbraco/section/${UMBRADESKTOP_SECTION_PATHNAME}`, section: 'Umb.Section.Settings' },
    ],
  });
  expect(catalogue.entries).to.deep.equal([]);
  expect(messages.filter((message) => message.includes('desktop inside'))).to.have.lengthOf(3);
});

it('reserves the fallback alias prefix', () => {
  const { catalogue, messages } = one({
    entries: [{ alias: `${UMBRADESKTOP_FALLBACK_ALIAS_PREFIX}Pkg.Section`, ref: 'Pkg.Section' }],
  });
  expect(catalogue.entries).to.deep.equal([]);
  expect(messages.some((message) => message.includes('reserved'))).to.equal(true);
});

/** Design D2: a number that only makes sense on Umbraco's higher-first scale, in a lower-first field. */
it("keeps a weight that looks like Umbraco's scale, and says so", () => {
  const { catalogue, messages } = one({
    groups: [{ alias: 'pkg', label: '#pkg', weight: 1000 }],
    entries: [{ alias: 'Pkg.App', ref: 'Pkg.Section', weight: 1000 }],
  });
  expect(catalogue.groups[0].weight).to.equal(1000);
  expect(catalogue.entries[0].weight).to.equal(1000);
  expect(messages.filter((message) => message.includes('lower first'))).to.have.lengthOf(2);
});

it('places a group weighted past More just before it', () => {
  const { catalogue, messages } = one({
    groups: [{ alias: 'pkg', label: '#pkg', weight: UMBRADESKTOP_MORE_GROUP_WEIGHT + 1 }],
  });
  expect(catalogue.groups[0].weight).to.equal(UMBRADESKTOP_MORE_GROUP_WEIGHT - 1);
  expect(messages.some((message) => message.includes('before More'))).to.equal(true);
});

it('keeps a group with no weight, and says it will sort first', () => {
  const { catalogue, messages } = one({ groups: [{ alias: 'pkg', label: '#pkg' }] });
  expect(catalogue.groups).to.deep.equal([{ alias: 'pkg', label: '#pkg' }]);
  expect(messages.some((message) => message.includes('"weight"'))).to.equal(true);
});

it('refuses the reserved More alias, and a group with no label', () => {
  const { catalogue, messages } = one({
    groups: [
      { alias: UMBRADESKTOP_MORE_GROUP_ALIAS, label: '#mine', weight: 5 },
      { alias: 'pkg', weight: 5 },
    ],
  });
  expect(catalogue.groups).to.deep.equal([]);
  expect(messages).to.have.lengthOf(2);
});

it('does not carry auto onto a package group', () => {
  const { catalogue, reports } = one({ groups: [{ alias: 'pkg', label: '#pkg', weight: 22, auto: true }] });
  expect(catalogue.groups).to.deep.equal([{ alias: 'pkg', label: '#pkg', weight: 22 }]);
  expect(reports).to.deep.equal([]);
});

it('uses the first of two definitions of one alias in one catalogue', () => {
  const { catalogue, messages } = one({
    entries: [
      { alias: 'Pkg.App', ref: 'Pkg.First' },
      { alias: 'Pkg.App', ref: 'Pkg.Second' },
    ],
  });
  expect(catalogue.entries).to.deep.equal([{ alias: 'Pkg.App', ref: 'Pkg.First' }]);
  expect(messages.some((message) => message.includes('twice'))).to.equal(true);
});

it('warns about a url entry that also asks for conditions it can never evaluate', () => {
  const { catalogue, messages } = one({
    entries: [
      {
        alias: 'Pkg.App',
        url: '/umbraco/section/settings/workspace/pkg-root',
        section: 'Umb.Section.Settings',
        evaluateConditions: ['Pkg.Condition'],
      },
    ],
  });
  expect(catalogue.entries).to.have.lengthOf(1);
  expect(messages.some((message) => message.includes('"evaluateConditions"'))).to.equal(true);
});

it('reads the manifest weight, and treats anything else as zero', () => {
  expect(one({}, { weight: 7 }).catalogue.manifestWeight).to.equal(7);
  expect(one({}, { weight: 'high' }).catalogue.manifestWeight).to.equal(0);
});

/**
 * `conditions` is the field an Umbraco author reaches for first, and a catalogue entry does not read
 * it (design D12). Dropping it silently would show the tile ungated, the wrong direction to fail in,
 * so the console says what to use instead. Found by the branch review.
 */
it('says so when an entry carries conditions, which a catalogue entry does not read', () => {
  const { catalogue, messages } = one({
    entries: [{ alias: 'Pkg.App', ref: 'Pkg.Section', conditions: [{ alias: 'Pkg.Condition' }] }],
  });
  expect(catalogue.entries).to.deep.equal([{ alias: 'Pkg.App', ref: 'Pkg.Section' }]);
  expect(messages.some((message) => message.includes('"conditions"') && message.includes('"evaluateConditions"'))).to.equal(true);
});
