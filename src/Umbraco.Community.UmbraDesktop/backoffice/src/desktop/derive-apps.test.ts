import { expect } from '@open-wc/testing';
import { deriveApps } from './derive-apps';
import { UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS } from './constants';
import type {
  UmbraDesktopCatalogueEntry,
  UmbraDesktopResolvedEntry,
  UmbraDesktopSectionInfo,
} from './types';

const SECTIONS: UmbraDesktopSectionInfo[] = [
  { alias: 'Umb.Section.Content', label: 'Content', pathname: 'content' },
  { alias: 'Umb.Section.Settings', label: 'Settings', pathname: 'settings' },
];

function entry(over: Partial<UmbraDesktopCatalogueEntry> = {}): UmbraDesktopCatalogueEntry {
  return { alias: 'e', categoryAlias: 'cat', ...over };
}

function resolved(over: Partial<UmbraDesktopResolvedEntry> = {}): UmbraDesktopResolvedEntry {
  return { entry: entry(), url: '/x', gateSectionAlias: 'Umb.Section.Content', isSectionRoot: false, ...over };
}

it('emits a certified app for a permitted, resolved entry', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'content', categoryAlias: 'content' }), url: '/umbraco/section/content', gateSectionAlias: 'Umb.Section.Content', isSectionRoot: true })],
    SECTIONS,
  );
  const app = apps.find((a) => a.alias === 'content')!;
  expect(app.confidence).to.equal('certified');
  expect(app.url).to.equal('/umbraco/section/content');
  expect(app.categoryAlias).to.equal('content');
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
  expect(fallback.map((a) => a.url)).to.have.members([
    '/umbraco/section/content',
    '/umbraco/section/settings',
  ]);
  expect(fallback.every((a) => a.categoryAlias === UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS)).to.be.true;
});

it('does NOT add a fallback for a section already covered by a section-root entry', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'content' }), gateSectionAlias: 'Umb.Section.Content', url: '/umbraco/section/content', isSectionRoot: true })],
    SECTIONS,
  );
  const contentFallback = apps.filter(
    (a) => a.confidence === 'uncertified' && a.url === '/umbraco/section/content',
  );
  expect(contentFallback).to.have.length(0);
  expect(apps.some((a) => a.confidence === 'uncertified' && a.url === '/umbraco/section/settings')).to.be.true;
});

it('still falls back a section that only has a non-root (e.g. dashboard) certified entry', () => {
  const apps = deriveApps(
    [resolved({ entry: entry({ alias: 'welcome' }), gateSectionAlias: 'Umb.Section.Settings', url: '/umbraco/section/settings/dashboard/welcome', isSectionRoot: false })],
    SECTIONS,
  );
  expect(apps.some((a) => a.alias === 'welcome' && a.confidence === 'certified')).to.be.true;
  expect(apps.some((a) => a.confidence === 'uncertified' && a.url === '/umbraco/section/settings')).to.be.true;
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
  expect(apps.some((a) => a.url === '/umbraco/section/settings')).to.be.false;
  // non-excluded permitted sections still get their fallback
  expect(apps.some((a) => a.url === '/umbraco/section/content')).to.be.true;
});
