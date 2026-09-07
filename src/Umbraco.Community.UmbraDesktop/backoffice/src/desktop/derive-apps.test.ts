import { expect } from '@open-wc/testing';
import { deriveApps } from './derive-apps';
import { UMBRADESKTOP_MORE_GROUP_ALIAS } from './constants';
import type {
  UmbraDesktopApp,
  UmbraDesktopCatalogueEntry,
  UmbraDesktopRegisteredApp,
  UmbraDesktopResolvedEntry,
  UmbraDesktopSectionInfo,
} from './types';

/**
 * Whether an app's body is an iframe pointing at `url`.
 *
 * Every app derivation produces is an iframe app, so the kind check is never the interesting half
 * of these assertions, only the narrowing that lets the compiler see `url` at all. Doing it once
 * here rather than inline six times is what keeps those assertions about the URL they check.
 * @param a The derived app.
 * @param url The URL the body is expected to point at.
 * @returns True when the app is an iframe app at that URL.
 */
const iframeAt = (a: UmbraDesktopApp, url: string) => a.content.kind === 'iframe' && a.content.url === url;

const SECTIONS: UmbraDesktopSectionInfo[] = [
  { alias: 'Umb.Section.Content', label: 'Content', pathname: 'content' },
  { alias: 'Umb.Section.Settings', label: 'Settings', pathname: 'settings' },
];

function entry(over: Partial<UmbraDesktopCatalogueEntry> = {}): UmbraDesktopCatalogueEntry {
  return { alias: 'e', group: 'grp', ...over };
}

function resolved(over: Partial<UmbraDesktopResolvedEntry> = {}): UmbraDesktopResolvedEntry {
  return { entry: entry(), url: '/x', gateSectionAlias: 'Umb.Section.Content', isSectionRoot: false, ...over };
}

it('emits a certified app whose content is an iframe pointing at the resolved URL', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'content', group: 'editing' }), url: '/umbraco/section/content', gateSectionAlias: 'Umb.Section.Content', isSectionRoot: true })],
    SECTIONS,
  );
  const app = apps.find((a) => a.alias === 'content')!;
  expect(app.confidence).to.equal('certified');
  expect(app.content).to.deep.equal({ kind: 'iframe', url: '/umbraco/section/content' });
  expect(app.group).to.equal('editing');
  expect(app.sourceSection).to.equal('Umb.Section.Content');
});

it('skips an entry whose gate section is not permitted', () => {
  const apps = deriveApps(
    [resolved({ gateSectionAlias: 'Umb.Section.Media' })],
    SECTIONS,
  );
  expect(apps.some((a) => a.confidence === 'certified')).to.be.false;
});

it('skips an entry that did not resolve to a URL', () => {
  const apps = deriveApps([resolved({ url: null })], SECTIONS);
  expect(apps.some((a) => a.confidence === 'certified')).to.be.false;
});

it('adds an uncertified fallback for a permitted section with no section-root entry', () => {
  const apps = deriveApps([], SECTIONS);
  const fallback = apps.filter((a) => a.confidence === 'uncertified');
  expect(fallback.map((a) => a.content)).to.have.deep.members([
    { kind: 'iframe', url: '/umbraco/section/content' },
    { kind: 'iframe', url: '/umbraco/section/settings' },
  ]);
  expect(fallback.every((a) => a.group === UMBRADESKTOP_MORE_GROUP_ALIAS)).to.be.true;
  expect(fallback.every((a) => a.icon === 'icon-box')).to.be.true;
  const settingsFallback = fallback.find((a) => iframeAt(a, '/umbraco/section/settings'))!;
  expect(settingsFallback.sourceSection).to.equal('Umb.Section.Settings');
});

it('does NOT add a fallback for a section already covered by a section-root entry', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'content' }), gateSectionAlias: 'Umb.Section.Content', url: '/umbraco/section/content', isSectionRoot: true })],
    SECTIONS,
  );
  const contentFallback = apps.filter((a) => a.confidence === 'uncertified' && iframeAt(a, '/umbraco/section/content'));
  expect(contentFallback).to.have.length(0);
  expect(apps.some((a) => a.confidence === 'uncertified' && iframeAt(a, '/umbraco/section/settings'))).to.be.true;
});

it('still falls back a section that only has a non-root (e.g. dashboard) certified entry', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'welcome' }), gateSectionAlias: 'Umb.Section.Settings', url: '/umbraco/section/settings/dashboard/welcome', isSectionRoot: false })],
    SECTIONS,
  );
  expect(apps.some((a) => a.alias === 'welcome' && a.confidence === 'certified')).to.be.true;
  expect(apps.some((a) => a.confidence === 'uncertified' && iframeAt(a, '/umbraco/section/settings'))).to.be.true;
});

it('prefers entry overrides over inherited name/icon', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'c', name: 'Override', icon: 'icon-star' }), inheritedName: 'Inherited', inheritedIcon: 'icon-doc' })],
    SECTIONS,
  );
  const app = apps.find((a) => a.alias === 'c')!;
  expect(app.name).to.equal('Override');
  expect(app.icon).to.equal('icon-star');
});

it('falls back to inherited name/icon when the entry omits them', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'c' }), inheritedName: 'Inherited', inheritedIcon: 'icon-doc' })],
    SECTIONS,
  );
  const app = apps.find((a) => a.alias === 'c')!;
  expect(app.name).to.equal('Inherited');
  expect(app.icon).to.equal('icon-doc');
});

it('omits fallback apps for excluded sections', () => {
  const apps = deriveApps([], SECTIONS, ['Umb.Section.Settings']);
  expect(apps.some((a) => iframeAt(a, '/umbraco/section/settings'))).to.be.false;
  // non-excluded permitted sections still get their fallback
  expect(apps.some((a) => iframeAt(a, '/umbraco/section/content'))).to.be.true;
});

it('carries an entry minSize through to the derived app', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'c', minSize: { w: 900, h: 540 } }) })],
    SECTIONS,
  );
  expect(apps.find((a) => a.alias === 'c')!.minSize).to.deep.equal({ w: 900, h: 540 });
});

/**
 * A loader in the module shape Umbraco's resolver looks for. Never invoked here: derivation copies
 * this value and only its identity is asserted, but it is typed as a real `ElementLoaderProperty`
 * so the compiler keeps checking that what derivation carries is what a manifest can hold.
 */
const MINESWEEPER_LOADER = async () => ({ element: HTMLElement });

const MINESWEEPER: UmbraDesktopRegisteredApp = {
  alias: 'Pkg.Minesweeper',
  name: '#pkg_minesweeper',
  icon: 'icon-bomb',
  element: MINESWEEPER_LOADER,
  group: 'games',
  weight: 10,
};

it('derives a registered app with no section gate at all', () => {
  const apps = deriveApps([], [], [], [MINESWEEPER]);
  const app = apps.find((a) => a.alias === 'Pkg.Minesweeper')!;
  expect(app, 'a registered app must not need a permitted section').to.not.be.undefined;
  expect(app.content.kind).to.equal('element');
  expect(app.sourceSection, 'there is no section behind it').to.be.undefined;
  expect(app.confidence).to.equal('certified');
  expect(app.group).to.equal('games');
});

it('places registered apps ahead of the uncertified section fallback', () => {
  const apps = deriveApps([], SECTIONS, [], [MINESWEEPER]);
  const registeredAt = apps.findIndex((a) => a.alias === 'Pkg.Minesweeper');
  const firstFallbackAt = apps.findIndex((a) => a.confidence === 'uncertified');
  expect(registeredAt).to.be.lessThan(firstFallbackAt);
});

it('gives a registered app the bare chrome profile, which nothing on that path reads', () => {
  const apps = deriveApps([], [], [], [MINESWEEPER]);
  // Found by alias rather than read off index 0, as its siblings do: this app is only first
  // because no earlier pass emitted anything here, and a later pass added ahead of the registered
  // one would turn this into an assertion about a different app's chrome profile.
  expect(apps.find((a) => a.alias === 'Pkg.Minesweeper')!.chromeProfile).to.equal('bare');
});

it('carries the loader through to content.element by reference, not a wrapper', () => {
  const apps = deriveApps([], [], [], [MINESWEEPER]);
  const app = apps.find((a) => a.alias === 'Pkg.Minesweeper')!;
  expect(app.content.kind).to.equal('element');
  if (app.content.kind === 'element') {
    expect(app.content.element, 'must be the registered app loader itself, not a wrapper').to.equal(
      MINESWEEPER_LOADER,
    );
  }
});
