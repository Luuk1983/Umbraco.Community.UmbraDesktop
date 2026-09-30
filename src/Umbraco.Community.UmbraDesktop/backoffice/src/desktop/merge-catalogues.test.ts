import { expect } from '@open-wc/testing';
import { mergeCatalogues, type UmbraDesktopAppClaim } from './merge-catalogues';
import type { UmbraDesktopPackageCatalogue } from './package-catalogues';
import type { UmbraDesktopCatalogue } from './types';

/** A two-group, two-entry stand-in for the curated catalogue, one entry a core section. */
const CURATED: UmbraDesktopCatalogue = {
  groups: [
    { alias: 'editing', label: '#editing', weight: 10 },
    { alias: 'system', label: '#system', weight: 50 },
  ],
  entries: [
    { alias: 'content', ref: 'Umb.Section.Content', group: 'editing', weight: 10 },
    { alias: 'usync', ref: 'usync.menu.item', section: 'Umb.Section.Settings', group: 'system', weight: 10 },
  ],
  excludedSections: ['Umbraco.Community.UmbraDesktop.Section'],
};

/**
 * A validated package catalogue.
 * @param manifestAlias Its manifest alias.
 * @param over What it defines, and its weight.
 * @returns The catalogue.
 */
function pkg(manifestAlias: string, over: Partial<UmbraDesktopPackageCatalogue> = {}): UmbraDesktopPackageCatalogue {
  return { manifestAlias, manifestWeight: 0, groups: [], entries: [], ...over };
}

/**
 * Merge against {@link CURATED}.
 * @param packages The package catalogues.
 * @param apps Registered apps' claims.
 * @returns The merge's answer.
 */
const merge = (packages: UmbraDesktopPackageCatalogue[] = [], apps: UmbraDesktopAppClaim[] = []) =>
  mergeCatalogues({ curated: CURATED, packages, apps });

it('leaves the curated catalogue alone when no package defines anything', () => {
  const merged = merge();
  expect(merged.catalogue).to.deep.equal(CURATED);
  expect(merged.reports).to.deep.equal([]);
  expect([...merged.entrySources]).to.deep.equal([]);
  expect([...merged.droppedApps]).to.deep.equal([]);
});

it("adds a package's groups and entries after ours, and remembers where each entry came from", () => {
  const merged = merge([
    pkg('Pkg.Catalogue', {
      groups: [{ alias: 'pkg', label: '#pkg', weight: 22 }],
      entries: [{ alias: 'Pkg.App', ref: 'Pkg.Section', group: 'pkg' }],
    }),
  ]);
  expect(merged.catalogue.groups.map((group) => group.alias)).to.deep.equal(['editing', 'system', 'pkg']);
  expect(merged.catalogue.entries.map((entry) => entry.alias)).to.deep.equal(['content', 'usync', 'Pkg.App']);
  expect(merged.entrySources.get('Pkg.App')).to.equal('Pkg.Catalogue');
  expect(merged.reports).to.deep.equal([]);
});

describe('replacing one of ours', () => {
  it('uses the package entry in our entry\'s place, silently when it opens the same screen', () => {
    const replacement = { alias: 'usync', ref: 'usync.menu.item', section: 'Umb.Section.Settings', chromeProfile: 'bare' as const };
    const merged = merge([pkg('Pkg.Catalogue', { entries: [replacement] })]);
    expect(merged.catalogue.entries).to.deep.equal([CURATED.entries[0], replacement]);
    expect(merged.entrySources.get('usync')).to.equal('Pkg.Catalogue');
    expect(merged.reports).to.deep.equal([]);
  });

  /** Design D13: our aliases are bare words, so a takeover that changes the target is often a mistake. */
  it('reports a replacement that opens something else', () => {
    const merged = merge([pkg('Pkg.Catalogue', { entries: [{ alias: 'usync', ref: 'Pkg.Dashboard' }] })]);
    expect(merged.catalogue.entries[1].ref).to.equal('Pkg.Dashboard');
    expect(merged.reports).to.have.lengthOf(1);
    expect(merged.reports[0].message).to.contain('replaces the desktop\'s own app "usync"');
  });

  it('uses a package group in our group\'s place, silently when it keeps the weight', () => {
    const merged = merge([pkg('Pkg.Catalogue', { groups: [{ alias: 'system', label: '#pkg_system', weight: 50 }] })]);
    expect(merged.catalogue.groups[1]).to.deep.equal({ alias: 'system', label: '#pkg_system', weight: 50 });
    expect(merged.reports).to.deep.equal([]);
  });

  it('reports a package group that moves one of ours', () => {
    const merged = merge([pkg('Pkg.Catalogue', { groups: [{ alias: 'system', label: '#system', weight: 5 }] })]);
    expect(merged.reports).to.have.lengthOf(1);
    expect(merged.reports[0].message).to.contain('"system"');
  });

  /** Design D4: an app takes over a curated alias, and that is never like-for-like. */
  it('lets a registered app take a curated alias, and says so', () => {
    const merged = merge([], [{ alias: 'usync', manifestWeight: 0 }]);
    expect(merged.catalogue.entries.map((entry) => entry.alias)).to.deep.equal(['content']);
    expect([...merged.droppedApps]).to.deep.equal([]);
    expect(merged.reports).to.have.lengthOf(1);
    expect(merged.reports[0].message).to.contain('a self-contained app');
  });
});

describe('two packages defining one alias', () => {
  it('uses the higher manifest weight, and names both', () => {
    const merged = merge([
      pkg('Pkg.Low', { manifestWeight: 1, entries: [{ alias: 'Shared.App', ref: 'Pkg.Low.Section' }] }),
      pkg('Pkg.High', { manifestWeight: 9, entries: [{ alias: 'Shared.App', ref: 'Pkg.High.Section' }] }),
    ]);
    expect(merged.catalogue.entries.find((entry) => entry.alias === 'Shared.App')!.ref).to.equal('Pkg.High.Section');
    expect(merged.reports).to.have.lengthOf(1);
    expect(merged.reports[0].message).to.contain('"Pkg.High"').and.to.contain('"Pkg.Low"');
  });

  /**
   * Ordinal, not `localeCompare` (design D6). An upper-case letter sorts before every lower-case one
   * ordinally, and after it in most locales, so this pair settles the same way in every browser only
   * because the comparison is `<`.
   */
  it('settles a weight tie by manifest alias, compared ordinally', () => {
    const merged = merge([
      pkg('a.Pkg', { entries: [{ alias: 'Shared.App', ref: 'From.a' }] }),
      pkg('B.Pkg', { entries: [{ alias: 'Shared.App', ref: 'From.B' }] }),
    ]);
    expect(merged.catalogue.entries.find((entry) => entry.alias === 'Shared.App')!.ref).to.equal('From.B');
  });

  it('says nothing when the two agree', () => {
    const merged = merge([
      pkg('Pkg.One', { entries: [{ alias: 'Shared.App', ref: 'Shared.Section' }], groups: [{ alias: 'shared', label: '#one', weight: 30 }] }),
      pkg('Pkg.Two', { entries: [{ alias: 'Shared.App', ref: 'Shared.Section' }], groups: [{ alias: 'shared', label: '#two', weight: 30 }] }),
    ]);
    expect(merged.reports).to.deep.equal([]);
  });

  it('reports two definitions of one group that disagree on weight', () => {
    const merged = merge([
      pkg('Pkg.One', { groups: [{ alias: 'shared', label: '#one', weight: 30 }] }),
      pkg('Pkg.Two', { groups: [{ alias: 'shared', label: '#two', weight: 31 }] }),
    ]);
    expect(merged.reports).to.have.lengthOf(1);
  });

  it('settles an app against a package entry by manifest weight, either way round', () => {
    const entryWins = merge(
      [pkg('Pkg.Catalogue', { manifestWeight: 9, entries: [{ alias: 'Shared.App', ref: 'Pkg.Section' }] })],
      [{ alias: 'Shared.App', manifestWeight: 1 }],
    );
    expect([...entryWins.droppedApps]).to.deep.equal(['Shared.App']);
    expect(entryWins.catalogue.entries.some((entry) => entry.alias === 'Shared.App')).to.equal(true);

    const appWins = merge(
      [pkg('Pkg.Catalogue', { manifestWeight: 1, entries: [{ alias: 'Shared.App', ref: 'Pkg.Section' }] })],
      [{ alias: 'Shared.App', manifestWeight: 9 }],
    );
    expect([...appWins.droppedApps]).to.deep.equal([]);
    expect(appWins.catalogue.entries.some((entry) => entry.alias === 'Shared.App')).to.equal(false);
  });
});

describe('a package entry opening the same screen as ours under another alias', () => {
  it('shows both, and suggests reusing our alias', () => {
    const merged = merge([pkg('Pkg.Catalogue', { entries: [{ alias: 'Pkg.Usync', ref: 'usync.menu.item', section: 'Umb.Section.Settings' }] })]);
    expect(merged.catalogue.entries.map((entry) => entry.alias)).to.deep.equal(['content', 'usync', 'Pkg.Usync']);
    expect(merged.reports).to.have.lengthOf(1);
    expect(merged.reports[0].message).to.contain('alias "usync"');
  });

  it('does not invite a package to take over a core tile', () => {
    const merged = merge([pkg('Pkg.Catalogue', { entries: [{ alias: 'Pkg.Content', ref: 'Umb.Section.Content' }] })]);
    expect(merged.reports).to.have.lengthOf(1);
    expect(merged.reports[0].message).to.contain('already has').and.not.to.contain('give your entry');
  });
});

it('keeps a fixed order: ours in place, then packages by precedence, each in its own order', () => {
  const merged = merge([
    pkg('Pkg.Second', { manifestWeight: 1, entries: [{ alias: 'S.One', ref: 'S1' }, { alias: 'S.Two', ref: 'S2' }] }),
    pkg('Pkg.First', { manifestWeight: 9, entries: [{ alias: 'F.One', ref: 'F1' }, { alias: 'content', ref: 'Umb.Section.Content' }] }),
  ]);
  expect(merged.catalogue.entries.map((entry) => entry.alias)).to.deep.equal(['content', 'usync', 'F.One', 'S.One', 'S.Two']);
});

it('passes the curated exclusions through', () => {
  expect(merge([pkg('Pkg.Catalogue')]).catalogue.excludedSections).to.deep.equal(CURATED.excludedSections);
});

/** Design D13 for a clash between packages too: the line says what each side wanted. */
it('says what each side of a clash wanted, and a missing weight in words', () => {
  const entries = merge([
    pkg('Pkg.High', { manifestWeight: 9, entries: [{ alias: 'Shared.App', ref: 'High.Section' }] }),
    pkg('Pkg.Low', { manifestWeight: 1, entries: [{ alias: 'Shared.App', ref: 'Low.Section' }] }),
  ]);
  expect(entries.reports[0].message).to.contain('ref "High.Section"').and.to.contain('ref "Low.Section"');

  const groups = merge([pkg('Pkg.Catalogue', { groups: [{ alias: 'system', label: '#system' }] })]);
  expect(groups.reports[0].message).to.contain('to no weight');
});
